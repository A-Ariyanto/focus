/**
 * Focus — Background Service Worker
 *
 * Tracking Engine with Smart Batching & Idle Detection.
 *
 * Architecture:
 *   Chrome tab/window/idle events → in-memory buffer → chrome.storage.local
 *
 * Flush triggers:
 *   - 30-second interval
 *   - Active tab changes (tabs.onActivated)
 *   - Window focus changes (windows.onFocusChanged)
 *   - Idle state changes (idle.onStateChanged)
 *
 * Storage format:
 *   Key: "usage_YYYY-MM-DD"
 *   Value: { "youtube.com": 45000, "github.com": 120000, ... }  (ms per domain)
 */

// =============================================================================
// Constants
// =============================================================================

const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
const IDLE_THRESHOLD_SECONDS = 60; // 1 minute
const INTERNAL_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

// =============================================================================
// State
// =============================================================================

/** @type {Map<string, number>} In-memory buffer: domain → accumulated ms */
const usageBuffer = new Map();

/** @type {string|null} Currently tracked domain */
let activeDomain = null;

/** @type {number|null} Timestamp when tracking started for the current domain */
let trackingStartedAt = null;

/** @type {boolean} Whether the user is currently active */
let isUserActive = true;

/** @type {boolean} Whether a browser window is focused */
let isWindowFocused = true;

/** @type {ReturnType<typeof setInterval>|null} */
let flushTimer = null;

// =============================================================================
// Domain Extraction
// =============================================================================

/**
 * Extract the base hostname from a URL, stripping the "www." prefix.
 * @param {string} url
 * @returns {string|null} hostname or null if not trackable
 */
function extractDomain(url) {
  if (!url) return null;

  // Skip internal browser URLs
  for (const prefix of INTERNAL_URL_PREFIXES) {
    if (url.startsWith(prefix)) return null;
  }

  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// =============================================================================
// Date Helpers
// =============================================================================

/**
 * Get today's storage key in the format "usage_YYYY-MM-DD".
 * @returns {string}
 */
function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `usage_${yyyy}-${mm}-${dd}`;
}

// =============================================================================
// Buffer Management
// =============================================================================

/**
 * Record elapsed time for the active domain into the buffer.
 * Resets the tracking timer.
 */
function recordElapsedTime() {
  if (!activeDomain || !trackingStartedAt) return;

  const elapsed = Date.now() - trackingStartedAt;
  if (elapsed > 0) {
    const current = usageBuffer.get(activeDomain) || 0;
    usageBuffer.set(activeDomain, current + elapsed);
  }

  // Reset the timer to now (not null — we're still on this domain)
  trackingStartedAt = Date.now();
}

/**
 * Flush the in-memory buffer to chrome.storage.local.
 * Merges buffered values with existing stored data for today.
 */
async function flushBuffer() {
  if (usageBuffer.size === 0) return;

  // Snapshot and clear the buffer atomically
  const snapshot = new Map(usageBuffer);
  usageBuffer.clear();

  const todayKey = getTodayKey();

  try {
    const result = await chrome.storage.local.get(todayKey);
    const existing = result[todayKey] || {};

    // Merge snapshot into existing data
    for (const [domain, ms] of snapshot) {
      existing[domain] = (existing[domain] || 0) + ms;
    }

    await chrome.storage.local.set({ [todayKey]: existing });
  } catch (error) {
    // On failure, restore the buffer so data isn't lost
    for (const [domain, ms] of snapshot) {
      const current = usageBuffer.get(domain) || 0;
      usageBuffer.set(domain, current + ms);
    }
    console.error('[Focus] Failed to flush buffer:', error);
  }
}

// =============================================================================
// Tracking Control
// =============================================================================

/**
 * Start tracking a new domain. Records elapsed time for the previous domain first.
 * @param {string|null} domain
 */
