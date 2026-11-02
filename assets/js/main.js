/* =========================================================================
   main.js — interface behaviour
   Theme switching, sticky navigation, scroll reveals, active section
   tracking, rotating hero text, copy-to-clipboard and scroll progress.
   ========================================================================= */
(function () {
  "use strict";

  var root = document.documentElement;
  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------ theme -------------------------------- */
  var themeToggle = document.getElementById("themeToggle");
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');
  var THEME_COLORS = { dark: "#05060f", light: "#f2f5ff" };

  function applyTheme(theme, persist) {
    root.setAttribute("data-theme", theme);

    if (themeToggle) {
      var goingLight = theme === "dark";
      themeToggle.setAttribute("aria-label", goingLight ? "Switch to light theme" : "Switch to dark theme");
      themeToggle.setAttribute("aria-pressed", String(theme === "light"));
    }
    if (themeColorMeta) themeColorMeta.setAttribute("content", THEME_COLORS[theme]);

    if (persist) {
      try { localStorage.setItem("theme", theme); } catch (e) { /* ignore */ }
    }

    document.dispatchEvent(new CustomEvent("themechange", { detail: { theme: theme } }));
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      applyTheme(next, true);
    });
    // Sync ARIA state with whatever the head script picked.
    applyTheme(root.getAttribute("data-theme") || "dark", false);
  }

  /* ---------------------------- navigation ------------------------------ */
  var header = document.querySelector(".site-header");
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");
  var navLinkItems = Array.prototype.slice.call(document.querySelectorAll(".nav-link"));

  function closeMenu() {
    if (!navLinks || !navToggle) return;
    navLinks.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    document.body.style.removeProperty("overflow");
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", String(open));
      if (open) document.body.style.overflow = "hidden";
      else document.body.style.removeProperty("overflow");
    });

    navLinkItems.forEach(function (link) {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeMenu();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 860) closeMenu();
    });
  }

  /* --------------------------- active section -------------------------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));

  if ("IntersectionObserver" in window && sections.length) {
    var spyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        navLinkItems.forEach(function (link) {
          link.classList.toggle("is-active", link.getAttribute("href") === "#" + id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    sections.forEach(function (section) { spyObserver.observe(section); });
  }

  /* ------------------------- scroll interface -------------------------- */
  var progressBar = document.getElementById("progressBar");
  var scrollTicking = false;

  function onScrollFrame() {
    var y = window.scrollY || window.pageYOffset || 0;

    if (header) header.classList.toggle("is-stuck", y > 8);

    if (progressBar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      progressBar.style.width = (ratio * 100).toFixed(2) + "%";
    }

    scrollTicking = false;
  }

  window.addEventListener("scroll", function () {
    if (!scrollTicking) {
      scrollTicking = true;
      window.requestAnimationFrame(onScrollFrame);
    }
  }, { passive: true });

  onScrollFrame();

  /* ----------------------------- reveals ------------------------------- */
  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal"));

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(function (el) { el.classList.add("is-visible"); });
  } else {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });

    revealItems.forEach(function (el, index) {
      // Stagger siblings so grids cascade instead of popping in together.
      var siblings = el.parentElement ? el.parentElement.children : [];
      var position = Array.prototype.indexOf.call(siblings, el);
      el.style.setProperty("--reveal-delay", Math.min(position, 5) * 80 + "ms");
      revealObserver.observe(el);
    });
  }

  /* -------------------------- rotating hero ---------------------------- */
  var roleWords = Array.prototype.slice.call(document.querySelectorAll(".role-word"));

  if (roleWords.length > 1) {
    var current = 0;
    var swapTimer = null;

    var advance = function () {
      roleWords[current].classList.remove("is-active");
      current = (current + 1) % roleWords.length;
      roleWords[current].classList.add("is-active");
    };

    if (!prefersReducedMotion) {
      var schedule = function () {
        swapTimer = window.setInterval(advance, 3400);
      };

      document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
          window.clearInterval(swapTimer);
          swapTimer = null;
        } else if (!swapTimer) {
          schedule();
        }
      });

      schedule();
    }

    // Clicking the phrase cycles it too - handy for visitors who prefer control.
    var roleSwap = document.querySelector(".role-swap");
    if (roleSwap) {
      roleSwap.style.cursor = "pointer";
      roleSwap.setAttribute("title", "Click for the next phrase");
      roleSwap.addEventListener("click", advance);
    }
  }

  /* --------------------------- copy email ------------------------------ */
  var copyButton = document.getElementById("copyEmail");

  if (copyButton) {
    var label = copyButton.querySelector(".copy-label");
    var resetTimer = null;

    copyButton.addEventListener("click", function () {
      var email = copyButton.getAttribute("data-email") || "";
      var done = function (ok) {
        if (!label) return;
        label.textContent = ok ? "Copied!" : "Press Ctrl+C";
        window.clearTimeout(resetTimer);
        resetTimer = window.setTimeout(function () {
          label.textContent = "Copy email";
        }, 2200);
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(email).then(function () { done(true); }, function () { done(false); });
      } else {
        var field = document.createElement("textarea");
        field.value = email;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
        document.body.removeChild(field);
        done(ok);
      }
    });
  }

  /* ------------------------------ footer ------------------------------- */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
