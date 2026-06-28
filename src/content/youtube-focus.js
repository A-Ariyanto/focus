/**
 * Focus — YouTube Focus Content Script
 *
 * Scoped to youtube.com. Handles context detection, SPA transitions,
 * and root HTML class toggles to manage layout states.
 */

(function () {
  'use strict';

  // ===========================================================================
  // Constants & State
  // ===========================================================================
  let youtubeCleanMode = true;
  let currentHref = window.location.href;

  // CSS classes for context mapping
  const CONTEXT_CLASSES = {
    home: 'focus-yt-home',
    watch: 'focus-yt-watch',
    search: 'focus-yt-search',
    other: 'focus-yt-other',
  };

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  /**
   * Determine the current YouTube page context based on the URL.
   */
  function determineContext() {
    try {
      const url = new URL(window.location.href);
      const path = url.pathname;

      if (path === '/' || path.startsWith('/feed/trending') || path.startsWith('/feed/subscriptions')) {
        return 'home';
      }
      if (path.startsWith('/watch')) {
        return 'watch';
      }
      if (path.startsWith('/results')) {
        return 'search';
      }
      return 'other';
    } catch {
      return 'other';
    }
  }

  /**
   * Clear all focus-mode context classes from the <html> element.
   */
  function clearAllContextClasses() {
    const html = document.documentElement;
    if (html) {
      Object.values(CONTEXT_CLASSES).forEach((cls) => html.classList.remove(cls));
    }
  }

  /**
   * Apply the appropriate context class to the <html> element.
   */
  function applyContextClass(context) {
    if (!youtubeCleanMode) return;

    const html = document.documentElement;
    if (html) {
      clearAllContextClasses();
      const targetClass = CONTEXT_CLASSES[context];
      if (targetClass) {
        html.classList.add(targetClass);
      }
    }
  }

  // ===========================================================================
  // Page Transition Lifecycle Management
  // ===========================================================================

  /**
   * Handle updates when page context changes (Home, Watch, Search, etc.).
   */
  function handlePageUpdate() {
    if (!youtubeCleanMode) {
      clearAllContextClasses();
      return;
    }

    const context = determineContext();
    applyContextClass(context);
  }

  // ===========================================================================
  // SPA Navigation Interception (History API & Custom events)
  // ===========================================================================

  function setupSPAListeners() {
    // 1. YouTube specific transition event
    document.addEventListener('yt-navigate-finish', () => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        handlePageUpdate();
      }
    });

    // 2. Generic MutationObserver — fallback for background page structural updates
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        handlePageUpdate();
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

    // 3. History API Interception (belt-and-suspenders)
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    history.pushState = function (...args) {
      origPush.apply(this, args);
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        handlePageUpdate();
      }
    };

    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        handlePageUpdate();
      }
    };

    window.addEventListener('popstate', () => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        handlePageUpdate();
      }
    });
  }

  // ===========================================================================
  // Storage Integration & Settings Listeners
  // ===========================================================================

  /**
   * Load clean mode settings and apply the layout.
   */
  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      // Default to true if not explicitly set
      const settings = result.settings || {};
      youtubeCleanMode = settings.youtubeCleanMode !== false;
      handlePageUpdate();
    } catch {
      // Context invalidated or read error — keep default enabled
      youtubeCleanMode = true;
      handlePageUpdate();
    }
  }

  /**
   * Listen for settings shifts to toggle focus mode without reload.
   */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.settings) {
      const settings = changes.settings.newValue || {};
      const newCleanMode = settings.youtubeCleanMode !== false;

      if (newCleanMode !== youtubeCleanMode) {
        youtubeCleanMode = newCleanMode;
        handlePageUpdate();
      }
    }
  });

  // ===========================================================================
  // Initialization
  // ===========================================================================

  // Run immediately to inject classes and hide sections before rendering starts
  loadSettings();

  // Setup SPA hooks once the document structure is interactive
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupSPAListeners();
      handlePageUpdate();
    });
  } else {
    setupSPAListeners();
    handlePageUpdate();
  }
})();