function startTracking(domain) {
  // Record time spent on the previous domain
  recordElapsedTime();

  activeDomain = domain;
  trackingStartedAt = domain ? Date.now() : null;
}

/**
 * Pause all tracking (e.g., when idle or window loses focus).
 * Records elapsed time and clears the active state.
 */
function pauseTracking() {
  recordElapsedTime();
  trackingStartedAt = null;
}

/**
 * Resume tracking the current domain (e.g., when user returns from idle).
 */
function resumeTracking() {
  if (activeDomain) {
    trackingStartedAt = Date.now();
  }
}

// =============================================================================
// Tab & Window Event Handlers
// =============================================================================

/**
 * Handle tab activation — switch tracking to the newly active tab.
 * @param {{ tabId: number, windowId: number }} activeInfo
 */
async function onTabActivated(activeInfo) {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    const domain = extractDomain(tab.url);
    await flushBuffer();
    startTracking(domain);
  } catch (error) {
    // Tab may have been closed between event and get()
    console.warn('[Focus] Tab activation handler error:', error);
  }
}

/**
 * Handle tab URL updates (e.g., navigation within a tab).
 * @param {number} tabId
 * @param {{ url?: string }} changeInfo
 * @param {chrome.tabs.Tab} tab
 */
async function onTabUpdated(tabId, changeInfo, tab) {
  // Only care about URL changes on the active tab
  if (!changeInfo.url) return;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id === tabId) {
      const domain = extractDomain(changeInfo.url);
      await flushBuffer();
      startTracking(domain);
    }
  } catch (error) {
    console.warn('[Focus] Tab update handler error:', error);
  }
}

/**
 * Handle window focus changes.
 * @param {number} windowId — -1 if no window is focused
 */
async function onWindowFocusChanged(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // No browser window is focused
    isWindowFocused = false;
    pauseTracking();
    await flushBuffer();
  } else {
    isWindowFocused = true;
    // Determine the active tab in the newly focused window
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId });
      if (activeTab) {
        const domain = extractDomain(activeTab.url);
        startTracking(domain);
      }
    } catch (error) {
      console.warn('[Focus] Window focus handler error:', error);
    }
  }
}

// =============================================================================
// Idle Detection
// =============================================================================

/**
 * Handle idle state changes.
 * @param {"active"|"idle"|"locked"} newState
 */
async function onIdleStateChanged(newState) {
  if (newState === 'active') {
    isUserActive = true;
    if (isWindowFocused) {
      resumeTracking();
    }
  } else {
    // "idle" or "locked"
    isUserActive = false;
    pauseTracking();
    await flushBuffer();
  }
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize tracking state by reading the currently active tab.
 */
async function initialize() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      const domain = extractDomain(activeTab.url);
      startTracking(domain);
    }
  } catch (error) {
    console.warn('[Focus] Initialization error:', error);
  }

  // Set up the periodic flush timer
  flushTimer = setInterval(async () => {
    if (activeDomain && trackingStartedAt) {
      recordElapsedTime();
    }
    await flushBuffer();
  }, FLUSH_INTERVAL_MS);

  // Configure idle detection
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
}

// =============================================================================
// Event Listeners
// =============================================================================

// Lifecycle events
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Focus] Extension installed — initializing tracking engine.');
  initialize();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[Focus] Browser started — initializing tracking engine.');
  initialize();
});

// Tab events
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.tabs.onUpdated.addListener(onTabUpdated);

// Window events
chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);

// Idle events
chrome.idle.onStateChanged.addListener(onIdleStateChanged);

// =============================================================================
// Website Blocking — webNavigation Interception
// =============================================================================

const BLOCKED_PAGE_URL = chrome.runtime.getURL('blocked.html');
const INTERNAL_BLOCK_PREFIXES = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'devtools://'];

