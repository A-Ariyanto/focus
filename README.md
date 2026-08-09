# Focus — Digital Wellbeing

A Chrome extension that helps you stay focused by tracking time spent on websites, blocking distracting domains, and taming YouTube distractions with granular Focus Mode controls.

## Features

- **Website usage tracking** — see how much time you spend on each site, broken down by day
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
npm run build    # production build → dist/
```

Load the `dist/` folder as an unpacked extension in `chrome://extensions`.

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
