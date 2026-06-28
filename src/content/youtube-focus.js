/**
 * Focus — YouTube Focus Content Script
 *
 * Scoped to youtube.com. Handles context detection, SPA transitions,
 * root HTML class toggles, and injection of the central search interface.
 */

(function () {
  'use strict';

  // ===========================================================================
  // Constants & State
  // ===========================================================================
  let youtubeCleanMode = true;
  let currentHref = window.location.href;
  let customSearchInjected = false;

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
  // Custom Central Search Injection (Strategy B)
  // ===========================================================================

  /**
   * Inject a clean, central search box into the empty homepage body.
   */
  function injectCentralSearch() {
    if (!youtubeCleanMode || customSearchInjected) return;

    // We inject inside the main browse container once it's available
    const browseContainer = document.querySelector('ytd-browse[page-subtype="home"]');
    if (!browseContainer) return;

    // Check if the container is already empty or hidden, and remove existing if any
    const existing = document.getElementById('focus-yt-search-container');
    if (existing) existing.remove();

    const searchContainer = document.createElement('div');
    searchContainer.id = 'focus-yt-search-container';
    searchContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 65vh;
      width: 100%;
      box-sizing: border-box;
      padding: 20px;
      font-family: Roboto, Arial, sans-serif;
    `;

    searchContainer.innerHTML = `
      <div style="text-align: center; width: 100%; max-width: 580px;">
        <h1 style="
          font-size: 3rem;
          margin-bottom: 2rem;
          font-weight: 500;
          letter-spacing: -0.5px;
          color: var(--yt-spec-text-primary, #0f0f0f);
        ">Focus</h1>
        <form id="focus-yt-search-form" style="width: 100%; position: relative;">
          <input 
            type="text" 
            id="focus-yt-search-input" 
            placeholder="Search YouTube distraction-free..." 
            autocomplete="off" 
            style="
              width: 100%;
              padding: 14px 24px;
              border-radius: 30px;
              border: 1px solid var(--yt-spec-10-percent-layer, #e5e5e5);
              background-color: var(--yt-spec-menu-background, #fff);
              color: var(--yt-spec-text-primary, #0f0f0f);
              font-size: 16px;
              outline: none;
              box-shadow: 0 1px 6px rgba(0,0,0,0.05);
              transition: box-shadow 0.2s ease, border-color 0.2s ease;
            "
          >
        </form>
      </div>
    `;

    browseContainer.appendChild(searchContainer);
    customSearchInjected = true;

    // Focus input field style logic
    const input = searchContainer.querySelector('#focus-yt-search-input');
    input.addEventListener('focus', () => {
      input.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
      input.style.borderColor = 'var(--yt-spec-brand-button-background, #cc0000)';
    });
    input.addEventListener('blur', () => {
      input.style.boxShadow = '0 1px 6px rgba(0,0,0,0.05)';
      input.style.borderColor = 'var(--yt-spec-10-percent-layer, #e5e5e5)';
    });

    // Form submit / search query execution
    const form = searchContainer.querySelector('#focus-yt-search-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (val) {
        // Perform search using client routing
        window.location.href = `/results?search_query=${encodeURIComponent(val)}`;
      }
    });

    // Automatically focus the input
    setTimeout(() => input.focus(), 200);
  }

  /**
   * Remove the custom injected search box from the page.
   */
  function removeCentralSearch() {
    const existing = document.getElementById('focus-yt-search-container');
    if (existing) {
      existing.remove();
    }
    customSearchInjected = false;
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
      removeCentralSearch();
      return;
    }

    const context = determineContext();
    applyContextClass(context);

    if (context === 'home') {
      // Setup observer to wait for ytd-browse home container to mount
      if (document.querySelector('ytd-browse[page-subtype="home"]')) {
        injectCentralSearch();
      } else {
        const bodyWait = new MutationObserver(() => {
          if (document.querySelector('ytd-browse[page-subtype="home"]')) {
            bodyWait.disconnect();
            injectCentralSearch();
          }
        });
        bodyWait.observe(document.documentElement, { childList: true, subtree: true });
      }
    } else {
      removeCentralSearch();
    }
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
