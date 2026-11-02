# Shree Pranay Sidhartha Amirisetti — Personal Website

A standalone, zero-dependency personal portfolio site. Plain HTML, CSS and JavaScript, designed to be hosted on GitHub Pages with no build step.

**Design:** deep-space theme with a live animated canvas background (parallax starfield, constellation links, shooting stars, drifting nebula dust), plus a light "daylight" theme you can toggle. The choice is remembered per browser.

---

## What's inside

```
index.html                 Single-page portfolio: hero, about, skills, research, education, contact
404.html                   Self-contained "lost in space" page
editor.html                Form-based content editor (open it in a browser)
assets/css/styles.css      All styling, both themes, responsive + print rules
assets/css/editor.css      Chrome for the editor tool only
assets/js/space.js         Canvas starfield background
assets/js/main.js          Theme toggle, nav, scroll reveals, copy email, progress bar
assets/js/editor.js        Reads the data-edit annotations and drives the editor
assets/favicon.svg         Monogram favicon
.nojekyll                  Tells GitHub Pages to serve files as-is (no Jekyll processing)
```

No frameworks, no npm, no build step. Everything is relative-path based, so the site works at a domain root (`username.github.io`) **and** under a project subpath (`username.github.io/repo-name/`).

---

## Preview locally

Any static file server works, for example:

```powershell
# Python 3
python -m http.server 8080

# or Node (no install needed)
npx serve .
```

Then open <http://localhost:8080>.

Opening `index.html` directly from disk also works, but a local server is closer to production.

---

## Edit the page with a form (no code)

Open **`/editor.html`** on your live site (for example `https://pranaysidharthamirisetti-cyber.github.io/Sidharth_Amirisetti.github.io/editor.html`) or at <http://localhost:8080/editor.html> while previewing locally.

1. The editor loads the current `index.html` and builds a labelled form from every `data-edit` annotation, grouped by section.
2. Type in a field and the preview on the right updates live. Use Desktop / Tablet / Mobile to check layouts, and the theme button to inspect light mode.
3. Choose one of these to ship it:
   - **Download index.html** — replaces the file in your repo; commit and push.
   - **Copy HTML** — paste it into GitHub's web editor.
   - **Publish tab** — writes straight to the repo through the GitHub API. Needs a fine-grained personal access token with *Contents: Read and write* on this repository. The token is kept in session storage unless you tick "remember".

Edits autosave as a browser draft, so a refresh will not lose your work. **Reset** reloads the published file.

How the annotations work, if you ever need to add a field:

| Attribute | Result in the form |
| --- | --- |
| `data-edit="Label"` | Single text field. Add it to a `<span>` if the element also contains icons. |
| `data-edit-breaks="1"` | Textarea where each new line becomes a `<br>`. |
| `data-edit-items="Label"` | Repeatable list — one input per child element, with add/remove. |
| `data-edit-url="Label"` | URL field; one field updates every link sharing that label. |
| `data-email-text` | Element whose text mirrors the contact email field. |

`editor.html` is marked `noindex`, but it is publicly reachable like any static file. It cannot change your site without your token, so it is safe to leave deployed; delete it if you would rather keep it private.

---

## Make it yours

Everything is also annotated for the form editor. If you prefer text edits, search for `TODO` comments in `index.html`, or just use `/editor.html`. Either way, update:

1. **Email** — currently `hello@example.com` in five places (hero icon, contact button text and href, `data-email` attribute, and the contact social link).
2. **Social profiles** — GitHub (`pranaysidharthamirisetti-cyber`), LinkedIn and ResearchGate are already wired to the real profiles.
3. **Research** — three published review papers, each linked to its ResearchGate page. Titles, dates and abstracts were taken from the public publication records, so verify the wording before publishing.
4. **Education & involvement** — degree details (VNRVJIET, 2025–2029) and Kakşyā Śāstra membership.
5. **Skills** — four grouped cards of chips: Python & data, machine learning, robotics & space, tools & research. Adjust to match what you can defend in an interview.
6. **About** — the two paragraphs and the "fast facts" list.
7. **Hero** — the rotating phrases (`role-word` elements) and the availability line.
8. **Page metadata** — `<title>`, `<meta name="description">`, and the Open Graph / Twitter tags in `<head>`.

Tip: to hide a section you don't need, delete the whole `<section>` block and remove its `<li>` from the nav.

---

## Deploy to GitHub Pages

The repository already has `origin` set. Once you've customised the content:

```powershell
git add .
git commit -m "Build personal website"
git push
```

Then enable Pages once (either route):

- **Web UI:** repo → *Settings* → *Pages* → *Source: Deploy from a branch* → Branch: `main` / folder: `/ (root)` → *Save*.
- **CLI** (GitHub CLI installed and authenticated):

```powershell
gh api -X POST repos/pranaysidharthamirisetti-cyber/Sidharth_Amirisetti.github.io/pages `
  -f "source[branch]=main" -f "source[path]=/"
```

The site goes live in a minute or two.

### Important: which URL you get

GitHub only serves the clean root URL when the repository name **exactly** matches your username:

| Repository name | URL |
| --- | --- |
| `pranaysidharthamirisetti-cyber.github.io` | `https://pranaysidharthamirisetti-cyber.github.io/` |
| `Sidharth_Amirisetti.github.io` (current) | `https://pranaysidharthamirisetti-cyber.github.io/Sidharth_Amirisetti.github.io/` |

The current repo name is a *project* site because it doesn't match the account name. Two options:

- **Keep it** — nothing to change; the site already works under the subpath.
- **Get the root URL** — rename the repo (Settings → General → Repository name) to `pranaysidharthamirisetti-cyber.github.io`, then update your remote:

  ```powershell
  git remote set-url origin https://github.com/pranaysidharthamirisetti-cyber/pranaysidharthamirisetti-cyber.github.io.git
  git push -u origin main
  ```

  Only one repo per account can use that name, and it must be public on a free plan.

### Custom domain (optional)

1. Repo → *Settings* → *Pages* → *Custom domain*, enter your domain → *Save*.
2. At your DNS provider add `CNAME` records for `www` (and `A` records for the apex: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`).
3. Wait for the DNS check, then tick *Enforce HTTPS*.

GitHub writes a `CNAME` file into the branch — commit it, otherwise a later push may remove it.

---

## Notes

- **Accessibility:** skip link, semantic landmarks, visible focus rings, ARIA state on the theme and nav toggles, `prefers-reduced-motion` support (the starfield renders a single static frame).
- **Performance:** no external JS, one web-font request, canvas capped at 2× device pixel ratio and paused when the tab is hidden.
- **Printing:** `Ctrl+P` produces a clean, light version of the page (handy for saving as a PDF résumé).
