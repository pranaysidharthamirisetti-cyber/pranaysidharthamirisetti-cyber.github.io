/* =========================================================================
   space.js — live starfield background
   Pure canvas 2D: parallax stars, constellation links, drifting nebula dust
   and the occasional shooting star. Respects prefers-reduced-motion and
   re-tints itself whenever the site theme changes.
   ========================================================================= */
(function () {
  "use strict";

  var canvas = document.getElementById("space");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.style.display = "none";
    return;
  }

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduceMotion = motionQuery.matches;

  var dpr = 1;
  var width = 0;
  var height = 0;

  var stars = [];
  var dust = [];
  var shooters = [];
  var nextShootAt = 0;

  var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var scrollY = 0;
  var drift = 0;
  var lastFrame = 0;
  var rafId = null;
  var running = false;

  /* ----------------------------- palette ------------------------------- */
  function palette() {
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    return isLight
      ? {
          star: "38, 68, 180",
          accent: "0, 132, 168",
          violet: "124, 58, 237",
          line: "50, 78, 190",
          maxAlpha: 0.5,
          blend: "source-over"
        }
      : {
          star: "228, 238, 255",
          accent: "128, 226, 255",
          violet: "178, 132, 255",
          line: "146, 172, 255",
          maxAlpha: 0.95,
          blend: "lighter"
        };
  }

  var pal = palette();

  /* ------------------------------ setup -------------------------------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildStars();
    if (reduceMotion) renderStatic();
  }

  function buildStars() {
    var area = width * height;
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    var count = Math.round(Math.min(isLight ? 110 : 190, Math.max(45, area / (isLight ? 17000 : 9500))));

    stars = [];
    for (var i = 0; i < count; i++) {
      var depth = 0.25 + Math.random() * 0.75;
      stars.push({
        x: Math.random(),
        y: Math.random(),
        depth: depth,
        radius: (0.4 + Math.random() * 1.5) * (0.6 + depth * 0.7),
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.5,
        hue: Math.random() > 0.86 ? "accent" : Math.random() > 0.94 ? "violet" : "star",
        speedY: 0.00001 + Math.random() * 0.00004
      });
    }

    dust = [];
    for (var d = 0; d < 10; d++) {
      dust.push({
        x: Math.random(),
        y: Math.random(),
        r: 30 + Math.random() * 90,
        depth: 0.15 + Math.random() * 0.4,
        hue: Math.random() > 0.5 ? "accent" : "violet"
      });
    }
  }

  /* ------------------------------ drawing ------------------------------ */
  function starColor(name) {
    return name === "accent" ? pal.accent : name === "violet" ? pal.violet : pal.star;
  }

  function drawDust() {
    ctx.globalCompositeOperation = pal.blend;
    for (var i = 0; i < dust.length; i++) {
      var p = dust[i];
      var px = ((p.x + pointer.x * 0.02 * p.depth) % 1) * width;
      var py = ((p.y + scrollY * 0.00006 * p.depth) % 1) * height;
      var gradient = ctx.createRadialGradient(px, py, 0, px, py, p.r);
      gradient.addColorStop(0, "rgba(" + starColor(p.hue) + ", 0.09)");
      gradient.addColorStop(1, "rgba(" + starColor(p.hue) + ", 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(px, py, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function project(star) {
    var nx = (star.x + pointer.x * 0.012 * star.depth) % 1;
    var ny = (star.y + drift * star.depth + scrollY * 0.00009 * star.depth) % 1;
    if (nx < 0) nx += 1;
    if (ny < 0) ny += 1;
    return { x: nx * width, y: ny * height };
  }

  function drawStars(time, step) {
    ctx.globalCompositeOperation = pal.blend;

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var pos = project(s);
      var twinkle = 0.55 + 0.45 * Math.sin(time * 0.0012 * s.speed + s.phase);
      var alpha = Math.min(1, pal.maxAlpha * (0.35 + s.depth * 0.65) * twinkle);
      var color = starColor(s.hue);

      ctx.fillStyle = "rgba(" + color + ", " + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, s.radius, 0, Math.PI * 2);
      ctx.fill();

      // Brightest, closest stars get a soft halo.
      if (s.depth > 0.82 && !reduceMotion) {
        ctx.fillStyle = "rgba(" + color + ", " + (alpha * 0.12).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, s.radius * 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    drawLinks();
  }

  function drawLinks() {
    // Connect only the nearest layer so the cost stays predictable.
    var near = stars.filter(function (s) { return s.depth > 0.7; }).slice(0, 34);
    var maxDist = Math.min(150, width * 0.12);
    var maxDist2 = maxDist * maxDist;

    for (var i = 0; i < near.length; i++) {
      var a = project(near[i]);
      for (var j = i + 1; j < near.length; j++) {
        var b = project(near[j]);
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var dist2 = dx * dx + dy * dy;
        if (dist2 > maxDist2) continue;

        var strength = (1 - Math.sqrt(dist2) / maxDist) * (pal.blend === "lighter" ? 0.24 : 0.16);
        ctx.strokeStyle = "rgba(" + pal.line + ", " + strength.toFixed(3) + ")";
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  function spawnShooter() {
    var fromLeft = Math.random() > 0.45;
    shooters.push({
      x: fromLeft ? Math.random() * width * 0.55 : width * (0.45 + Math.random() * 0.55),
      y: Math.random() * height * 0.45,
      vx: (fromLeft ? 1 : -1) * (5.5 + Math.random() * 4.5),
      vy: 2 + Math.random() * 2.6,
      life: 0,
      ttl: 55 + Math.random() * 45,
      len: 90 + Math.random() * 130
    });
  }

  function drawShooters() {
    for (var i = shooters.length - 1; i >= 0; i--) {
      var s = shooters[i];
      s.x += s.vx;
      s.y += s.vy;
      s.life += 1;

      var progress = s.life / s.ttl;
      var alpha = Math.sin(Math.PI * Math.min(1, progress)) * (pal.blend === "lighter" ? 0.85 : 0.55);
      var tailX = s.x - (s.vx / Math.hypot(s.vx, s.vy)) * s.len;
      var tailY = s.y - (s.vy / Math.hypot(s.vx, s.vy)) * s.len;

      var gradient = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
      gradient.addColorStop(0, "rgba(" + pal.star + ", " + alpha.toFixed(3) + ")");
      gradient.addColorStop(1, "rgba(" + pal.accent + ", 0)");

      ctx.globalCompositeOperation = pal.blend;
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.fillStyle = "rgba(" + pal.star + ", " + alpha.toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.7, 0, Math.PI * 2);
      ctx.fill();

      if (s.life > s.ttl || s.x < -200 || s.x > width + 200 || s.y > height + 200) {
        shooters.splice(i, 1);
      }
    }
  }

  /* ------------------------------- loop -------------------------------- */
  function renderStatic(time) {
    ctx.clearRect(0, 0, width, height);
    drawDust();
    drawStars(time || 0, 0);
  }

  function frame(time) {
    if (!running) return;
    var step = lastFrame ? Math.min((time - lastFrame) / 16.667, 3) : 1;
    lastFrame = time;

    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;
    drift += 0.0000045 * step;

    ctx.clearRect(0, 0, width, height);
    drawDust();
    drawStars(time, step);

    if (time > nextShootAt) {
      spawnShooter();
      nextShootAt = time + 4200 + Math.random() * 9000;
    }
    drawShooters();

    rafId = window.requestAnimationFrame(frame);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    lastFrame = 0;
    nextShootAt = performance.now() + 2500;
    rafId = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId !== null) window.cancelAnimationFrame(rafId);
    rafId = null;
  }

  /* ----------------------------- listeners ------------------------------ */
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 160);
  });

  window.addEventListener("pointermove", function (event) {
    pointer.tx = (event.clientX / width - 0.5) * 2;
    pointer.ty = (event.clientY / height - 0.5) * 2;
  }, { passive: true });

  window.addEventListener("pointerleave", function () {
    pointer.tx = 0;
    pointer.ty = 0;
  }, { passive: true });

  window.addEventListener("scroll", function () {
    scrollY = window.scrollY || window.pageYOffset || 0;
    if (reduceMotion) renderStatic();
  }, { passive: true });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  document.addEventListener("themechange", function () {
    pal = palette();
    buildStars();
    if (reduceMotion) renderStatic();
  });

  var onMotionChange = function () {
    reduceMotion = motionQuery.matches;
    if (reduceMotion) {
      stop();
      renderStatic();
    } else {
      start();
    }
  };
  if (typeof motionQuery.addEventListener === "function") {
    motionQuery.addEventListener("change", onMotionChange);
  } else if (typeof motionQuery.addListener === "function") {
    motionQuery.addListener(onMotionChange);
  }

  /* ------------------------------- init --------------------------------- */
  resize();
  if (reduceMotion) renderStatic();
  else start();
})();