/**
 * Check if a domain matches any entry in the blocklist.
 * Supports subdomain matching: "m.youtube.com" matches "youtube.com".
 * @param {string} domain
 * @param {string[]} blocklist
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

/**
 * Intercept ALL navigations before the page loads.
 * If the domain is in the blocklist and blocking is enabled,
 * redirect the tab to blocked.html — the blocked page never even loads.
 */
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only handle top-level navigations (not iframes)
  if (details.frameId !== 0) return;

  const url = details.url;

  // Skip internal URLs and our own blocked page
  if (!url || !url.startsWith('http')) return;
  if (url.startsWith(BLOCKED_PAGE_URL)) return;

  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (!hostname) return;

    const [blocklistResult, settingsResult] = await Promise.all([
      chrome.storage.local.get('blocklist'),
      chrome.storage.sync.get('settings'),
    ]);

    const blocklist = blocklistResult.blocklist || [];
    const settings = settingsResult.settings || { blockingEnabled: true };

    if (settings.blockingEnabled && isDomainBlocked(hostname, blocklist)) {
      const redirectUrl = BLOCKED_PAGE_URL + '?url=' + encodeURIComponent(url);
      chrome.tabs.update(details.tabId, { url: redirectUrl });
    }
  } catch (err) {
    console.warn('[Focus] Navigation interception error:', err);
  }
});

/**
 * Scan ALL open tabs and block/unblock them based on the current blocklist.
 * Called whenever the blocklist or settings change.
 *
 * - If a tab shows a non-blocked site → do nothing
 * - If a tab shows a blocked site → redirect to blocked.html
 * - If a tab shows blocked.html for a now-unblocked site → redirect back
 */
async function blockActiveTabs() {
  try {
    const [tabs, blocklistResult, settingsResult] = await Promise.all([
      chrome.tabs.query({}),
      chrome.storage.local.get('blocklist'),
      chrome.storage.sync.get('settings'),
    ]);

    const blocklist = blocklistResult.blocklist || [];
    const settings = settingsResult.settings || { blockingEnabled: true };

    for (const tab of tabs) {
      if (!tab.url || !tab.id) continue;

      // Case 1: Tab is showing blocked.html — check if it should be unblocked
      if (tab.url.startsWith(BLOCKED_PAGE_URL)) {
        try {
          const params = new URL(tab.url).searchParams;
          const originalUrl = params.get('url');
          if (!originalUrl) continue;

          const decoded = decodeURIComponent(originalUrl);
          const hostname = new URL(decoded).hostname.replace(/^www\./, '').toLowerCase();

          // If site is no longer blocked OR blocking is disabled → unblock
          if (!settings.blockingEnabled || !isDomainBlocked(hostname, blocklist)) {
            chrome.tabs.update(tab.id, { url: decoded });
          }
        } catch {
          // Invalid URL in params — ignore
        }
        continue;
      }

      // Case 2: Tab is showing a regular page — check if it should be blocked
      if (!tab.url.startsWith('http')) continue;

      try {
        const hostname = new URL(tab.url).hostname.replace(/^www\./, '').toLowerCase();
        if (settings.blockingEnabled && isDomainBlocked(hostname, blocklist)) {
          const redirectUrl = BLOCKED_PAGE_URL + '?url=' + encodeURIComponent(tab.url);
          chrome.tabs.update(tab.id, { url: redirectUrl });
        }
      } catch {
        // Invalid URL — ignore
      }
    }
  } catch (err) {
    console.warn('[Focus] blockActiveTabs error:', err);
  }
}

// =============================================================================
// Blocklist Change Listeners
// =============================================================================

/**
 * Listen for BLOCKLIST_UPDATE from the popup. Re-scan all tabs.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BLOCKLIST_UPDATE') {
    blockActiveTabs();
    sendResponse({ status: 'ok' });
  }
  return false;
});

/**
 * Watch for storage changes to blocklist (local) or settings (sync).
 * Automatically re-scan all tabs.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.blocklist) {
    blockActiveTabs();
  }
  if (area === 'sync' && changes.settings) {
    blockActiveTabs();
  }
});

