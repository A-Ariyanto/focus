/**
 * Focus — YouTube Focus Content Script
 *
 * Scoped to youtube.com. Handles granular per-feature CSS injection/removal
 * based on user settings, plus SPA transition detection.
 *
 * Architecture:
 *   - Each distraction surface maps to a single CSS file in content/youtube/
 *   - CSS files are injected/removed dynamically via <link> tags (DF Tube pattern)
 *   - SPA navigation is detected via yt-navigate events, History API patching,
 *     and a MutationObserver fallback (superior to timer polling)
 *   - Settings are read from chrome.storage.sync and updated via onChanged
 */

(function () {
  'use strict';

  // ===========================================================================
  // State
  // ===========================================================================

  /** @type {object} Current YouTube Focus options */
  let ytOptions = null;

  /** @type {string} Last tracked href for SPA change detection */
  let currentHref = window.location.href;

  // ===========================================================================
  // CSS Injection / Removal
  // ===========================================================================

  /**
   * Inject a CSS file as a <link> tag into <head>.
   * Idempotent — does nothing if already injected.
   * @param {string} filename — e.g. 'hide-feed.css'
   */
  function addCSS(filename) {
    const url = chrome.runtime.getURL(`content/youtube/${filename}`);
    if (!document.querySelector(`link[data-focus-yt="${filename}"]`)) {
      const link = document.createElement('link');
      link.href = url;
      link.rel = 'stylesheet';
      link.setAttribute('data-focus-yt', filename);
      (document.head || document.documentElement).appendChild(link);
    }
  }

  /**
   * Remove a previously injected CSS <link> tag.
   * @param {string} filename — e.g. 'hide-feed.css'
   */
  function removeCSS(filename) {
    document.querySelectorAll(`link[data-focus-yt="${filename}"]`).forEach((el) =>
      el.remove()
    );
  }

  /**
   * Conditionally inject or remove a CSS file based on a boolean flag.
   * @param {string} filename
   * @param {boolean} enabled
   */
  function toggleCSS(filename, enabled) {
    if (enabled) {
      addCSS(filename);
    } else {
      removeCSS(filename);
    }
  }

  // ===========================================================================
  // Context Detection
  // ===========================================================================

  /**
   * Determine if the current URL is the YouTube homepage (or feed roots).
   * Used to gate feed hiding to only the homepage context.
   * @param {string} [urlOverride]
   * @returns {boolean}
   */
  function isHomePage(urlOverride) {
    try {
      const path = new URL(urlOverride || window.location.href, window.location.origin).pathname;
      return (
        path === '/' ||
        path.startsWith('/feed/trending') ||
        path.startsWith('/feed/subscriptions') ||
        path.startsWith('/feed/history')
      );
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Apply / Remove All Features
  // ===========================================================================

  /**
   * Apply or remove all CSS files based on current options and page context.
   * Called on initial load and every SPA navigation.
   */
  function applyOptions() {
    const opts = ytOptions;

    // If feature mode is off entirely, remove everything and exit
    if (!opts || !opts.active) {
      deactivateAll();
      return;
    }

    const onHome = isHomePage();

    // Homepage — only hide feed when on the homepage
    toggleCSS('hide-feed.css', opts.hideFeed && onHome);

    // Watch page / global features (apply regardless of context)
    toggleCSS('hide-sidebar.css', opts.hideSidebar);
    toggleCSS('hide-comments.css', opts.hideComments);
    toggleCSS('hide-endscreen.css', opts.hideEndscreen);
    toggleCSS('hide-merch.css', opts.hideMerch);
    toggleCSS('hide-live-chat.css', opts.hideLiveChat);

    // Global surfaces
    toggleCSS('hide-shorts.css', opts.hideShorts);
    toggleCSS('hide-subbar.css', opts.hideSubBar);
    toggleCSS('hide-trending.css', opts.hideTrending);
    toggleCSS('hide-notification-bell.css', opts.hideNotificationBell);

    // Layout correction — expand video when sidebar is hidden
    toggleCSS('expand-content.css', opts.hideSidebar);

    // Notification bell: also strip count from title
    if (opts.hideNotificationBell) {
      document.title = document.title.replace(/ *\([0-9]+\)/, '');
    }

    // Autoplay disable (clicks the toggle button after a brief delay)
    if (opts.disableAutoplay) {
      scheduleDisableAutoplay();
    }
  }

  /**
   * Remove all Focus CSS injections — called when focus mode is deactivated.
   */
  function deactivateAll() {
    const files = [
      'hide-feed.css',
      'hide-sidebar.css',
      'hide-comments.css',
      'hide-endscreen.css',
      'hide-merch.css',
      'hide-live-chat.css',
      'hide-shorts.css',
      'hide-subbar.css',
      'hide-trending.css',
      'hide-notification-bell.css',
      'expand-content.css',
    ];
    files.forEach(removeCSS);
  }

  // ===========================================================================
  // Autoplay Disable
  // ===========================================================================

  let autoplayTimer = null;

  /**
   * Click the autoplay toggle if it is currently enabled.
   * Attempts after a short delay to ensure the player has mounted.
   */
  function scheduleDisableAutoplay() {
    clearTimeout(autoplayTimer);
    autoplayTimer = setTimeout(() => {
      const toggle =
        document.getElementById('toggle') ||
        document.getElementById('improved-toggle');
      if (toggle && toggle.getAttribute('active') !== null) {
        toggle.click();
      }
    }, 3000);
  }

  // ===========================================================================
  // SPA Navigation Interception
  // ===========================================================================

  function setupSPAListeners() {
    // 1. YouTube-native navigation events (most reliable)
    document.addEventListener('yt-navigate-start', (event) => {
      const destUrl = event.detail?.url;
      if (destUrl && destUrl !== currentHref) {
        currentHref = destUrl;
        // Re-apply with the destination URL context for instant feed hiding
        const opts = ytOptions;
        if (opts && opts.active && opts.hideFeed) {
          const onHome = isHomePage(destUrl);
          toggleCSS('hide-feed.css', onHome);
        }
      }
    });

    document.addEventListener('yt-navigate-finish', () => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        applyOptions();
      }
    });

    // 2. MutationObserver fallback for structural updates
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        applyOptions();
      }
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      const bodyWait = new MutationObserver(() => {
        if (document.body) {
          bodyWait.disconnect();
          observer.observe(document.body, { childList: true, subtree: true });
        }
      });
      bodyWait.observe(document.documentElement, { childList: true });
    }

    // 3. History API interception (belt-and-suspenders)
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    history.pushState = function (...args) {
      origPush.apply(this, args);
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        applyOptions();
      }
    };

    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        applyOptions();
      }
    };

    window.addEventListener('popstate', () => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        applyOptions();
      }
    });
  }

  // ===========================================================================
  // Storage Integration & Settings Listeners
  // ===========================================================================

  /**
   * Load YouTube Focus options from storage and apply them.
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      const raw = result.settings || {};
      // Merge with defaults inline (mirrors StorageAdapter logic without the import)
      const defaultYtFocus = {
        active: true,
        hideFeed: true,
        hideSidebar: true,
        hideComments: true,
        hideEndscreen: true,
        hideShorts: true,
        hideMerch: true,
        hideSubBar: false,
        hideTrending: false,
        hideNotificationBell: false,
        hideLiveChat: false,
        disableAutoplay: false,
      };

      // Handle legacy youtubeCleanMode migration
      if ('youtubeCleanMode' in raw && !('youtubeFocus' in raw)) {
        ytOptions = { ...defaultYtFocus, active: raw.youtubeCleanMode !== false };
      } else {
        ytOptions = { ...defaultYtFocus, ...(raw.youtubeFocus || {}) };
      }
    } catch {
      // Context invalidated or read error — keep defaults enabled
      ytOptions = {
        active: true,
        hideFeed: true,
        hideSidebar: true,
        hideComments: true,
        hideEndscreen: true,
        hideShorts: true,
        hideMerch: true,
        hideSubBar: false,
        hideTrending: false,
        hideNotificationBell: false,
        hideLiveChat: false,
        disableAutoplay: false,
      };
    }
    applyOptions();
  }

  /**
   * Listen for settings changes to update CSS without a page reload.
   */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      const newSettings = changes.settings.newValue || {};
      const defaultYtFocus = ytOptions || {};
      ytOptions = { ...defaultYtFocus, ...(newSettings.youtubeFocus || {}) };
      applyOptions();
    }
  });

  // ===========================================================================
  // Initialization
  // ===========================================================================

  // Load settings and apply immediately (runs before paint due to document_start)
  loadSettings();

  // Set up SPA listeners once the document is interactive
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupSPAListeners();
      applyOptions();
    });
  } else {
    setupSPAListeners();
    applyOptions();
  }
})();
