/**
 * Focus — Content Script: The Enforcer
 *
 * Website blocker using Shadow DOM for CSS isolation and
 * MutationObserver for SPA (Single Page Application) support.
 *
 * Injected at document_start for instant blocking before page renders.
 *
 * Architecture:
 *   1. On injection: check if current domain is blocked
 *   2. If blocked: inject Shadow DOM overlay, halt page rendering
 *   3. MutationObserver: watch for SPA URL changes, re-evaluate blocking
 *   4. Listen for BLOCKLIST_UPDATE messages from background/popup
 */

(function () {
  'use strict';

  // ===========================================================================
  // Constants
  // ===========================================================================

  const OVERLAY_HOST_ID = '__focus-enforcer-root__';

  const MOTIVATIONAL_QUOTES = [
    { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
    { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
    { text: "It is not enough to be busy. The question is: what are we busy about?", author: "Henry David Thoreau" },
    { text: "Concentrate all your thoughts upon the work at hand.", author: "Alexander Graham Bell" },
    { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
    { text: "Do the hard jobs first. The easy jobs will take care of themselves.", author: "Dale Carnegie" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "You don't have to see the whole staircase, just take the first step.", author: "Martin Luther King Jr." },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Your future is created by what you do today, not tomorrow.", author: "Robert Kiyosaki" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
    { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  ];

  // ===========================================================================
  // Overlay Styles (injected into Shadow DOM — isolated from host page)
  // ===========================================================================

  const OVERLAY_STYLES = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    :host {
      all: initial !important;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    .focus-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      color: #ffffff;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes pulse-glow {
      0%, 100% { opacity: 0.15; transform: scale(1); }
      50% { opacity: 0.25; transform: scale(1.05); }
    }

    @keyframes shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }

    .ambient-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      animation: pulse-glow 6s ease-in-out infinite;
      pointer-events: none;
    }

    .orb-violet {
      width: 400px;
      height: 400px;
      background: rgba(139, 92, 246, 0.3);
      top: -100px;
      right: -100px;
    }

    .orb-cyan {
      width: 350px;
      height: 350px;
      background: rgba(6, 182, 212, 0.2);
      bottom: -80px;
      left: -80px;
      animation-delay: 3s;
    }

    .content-card {
      position: relative;
      max-width: 480px;
      width: 90%;
      padding: 48px 40px;
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      text-align: center;
      animation: slideUp 0.5s ease-out 0.1s both;
    }

    .shield-icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.2));
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .shield-icon svg {
      width: 32px;
      height: 32px;
    }

    .title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
      background: linear-gradient(90deg, #a78bfa, #22d3ee);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .domain-name {
      font-size: 14px;
      font-weight: 500;
      color: rgba(148, 163, 184, 0.8);
      margin-bottom: 32px;
    }

    .domain-highlight {
      color: rgba(248, 250, 252, 0.9);
      font-weight: 600;
    }

    .divider {
      width: 48px;
      height: 2px;
      background: linear-gradient(90deg, #8b5cf6, #06b6d4);
      border-radius: 1px;
      margin: 0 auto 28px;
    }

    .quote-text {
      font-size: 15px;
      font-weight: 400;
      line-height: 1.7;
      color: rgba(226, 232, 240, 0.9);
      font-style: italic;
      margin-bottom: 12px;
    }

    .quote-author {
      font-size: 12px;
      font-weight: 500;
      color: rgba(148, 163, 184, 0.6);
    }

    .focus-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 32px;
      padding: 8px 16px;
      border-radius: 100px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      font-weight: 500;
      color: rgba(148, 163, 184, 0.7);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      animation: pulse-glow 2s ease-in-out infinite;
    }
  `;

  // ===========================================================================
  // State
  // ===========================================================================

  let isBlocked = false;
  let overlayHost = null;

  // ===========================================================================
  // Domain Extraction
  // ===========================================================================

  function getCurrentDomain() {
    try {
      return window.location.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return '';
    }
  }

  // ===========================================================================
  // Domain Matching
  // ===========================================================================

  /**
   * Check if a domain matches any entry in the blocklist.
   * Supports subdomain matching: "m.youtube.com" matches "youtube.com".
   * Uses dot-boundary to prevent "notyoutube.com" from matching "youtube.com".
   * @param {string} domain — current page domain
   * @param {string[]} blocklist — array of blocked base domains
   * @returns {boolean}
   */
  function isDomainBlocked(domain, blocklist) {
    for (const blocked of blocklist) {
      if (domain === blocked || domain.endsWith('.' + blocked)) {
        return true;
      }
    }
    return false;
  }

  // ===========================================================================
  // Blocking Logic
  // ===========================================================================

  /**
   * Check if the current page should be blocked.
   * Reads blocklist and settings from chrome.storage.sync.
   */
  async function checkAndEnforce() {
    const domain = getCurrentDomain();

    if (!domain) return;

    try {
      const result = await chrome.storage.sync.get(['blocklist', 'settings']);
      const blocklist = result.blocklist || [];
      const settings = result.settings || { blockingEnabled: true };

      const shouldBlock = settings.blockingEnabled && isDomainBlocked(domain, blocklist);

      console.log('[Focus Enforcer] Check:', {
        domain,
        blocklist,
        blockingEnabled: settings.blockingEnabled,
        shouldBlock,
        isCurrentlyBlocked: isBlocked,
      });

      if (shouldBlock && !isBlocked) {
        console.log('[Focus Enforcer] BLOCKING', domain);
        injectOverlay(domain);
      } else if (!shouldBlock && isBlocked) {
        console.log('[Focus Enforcer] UNBLOCKING', domain);
        removeOverlay();
      }
    } catch (err) {
      console.warn('[Focus Enforcer] Storage read error:', err);
    }
  }

  // ===========================================================================
  // Shadow DOM Overlay
  // ===========================================================================

  /**
   * Inject the blocking overlay using Shadow DOM for CSS isolation.
   * @param {string} domain — the blocked domain
   */
  function injectOverlay(domain) {
    // Prevent duplicates
    if (document.getElementById(OVERLAY_HOST_ID)) return;

    isBlocked = true;

    // Create host element
    overlayHost = document.createElement('div');
    overlayHost.id = OVERLAY_HOST_ID;
    overlayHost.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';

    // Attach shadow root
    const shadow = overlayHost.attachShadow({ mode: 'closed' });

    // Inject styles
    const style = document.createElement('style');
    style.textContent = OVERLAY_STYLES;
    shadow.appendChild(style);

    // Pick a random quote
    const quote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];

    // Build overlay DOM
    const overlay = document.createElement('div');
    overlay.className = 'focus-overlay';
    overlay.innerHTML = `
      <div class="ambient-orb orb-violet"></div>
      <div class="ambient-orb orb-cyan"></div>

      <div class="content-card">
        <div class="shield-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="url(#shield-gradient)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <defs>
              <linearGradient id="shield-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#a78bfa" />
                <stop offset="100%" stop-color="#22d3ee" />
              </linearGradient>
            </defs>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>

        <h1 class="title">Stay Focused</h1>
        <p class="domain-name">
          <span class="domain-highlight">${escapeHtml(domain)}</span> is blocked
        </p>

        <div class="divider"></div>

        <p class="quote-text">"${escapeHtml(quote.text)}"</p>
        <p class="quote-author">— ${escapeHtml(quote.author)}</p>

        <div class="focus-badge">
          <span class="pulse-dot"></span>
          Focus Mode Active
        </div>
      </div>
    `;

    shadow.appendChild(overlay);

    // Inject into page — use documentElement for earliest possible insertion
    const target = document.documentElement || document.body;
    target.appendChild(overlayHost);

    // Prevent scrolling on the blocked page
    document.documentElement.style.overflow = 'hidden';
    if (document.body) {
      document.body.style.overflow = 'hidden';
    }
  }

  /**
   * Remove the blocking overlay (e.g., domain was unblocked).
   */
  function removeOverlay() {
    isBlocked = false;

    const existing = document.getElementById(OVERLAY_HOST_ID);
    if (existing) {
      existing.remove();
    }
    overlayHost = null;

    // Restore scrolling
    document.documentElement.style.overflow = '';
    if (document.body) {
      document.body.style.overflow = '';
    }
  }

  // ===========================================================================
  // SPA Support — MutationObserver
  // ===========================================================================

  /**
   * Watch for SPA-style URL changes using MutationObserver.
   * SPAs like YouTube/Twitter change URLs without full page reloads.
   */
  function setupSPAObserver() {
    let currentHref = window.location.href;

    // Observe DOM mutations as a proxy for navigation events
    const observer = new MutationObserver(() => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        checkAndEnforce();
      }
    });

    // Start observing once the document is available
    function startObserving() {
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      } else {
        // If body doesn't exist yet (document_start), wait for it
        const bodyObserver = new MutationObserver(() => {
          if (document.body) {
            bodyObserver.disconnect();
            observer.observe(document.body, {
              childList: true,
              subtree: true,
            });
          }
        });
        bodyObserver.observe(document.documentElement, {
          childList: true,
        });
      }
    }

    startObserving();

    // Also intercept History API for pushState/replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        checkAndEnforce();
      }
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        checkAndEnforce();
      }
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', () => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href;
        checkAndEnforce();
      }
    });
  }

  // ===========================================================================
  // Storage Change Listener (Primary — no background dependency)
  // ===========================================================================

  /**
   * Listen directly to chrome.storage.onChanged for blocklist/settings changes.
   * This is the PRIMARY mechanism — works even if the background SW is asleep.
   */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.blocklist || changes.settings)) {
      console.log('[Focus Enforcer] Storage changed — re-evaluating block state.');
      checkAndEnforce();
    }
  });

  // ===========================================================================
  // Message Listener (Supplementary — for immediate broadcast)
  // ===========================================================================

  /**
   * Listen for BLOCKLIST_UPDATE messages from background/popup.
   * Supplementary to the storage listener — provides faster response
   * when the background relay is available.
   */
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'BLOCKLIST_UPDATE') {
      console.log('[Focus Enforcer] Received BLOCKLIST_UPDATE message.');
      checkAndEnforce();
    }
  });

  // ===========================================================================
  // Utilities
  // ===========================================================================

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  console.log('[Focus Enforcer] Content script loaded on:', getCurrentDomain());

  // Run immediately at document_start
  checkAndEnforce();

  // Set up SPA observer once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSPAObserver);
  } else {
    setupSPAObserver();
  }
})();

