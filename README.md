# Focus — Digital Wellbeing

A Firefox and Chrome extension that helps you stay focused by tracking time spent on websites, blocking distracting domains, and taming YouTube distractions with granular Focus Mode controls.

## Features

- **Website usage tracking** — see how much time you spend on each site, broken down by day
- **Usage history** — the last 30 days are kept locally and can be exported as JSON log files
- **Domain blocking** — maintain a blocklist of distracting sites with subdomain matching
- **YouTube Focus Mode** — selectively hide feed, sidebar, comments, Shorts, endscreen, trending, merch, and more — each toggle independent
- **Dark / light mode** — theme toggle with preference persistence
- **Calm blocked page** — a minimal, CSP-compliant interstitial when you visit a blocked site

## Documentation

- [Design process](docs/design-process.md)
- [Architecture decisions](adr.md)
- [Data schema](schema.md)

## Development

### Prerequisites

- Node.js (v18+)
- npm

### Getting started

```bash
npm install
npm run dev      # start Vite dev server
npm run build            # build both browsers → dist/chrome/ and dist/firefox/
npm run build:firefox    # Firefox only
npm run build:chrome     # Chrome only
```

Both builds share the same source; only the generated `manifest.json` differs (Firefox runs the background as an event page instead of a service worker). The base manifest lives in `src/manifest.json`.

- **Firefox:** open `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → select `dist/firefox/manifest.json`. Requires Firefox 128+.
- **Chrome:** open `chrome://extensions`, enable Developer mode → *Load unpacked* → select `dist/chrome/`.

### Live reload

Run the watcher and the browser runner in two terminals. The extension reloads in the test browser on every save.

```bash
npm run watch:firefox    # terminal 1: rebuild dist/firefox on save
npm run run:firefox      # terminal 2: launch Firefox Developer Edition via web-ext

npm run watch:chrome     # or the Chrome pair
npm run run:chrome
```

## Development Log

[09/02/2026] — MVP development

- Initialised repository

[27/04/2026] — Release 0.2

- React-based popup and blocked-page UI
- Extension CSP hardening and safer blocked-page rendering
- Updated build path handling for Chrome extension assets

[01/07/2026] — Release 0.3

- YouTube Focus Mode with 11 granular distraction toggles (feed, sidebar, comments, Shorts, endscreen, merch, sub bar, trending, notification bell, live chat, autoplay)
- Per-feature CSS injection via individual CSS files and dynamic `<link>` tag management
- Dark / light mode toggle with `chrome.storage.sync` persistence
- Decorative background elements and improved button accessibility
- In-memory `chrome.storage` shim for local development outside the extension runtime
- Alarm-based tracking state persistence for service worker reliability
- Updated application icons for improved visual consistency

[23/10/2026] — Release 0.4

- Firefox support: separate Firefox build target with an event-page background and Gecko settings (Firefox 128+)
- History tab listing the last 30 days of usage, with per-day and all-days JSON export to `Downloads/Focus Logs/`
- 30-day retention: usage days older than 30 days are deleted automatically
- Dashboard lists every site visited today in a scrollable list (previously top 5)
- Tracking status shown as a coloured pill
- Fixed popup clipping in Firefox and popup width/scrollbar styling
- Disabled module preloading to stop Chrome cross-world resource mismatch errors
- `watch:*` and `run:*` scripts for live reload with `web-ext`
