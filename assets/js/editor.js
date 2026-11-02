/* =========================================================================
   editor.js — turns the annotated index.html into a fill-in-the-blanks form.

   How it works
   ------------
   The editor fetches the real index.html, reads every element carrying a
   data-* annotation, and builds one labelled field per annotation. Edits are
   written straight back into an in-memory copy of the page, which is rendered
   live in the preview iframe. "Download" saves that copy back as index.html;
   "Publish" writes it to GitHub through the Contents API.

   Annotations understood:
     data-edit="Label"          -> plain text field
     data-edit-breaks="1"       -> text field where newlines become <br>
     data-edit-items="Label"    -> repeatable list of text items
     data-edit-url="Label"      -> URL field, applied to every matching link
     data-email-text            -> element that shows the contact email
   ========================================================================= */
(function () {
  "use strict";

  var SITE_FILE = "index.html";
  var BASE = new URL(".", window.location.href).href;
  var DRAFT_KEY = "site-editor-draft";
  var SETTINGS_KEY = "site-editor-settings";
  var TOKEN_KEY = "site-editor-token";
  var LF = String.fromCharCode(10);

  var els = {
    form: document.getElementById("edForm"),
    preview: document.getElementById("edPreview"),
    frameWrap: document.querySelector(".ed-frame-wrap"),
    status: document.getElementById("edStatus"),
    draftBox: document.getElementById("edDraft"),
    htmlArea: document.getElementById("edHtml"),
    themeBtn: document.getElementById("edTheme"),
    pub: {
      token: document.getElementById("pubToken"),
      owner: document.getElementById("pubOwner"),
      repo: document.getElementById("pubRepo"),
      branch: document.getElementById("pubBranch"),
      message: document.getElementById("pubMessage"),
      remember: document.getElementById("pubRemember"),
      button: document.getElementById("pubButton"),
      status: document.getElementById("pubStatus")
    }
  };

  var state = { doc: null, timer: null };

  /* ------------------------------ helpers ------------------------------- */
  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      if (ch === ">") return "&gt;";
      if (ch === '"') return "&quot;";
      return "&#39;";
    });
  }

  function collapse(text) {
    return String(text).replace(/\s+/g, " ").trim();
  }

  function serialize() {
    return "<!DOCTYPE html>" + LF + state.doc.documentElement.outerHTML + LF;
  }

  function parseDoc(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.querySelector("body") || !doc.documentElement) {
      throw new Error("That file does not look like an HTML page.");
    }
    return doc;
  }

  // Reads text from an element where <br> and real newlines both mean a line break.
  function textWithBreaks(node) {
    var out = "";
    Array.prototype.forEach.call(node.childNodes, function (child) {
      if (child.nodeType === 3) out += child.nodeValue;
      else if (child.nodeName === "BR") out += LF;
      else out += child.textContent;
    });

    return out
      .split(LF)
      .map(function (line) { return line.replace(/[ ]+$/, ""); })
      .join(LF)
      .replace(new RegExp(LF + "{3,}", "g"), LF + LF)
      .trim();
  }

  function setBreaksValue(node, value) {
    node.innerHTML = esc(value).split(LF).join("<br>");
  }

  function setStatus(text, kind) {
    els.status.textContent = text;
    els.status.classList.toggle("is-error", kind === "error");
    els.status.classList.toggle("is-ok", kind === "ok");
  }

  function groupLabel(id) {
    var labels = {
      home: "Hero",
      about: "About",
      skills: "Skills",
      research: "Research",
      education: "Education & involvement",
      contact: "Contact",
      footer: "Footer",
      page: "Other"
    };
    return labels[id] || id.charAt(0).toUpperCase() + id.slice(1);
  }

  function createGroup(parent, title) {
    var group = document.createElement("section");
    group.className = "ed-group";

    var heading = document.createElement("h2");
    heading.className = "ed-group-title";
    heading.textContent = title;

    group.appendChild(heading);
    parent.appendChild(group);
    return group;
  }

  function makeField(parent, label, value, options) {
    var opts = options || {};
    var wrap = document.createElement("label");
    wrap.className = "ed-field";

    var caption = document.createElement("span");
    caption.className = "ed-label";
    caption.textContent = label;
    wrap.appendChild(caption);

    var input = document.createElement(opts.multiline ? "textarea" : "input");
    if (!opts.multiline) input.type = opts.type || "text";
    if (opts.multiline) input.rows = opts.rows || 3;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    input.value = value == null ? "" : value;

    wrap.appendChild(input);
    parent.appendChild(wrap);
    return input;
  }

  /* ------------------------------- form --------------------------------- */
  function buildForm() {
    els.form.textContent = "";

    var siteGroup = createGroup(els.form, "Site-wide");
    addEmailField(siteGroup);
    addMetaFields(siteGroup);

    var nodes = state.doc.querySelectorAll(
      "[data-edit], [data-edit-breaks], [data-edit-items], [data-edit-url]"
    );

    var groups = {};
    var seenUrl = {};

    function groupFor(node) {
      var id = "page";
      var section = node.closest("section[id]");
      if (section) id = section.id;
      else if (node.closest("footer")) id = "footer";

      if (!groups[id]) groups[id] = createGroup(els.form, groupLabel(id));
      return groups[id];
    }

    Array.prototype.forEach.call(nodes, function (node) {
      if (node.hasAttribute("data-edit-url")) {
        var key = node.getAttribute("data-edit-url");
        if (seenUrl[key]) return;
        seenUrl[key] = true;
        addUrlField(siteGroup, key, node.getAttribute("href") || "");
        return;
      }
      if (node.hasAttribute("data-edit-items")) {
        addItemsField(groupFor(node), node);
        return;
      }
      addTextField(groupFor(node), node);
    });
  }

  function addEmailField(parent) {
    var anchor = state.doc.querySelector('a[href^="mailto:"]');
    var value = anchor ? decodeURIComponent(anchor.getAttribute("href").replace(/^mailto:/i, "")) : "";

    var input = makeField(parent, "Contact email (updates every email button)", value);
    input.type = "email";
    input.placeholder = "you@example.com";

    input.addEventListener("input", function () {
      var next = input.value.trim();
      Array.prototype.forEach.call(state.doc.querySelectorAll('a[href^="mailto:"]'), function (link) {
        link.setAttribute("href", "mailto:" + next);
      });
      Array.prototype.forEach.call(state.doc.querySelectorAll("[data-email]"), function (node) {
        node.setAttribute("data-email", next);
      });
      Array.prototype.forEach.call(state.doc.querySelectorAll("[data-email-text]"), function (node) {
        node.textContent = next;
      });
      onEdit();
    });
  }

  function addMetaFields(parent) {
    var titleEl = state.doc.querySelector("title");

    var titleInput = makeField(parent, "Browser tab title", titleEl ? titleEl.textContent.trim() : "");
    titleInput.addEventListener("input", function () {
      var value = titleInput.value;
      if (titleEl) titleEl.textContent = value;
      ["og:title", "twitter:title"].forEach(function (key) {
        var meta = state.doc.querySelector('meta[property="' + key + '"], meta[name="' + key + '"]');
        if (meta) meta.setAttribute("content", value);
      });
      onEdit();
    });

    var descEl = state.doc.querySelector('meta[name="description"]');
    var descInput = makeField(parent, "Search / social description", descEl ? descEl.getAttribute("content") : "", {
      multiline: true,
      rows: 3
    });
    descInput.addEventListener("input", function () {
      var value = descInput.value;
      if (descEl) descEl.setAttribute("content", value);
      ["og:description", "twitter:description"].forEach(function (key) {
        var meta = state.doc.querySelector('meta[property="' + key + '"], meta[name="' + key + '"]');
        if (meta) meta.setAttribute("content", value);
      });
      onEdit();
    });
  }

  function addTextField(parent, node) {
    var breaks = node.hasAttribute("data-edit-breaks");
    var label = node.getAttribute("data-edit") || node.getAttribute("data-edit-breaks") || "Text";
    var value = breaks ? textWithBreaks(node) : collapse(node.textContent);
    var multiline = breaks || value.length > 70;

    var input = makeField(parent, label, value, {
      multiline: multiline,
      rows: multiline ? Math.min(7, Math.max(2, Math.ceil(value.length / 58))) : 0
    });

    input.addEventListener("input", function () {
      if (breaks) setBreaksValue(node, input.value);
      else node.textContent = input.value;
      onEdit();
    });
  }

  function addUrlField(parent, key, value) {
    var input = makeField(parent, key, value, { type: "url" });

    input.addEventListener("input", function () {
      var next = input.value.trim();
      Array.prototype.forEach.call(state.doc.querySelectorAll("[data-edit-url]"), function (link) {
        if (link.getAttribute("data-edit-url") === key) link.setAttribute("href", next);
      });
      onEdit();
    });
  }

  function addItemsField(parent, container) {
    var wrap = document.createElement("div");
    wrap.className = "ed-field";

    var caption = document.createElement("span");
    caption.className = "ed-label";
    caption.textContent = container.getAttribute("data-edit-items") || "Items";
    wrap.appendChild(caption);

    var list = document.createElement("div");
    list.className = "ed-items";
    wrap.appendChild(list);

    function draw() {
      list.textContent = "";

      Array.prototype.forEach.call(container.children, function (child, index) {
        var row = document.createElement("div");
        row.className = "ed-item-row";

        var input = document.createElement("input");
        input.type = "text";
        input.value = collapse(child.textContent);
        input.setAttribute("aria-label", "Item " + (index + 1));
        input.addEventListener("input", function () {
          child.textContent = input.value;
          onEdit();
        });

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ed-icon-btn";
        remove.textContent = "x";
        remove.title = "Remove this item";
        remove.setAttribute("aria-label", "Remove item " + (index + 1));
        remove.addEventListener("click", function () {
          child.remove();
          onEdit();
          draw();
        });

        row.appendChild(input);
        row.appendChild(remove);
        list.appendChild(row);
      });

      var add = document.createElement("button");
      add.type = "button";
      add.className = "ed-add";
      add.textContent = "+ Add item";
      add.addEventListener("click", function () {
        var template = container.lastElementChild;
        var node = template ? template.cloneNode(false) : document.createElement("li");
        node.textContent = "New item";
        container.appendChild(node);
        onEdit();
        draw();
      });

      list.appendChild(add);
    }

    draw();
    parent.appendChild(wrap);
  }

  /* ------------------------------ preview -------------------------------- */
  var previewScroll = 0;

  els.preview.addEventListener("load", function () {
    try {
      els.preview.contentWindow.scrollTo(0, previewScroll);
    } catch (error) { /* cross-origin guard */ }
  });

  function renderPreview() {
    try {
      previewScroll = els.preview.contentWindow.scrollY || 0;
    } catch (error) { /* cross-origin guard */ }

    var html = serialize();
    var headStart = html.indexOf("<head");
    var headEnd = headStart === -1 ? -1 : html.indexOf(">", headStart);

    if (headEnd !== -1) {
      html = html.slice(0, headEnd + 1) + '<base href="' + BASE + '">' + html.slice(headEnd + 1);
    }

    els.preview.srcdoc = html;
  }

  function onEdit() {
    window.clearTimeout(state.timer);
    els.draftBox.hidden = true;

    state.timer = window.setTimeout(function () {
      var html = serialize();
      renderPreview();

      try { localStorage.setItem(DRAFT_KEY, html); } catch (e) { /* storage full or blocked */ }

      if (!document.getElementById("paneHtml").hidden) els.htmlArea.value = html;
      setStatus("Draft saved in this browser — download or publish to make it live.", "ok");
    }, 200);
  }

  /* ------------------------------- actions ------------------------------- */
  function download() {
    var blob = new Blob([serialize()], { type: "text/html;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = SITE_FILE;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    setStatus("Downloaded index.html — commit it to your repo to publish.", "ok");
  }

  function copyHtml() {
    var html = serialize();

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(html).then(function () {
        setStatus("HTML copied to the clipboard.", "ok");
      }, function () {
        setStatus("Copy failed — use the HTML tab and copy manually.", "error");
      });
      return;
    }

    var field = document.createElement("textarea");
    field.value = html;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    field.remove();
    setStatus(ok ? "HTML copied to the clipboard." : "Copy failed — use the HTML tab.", ok ? "ok" : "error");
  }

  async function loadSite() {
    setStatus("Loading index.html…");
    var response = await fetch(SITE_FILE + "?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load " + SITE_FILE + " (" + response.status + ").");
    var html = await response.text();

    state.doc = parseDoc(html);
    buildForm();
    renderPreview();
    syncThemeButton();
    setStatus("Loaded. Edits appear in the preview instantly and save as a draft.");
  }

  async function resetSite() {
    if (!window.confirm("Discard every edit and reload the current index.html?")) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    els.draftBox.hidden = true;

    try {
      await loadSite();
      setStatus("Reset to the published index.html.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function syncThemeButton() {
    var theme = state.doc ? state.doc.documentElement.getAttribute("data-theme") || "dark" : "dark";
    els.themeBtn.textContent = "Preview: " + theme;
  }

  function toggleTheme() {
    if (!state.doc) return;
    var root = state.doc.documentElement;
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) { /* ignore */ }
    syncThemeButton();
    renderPreview();
  }

  /* ------------------------------ publishing ----------------------------- */
  function toBase64(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function setPubStatus(text, kind) {
    els.pub.status.textContent = text;
    els.pub.status.classList.toggle("is-error", kind === "error");
    els.pub.status.classList.toggle("is-ok", kind === "ok");
  }

  function loadSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (saved.owner) els.pub.owner.value = saved.owner;
      if (saved.repo) els.pub.repo.value = saved.repo;
      if (saved.branch) els.pub.branch.value = saved.branch;
      if (saved.message) els.pub.message.value = saved.message;

      var token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || "";
      if (token) {
        els.pub.token.value = token;
        els.pub.remember.checked = Boolean(localStorage.getItem(TOKEN_KEY));
      }
    } catch (e) { /* ignore malformed settings */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        owner: els.pub.owner.value.trim(),
        repo: els.pub.repo.value.trim(),
        branch: els.pub.branch.value.trim(),
        message: els.pub.message.value.trim()
      }));
    } catch (e) { /* ignore */ }
  }

  function rememberToken() {
    var token = els.pub.token.value.trim();
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      if (!token) return;
      if (els.pub.remember.checked) localStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.setItem(TOKEN_KEY, token);
    } catch (e) { /* ignore */ }
  }

  async function publish() {
    var token = els.pub.token.value.trim();
    var owner = els.pub.owner.value.trim();
    var repo = els.pub.repo.value.trim();
    var branch = els.pub.branch.value.trim() || "main";

    if (!token || !owner || !repo) {
      setPubStatus("Add an access token, the owner and the repository name first.", "error");
      return;
    }

    rememberToken();
    saveSettings();
    els.pub.button.disabled = true;

    var api = "https://api.github.com/repos/" + owner + "/" + repo + "/contents/index.html";
    var headers = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json"
    };

    try {
      setPubStatus("Checking the repository…");

      var head = await fetch(api + "?ref=" + encodeURIComponent(branch), {
        headers: headers,
        cache: "no-store"
      });

      var sha = null;
      if (head.ok) {
        sha = (await head.json()).sha;
      } else if (head.status !== 404) {
        throw new Error("Cannot read index.html (" + head.status + "). Check the token scope, owner and repository name.");
      }

      var payload = {
        message: els.pub.message.value.trim() || "Update site content",
        content: toBase64(serialize()),
        branch: branch
      };
      if (sha) payload.sha = sha;

      setPubStatus("Uploading index.html…");
      var put = await fetch(api, {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, headers),
        body: JSON.stringify(payload)
      });

      if (!put.ok) {
        var detail = await put.text();
        throw new Error("Upload failed (" + put.status + "). " + detail.slice(0, 180));
      }

      try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
      els.draftBox.hidden = true;
      setPubStatus("Published. GitHub Pages usually redeploys in about a minute.", "ok");
      setStatus("Published to GitHub.", "ok");
    } catch (error) {
      setPubStatus(error.message, "error");
    } finally {
      els.pub.button.disabled = false;
    }
  }

  /* ------------------------------- wiring -------------------------------- */
  function switchTab(tab) {
    var panes = [
      { tab: document.getElementById("tabForm"), pane: document.getElementById("paneForm") },
      { tab: document.getElementById("tabHtml"), pane: document.getElementById("paneHtml") },
      { tab: document.getElementById("tabPublish"), pane: document.getElementById("panePublish") }
    ];

    panes.forEach(function (entry) {
      var active = entry.tab === tab;
      entry.tab.classList.toggle("is-active", active);
      entry.tab.setAttribute("aria-selected", String(active));
      entry.pane.hidden = !active;
    });

    if (tab === document.getElementById("tabHtml") && state.doc) {
      els.htmlArea.value = serialize();
    }
  }

  document.getElementById("tabForm").addEventListener("click", function () { switchTab(this); });
  document.getElementById("tabHtml").addEventListener("click", function () { switchTab(this); });
  document.getElementById("tabPublish").addEventListener("click", function () { switchTab(this); });

  els.form.addEventListener("submit", function (event) { event.preventDefault(); });

  document.getElementById("edDownload").addEventListener("click", download);
  document.getElementById("edCopy").addEventListener("click", copyHtml);
  document.getElementById("edReset").addEventListener("click", resetSite);
  document.getElementById("edTheme").addEventListener("click", toggleTheme);
  els.pub.button.addEventListener("click", publish);

  document.getElementById("edApplyHtml").addEventListener("click", function () {
    try {
      state.doc = parseDoc(els.htmlArea.value);
      buildForm();
      renderPreview();
      syncThemeButton();
      onEdit();
      setStatus("HTML applied to the preview.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  document.getElementById("edImport").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      try {
        state.doc = parseDoc(String(reader.result));
        buildForm();
        renderPreview();
        syncThemeButton();
        setStatus("Imported " + file.name + ". Review it, then download or publish.", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  });

  document.getElementById("edRestore").addEventListener("click", function () {
    try {
      var draft = localStorage.getItem(DRAFT_KEY);
      if (!draft) return;
      state.doc = parseDoc(draft);
      buildForm();
      renderPreview();
      syncThemeButton();
      els.draftBox.hidden = true;
      setStatus("Draft restored.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  document.getElementById("edDiscard").addEventListener("click", function () {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    els.draftBox.hidden = true;
    setStatus("Draft discarded. The preview still shows your edits until you reset.");
  });

  Array.prototype.forEach.call(document.querySelectorAll(".ed-vp"), function (button) {
    button.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".ed-vp"), function (other) {
        other.classList.toggle("is-active", other === button);
      });
      els.frameWrap.setAttribute("data-view", button.getAttribute("data-view"));
    });
  });

  document.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      download();
    }
  });

  /* -------------------------------- boot --------------------------------- */
  async function boot() {
    loadSettings();

    try {
      await loadSite();
    } catch (error) {
      setStatus(
        "Could not read index.html. Open this editor from a web address " +
        "(the local server or your GitHub Pages URL) rather than a file path. " +
        error.message,
        "error"
      );
      return;
    }

    try {
      var draft = localStorage.getItem(DRAFT_KEY);
      if (draft && draft !== serialize()) els.draftBox.hidden = false;
    } catch (e) { /* storage blocked */ }
  }

  boot();
})();
