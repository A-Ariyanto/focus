/**
 * Focus — Content Script: Lightweight Enforcer
 *
 * Fallback blocker for edge cases not caught by the background SW's
 * webNavigation.onBeforeNavigate handler (e.g., SPA URL changes).
 *
 * The primary blocking happens in the background service worker.
 * This content script handles:
 *   1. SPA navigation detection (MutationObserver + History API)
 *   2. Fallback check on injection (belt-and-suspenders)
 *   3. Storage change listener for real-time updates
 */

(function () {
  'use strict';

  // ===========================================================================
  // Domain Helpers
  // ===========================================================================

  function getCurrentDomain() {
    try {
      return window.location.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  function isDomainBlocked(domain, blocklist) {
    for (const blocked of blocklist) {
      if (domain === blocked || domain.endsWith('.' + blocked)) {
        return true;
      }
    }
    return false;
  }

  // ===========================================================================
  // Blocking Check
  // ===========================================================================

  /**
   * Check if the current page should be blocked.
   * If so, redirect to the extension's blocked.html page.
   */
  async function checkAndRedirect() {
    const domain = getCurrentDomain();
    if (!domain) return;

    // Don't check if we're already on the blocked page
    if (window.location.href.includes(chrome.runtime.id)) return;

    try {
      const [blocklistResult, settingsResult] = await Promise.all([
        chrome.storage.local.get('blocklist'),
        chrome.storage.sync.get('settings'),
      ]);

      const blocklist = blocklistResult.blocklist || [];
      const settings = settingsResult.settings || { blockingEnabled: true };

      if (settings.blockingEnabled && isDomainBlocked(domain, blocklist)) {
        const blockedUrl = chrome.runtime.getURL('blocked.html')
          + '?url=' + encodeURIComponent(window.location.href);
        window.location.href = blockedUrl;
      }
    } catch (err) {
      // Storage read may fail if extension context is invalidated — ignore
    }
  }

  // ===========================================================================
  // SPA Navigation Detection
  // ===========================================================================

  function setupSPADetection() {
    let currentHref = window.location.href;

    // MutationObserver — catches DOM-driven SPA navigation
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        checkAndRedirect();
      }
    });

    function startObserving() {
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
    }

    startObserving();

    // History API interception — catches pushState/replaceState
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    history.pushState = function (...args) {
      origPush.apply(this, args);
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        checkAndRedirect();
      }
    };

    history.replaceState = function (...args) {
      origReplace.apply(this, args);
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        checkAndRedirect();
      }
    };

    // Popstate — catches back/forward navigation
    window.addEventListener('popstate', () => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        checkAndRedirect();
      }
    });
  }

  // ===========================================================================
  // Storage Change Listener
  // ===========================================================================

  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'local' && changes.blocklist) ||
        (area === 'sync' && changes.settings)) {
      checkAndRedirect();
    }
  });

  // ===========================================================================
  // Initialization
  // ===========================================================================

  // Immediate check on injection
  checkAndRedirect();

  // Set up SPA detection once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSPADetection);
  } else {
    setupSPADetection();
  }
})();
