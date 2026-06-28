Architecture Decision Records (ADR)

## ADR 001: Use React for extension UI surfaces

Status: Accepted

Context:
The extension has two main user-facing surfaces: the popup and the blocked page. Both need to stay small, responsive, and easy to maintain as the product grows.

Decision:
Use React for the popup and blocked page, built through Vite, while keeping the background service worker and content script logic in plain JavaScript.

Rationale:
React fits the popup's stateful tab navigation and the blocked page's dynamic content. Keeping extension logic in plain JavaScript avoids unnecessary complexity in the service worker path.

Consequences:
The UI is easier to evolve and reuse, while build output must be managed carefully so Chrome extension paths remain valid.

## ADR 002: Separate storage responsibilities by chrome.storage area

Status: Accepted

Context:
The app stores three different kinds of data with different lifetimes and sync requirements.

Decision:
Store usage data and blocklist data in chrome.storage.local, and store settings in chrome.storage.sync.

Rationale:
Usage history is local and potentially larger, so it belongs in local storage. Settings should follow the user across devices, so sync storage is the better fit.

Consequences:
The UI can treat storage as a single source of truth through StorageAdapter, but data shape and quota limits must be respected.

## ADR 003: Block sites before navigation completes

Status: Accepted

Context:
The extension must stop distracting sites quickly, including direct navigations and SPA-style route changes.

Decision:
Use chrome.webNavigation.onBeforeNavigate in the background service worker as the primary blocker, with a content script fallback for SPA navigation changes.

Rationale:
Blocking before the page loads prevents content flashes and reduces wasted work. The content script fallback covers client-side route changes that happen after the initial load.

Consequences:
The blocking flow is fast and reliable, but redirect logic needs to avoid loops and ignore the extension's own blocked page.

## ADR 004: Keep the blocked page minimal and self-contained

Status: Accepted

Context:
The blocked page must render even when a page is being intercepted and should not depend on external services.

Decision:
Ship the blocked page with a strict CSP, local assets only, and no remote fonts or network calls.

Rationale:
This keeps the page compliant with extension security expectations and removes a class of runtime failures caused by external dependencies.

Consequences:
The page is predictable and secure, but any future visual enhancements need to remain compatible with extension CSP rules.

## ADR 005: Granular Per-Feature CSS Injection for YouTube Focus Mode

Status: Accepted (updated from v1 class-scoping approach)

Context:
The extension needs a YouTube Focus Mode that removes individual distraction surfaces (feed, sidebar, comments, Shorts, endscreen, etc.) with granular user control. The initial v1 implementation used a single monolithic CSS file scoped to context classes on the `<html>` element, which treated all features as a single on/off switch.

Decision:
Replace the monolithic CSS + class-scoping approach with individual CSS files per feature (e.g. `hide-feed.css`, `hide-sidebar.css`), dynamically injected or removed via `<link>` tags by the content script (`youtube-focus.js`). The content script adopts the `addCSS(file)` / `removeCSS(file)` pattern from the proven DF Tube extension. A `prehide-feed.css` file is still injected via the manifest at `document_start` to prevent feed flash. Settings are stored in `chrome.storage.sync` under `settings.youtubeFocus` as a granular object with 11 individual boolean flags and a master `active` switch.

Rationale:
Individual CSS files make it easy to add, update, or remove specific features without touching unrelated rules. Dynamic `<link>` injection is instant and reversible on SPA navigations. The granular settings model matches what users actually want — they may want to hide comments but keep the sidebar. The v1 class-scoping approach forced a single all-or-nothing trade-off.

Consequences:
Each YouTube UI feature is independently controllable from a dedicated popup tab. The CSS files in `public/content/youtube/` are registered as `web_accessible_resources` so the content script can reference them via `chrome.runtime.getURL()`. The SPA detection strategy (yt-navigate events, History API patching, MutationObserver) from v1 is preserved as it is superior to the timer-polling approach used in DF Tube.

