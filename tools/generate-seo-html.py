#!/usr/bin/env python3
"""Generate per-route tools HTML shells with Open Graph metadata for crawlers."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent
ORIGIN = "https://earentir.dev"

# Keep in sync with tools/seo.js
PAGES = [
    {
        "id": "home",
        "out": ROOT / "index.html",
        "path": "/tools/",
        "title": "Earentir Tools",
        "description": "Turbo Pascal-style utilities: Discord time, tile calculator, watchlist sync, and more.",
        "image": "/tools/og-default.png",
    },
    {
        "id": "dmt",
        "out": ROOT / "dmt" / "index.html",
        "path": "/tools/dmt",
        "title": "Discord Magic Time",
        "description": "Convert dates and times into Discord timestamp codes for chat messages.",
        "image": "/tools/og-dmt.png",
    },
    {
        "id": "tiles",
        "out": ROOT / "tiles" / "index.html",
        "path": "/tools/tiles",
        "title": "Tiles Calculator",
        "description": "Calculate tile coverage, orientations, cuts, joint gap, skirting, and pricing for a space.",
        "image": "/tools/og-tiles.png",
    },
    {
        "id": "wl-sync",
        "out": ROOT / "wl-sync" / "index.html",
        "path": "/tools/wl-sync",
        "title": "IMDb → Jellyfin sync",
        "description": "Fetch a public IMDb watchlist or list, match titles in Jellyfin, and write a playlist.",
        "image": "/tools/og-wl-sync.png",
    },
    {
        "id": "wl-compare",
        "out": ROOT / "wl-compare" / "index.html",
        "path": "/tools/wl-compare",
        "title": "Compare watchlists",
        "description": "Compare two or more public IMDb lists: shared titles, unique items, and the full union.",
        "image": "/tools/og-wl-compare.png",
    },
    {
        "id": "api",
        "out": ROOT / "api" / "index.html",
        "path": "/tools/api",
        "title": "earapi docs",
        "description": "API documentation for earentir services (tilecalc, DMT, watchlist, and more).",
        "image": "/tools/og-api.png",
    },
]

# Bump these when shell assets change (also mirrored in generate output).
STYLES_V = "62"
APP_V = "75"

SHELL_BODY = r'''  <script>
    (function () {
      var storedTheme = localStorage.getItem('tools-theme') || localStorage.getItem('dmt-theme');
      var theme = storedTheme === 'light' || storedTheme === 'dark'
        ? storedTheme
        : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      document.documentElement.setAttribute('data-theme', theme);

      var storedFont = localStorage.getItem('tools-font');
      if (storedFont === 'fairfax') {
        storedFont = 'vga';
        localStorage.setItem('tools-font', 'vga');
      }
      var font = storedFont === 'tiny5' || storedFont === 'vga' ? storedFont : 'vga';
      document.documentElement.setAttribute('data-font', font);

      var storedDesktop = localStorage.getItem('tools-desktop');
      var desktop = storedDesktop === 'on' ? 'shadow' : 'plain';
      document.documentElement.setAttribute('data-desktop', desktop);
    })();
  </script>
  <link rel="stylesheet" href="/tools/styles.css?v=''' + STYLES_V + r'''">
  <meta http-equiv="Cache-Control" content="no-cache">
  <script type="module" src="/tools/app.js?v=''' + APP_V + r'''"></script>
</head>

<body>
  <div class="tp-desktop" id="tp-desktop" aria-hidden="true"></div>
  <div class="tp-shell">
    <header class="tp-menubar" id="tp-menubar" role="menubar" aria-label="Main menu">
      <nav class="tp-menus" id="tp-menus"></nav>
      <div class="tp-menubar-right">
        <button type="button" class="tp-lang-btn" id="lang-en" title="English" aria-label="English">
          <svg class="tp-flag" viewBox="0 0 60 40" aria-hidden="true">
            <rect width="60" height="40" fill="#012169"/>
            <path d="M0,0 L60,40 M60,0 L0,40" stroke="#fff" stroke-width="8"/>
            <path d="M0,0 L60,40 M60,0 L0,40" stroke="#C8102E" stroke-width="4"/>
            <path d="M30,0 V40 M0,20 H60" stroke="#fff" stroke-width="12"/>
            <path d="M30,0 V40 M0,20 H60" stroke="#C8102E" stroke-width="6"/>
          </svg>
        </button>
        <button type="button" class="tp-lang-btn" id="lang-el" title="Ελληνικά" aria-label="Ελληνικά">
          <svg class="tp-flag" viewBox="0 0 60 40" aria-hidden="true">
            <rect width="60" height="40" fill="#0D5EAF"/>
            <rect y="4.44" width="60" height="4.44" fill="#fff"/>
            <rect y="13.33" width="60" height="4.44" fill="#fff"/>
            <rect y="22.22" width="60" height="4.44" fill="#fff"/>
            <rect y="31.11" width="60" height="4.44" fill="#fff"/>
            <rect width="24" height="22.22" fill="#0D5EAF"/>
            <rect x="9.6" width="4.8" height="22.22" fill="#fff"/>
            <rect y="8.89" width="24" height="4.44" fill="#fff"/>
          </svg>
        </button>
      </div>
    </header>

    <main class="tp-workspace" id="tool-root"></main>

    <footer class="tp-status" aria-live="polite">
      <span class="tp-status-text" id="tp-status"></span>
      <button type="button" class="tp-theme-btn tp-font-btn" id="font-footer-btn" aria-label="Toggle font" title="Toggle font">
        <span class="tp-font-label" aria-hidden="true">Aa</span>
      </button>
      <button type="button" class="tp-theme-btn" id="theme-footer-btn" aria-label="Toggle theme" title="Toggle theme">
        <svg class="tp-theme-icon tp-theme-icon-sun" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="3" fill="currentColor"/>
          <g stroke="currentColor" stroke-width="1.5" stroke-linecap="square">
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"/>
          </g>
        </svg>
        <svg class="tp-theme-icon tp-theme-icon-moon" viewBox="0 0 16 16" aria-hidden="true">
          <path fill="currentColor" d="M11.5 9.2A5.2 5.2 0 0 1 6.8 2.2 5.5 5.5 0 1 0 13.8 9.8a5.2 5.2 0 0 1-2.3-.6z"/>
        </svg>
      </button>
    </footer>
  </div>
</body>

</html>
'''


def abs_url(path: str) -> str:
    if path.startswith("http"):
        return path
    return ORIGIN + path


def render(page: dict) -> str:
    title = page["title"]
    doc_title = title if page["id"] == "home" else f"{title} — Earentir Tools"
    description = page["description"]
    canonical = abs_url(page["path"])
    image = abs_url(page["image"])

    head = f'''<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{doc_title}</title>
  <meta name="description" content="{description}">
  <link rel="canonical" href="{canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Earentir Tools">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{image}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title}">
  <meta name="twitter:description" content="{description}">
  <meta name="twitter:image" content="{image}">
'''
    return head + SHELL_BODY


def main() -> None:
    for page in PAGES:
        page["out"].parent.mkdir(parents=True, exist_ok=True)
        page["out"].write_text(render(page), encoding="utf-8")
        print(f"wrote {page['out'].relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
