/**
 * Focus — Background Service Worker
 *
 * Tracking Engine with Alarm-based Flushing & Service Worker Survival.
 *
 * Architecture:
 *   Chrome tab/window/idle events → in-memory buffer → chrome.storage.local
 *
 * MV3 Design:
 *   - Service workers are killed by Chrome at any time (not just on restart).
 *   - setInterval() dies with the SW → replaced with chrome.alarms (persistent).
 *   - In-memory state is restored from chrome.storage.local on every SW start.
 *   - Tracking cursor (activeDomain + trackingStartedAt) is persisted on every
 *     state transition so no data is lost between SW restarts.
 *
 * Flush triggers:
 *   - "focus-flush" alarm (every 30 seconds) — survives SW restarts
 *   - Active tab changes (tabs.onActivated)
 *   - URL changes within active tab (tabs.onUpdated)
 *   - Window focus changes (windows.onFocusChanged)
 *   - Idle state changes (idle.onStateChanged)
 *   - SW suspension (runtime.onSuspend) — last-chance save before SW is killed
 *
 * Storage format:
 *   Key: "usage_YYYY-MM-DD"
 *   Value: { "youtube.com": 45000, "github.com": 120000, ... }  (ms per domain)
 */

import { StorageAdapter } from './lib/storage-adapter.js';

// =============================================================================
// Constants
// =============================================================================

const FLUSH_ALARM_NAME = 'focus-flush';
const FLUSH_INTERVAL_MINUTES = 0.5;           // 30 seconds
const IDLE_THRESHOLD_SECONDS = 60;            // 1 minute
const MAX_CREDITABLE_MS = 60_000;             // Cap recovered time to 60s to avoid counting sleep/idle gaps
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

/** @type {boolean} Whether the user is currently active (not idle/locked) */
let isUserActive = true;

/** @type {boolean} Whether a browser window is focused */
let isWindowFocused = true;

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

  for (const prefix of INTERNAL_URL_PREFIXES) {
    if (url.startsWith(prefix)) return null;
  }

  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '') || null;
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
 * Record elapsed time for the active domain into the in-memory buffer.
 * Resets the tracking timer start so the next call only counts new time.
 */
function recordElapsedTime() {
  if (!activeDomain || !trackingStartedAt) return;

  const elapsed = Date.now() - trackingStartedAt;
  if (elapsed > 0) {
    const current = usageBuffer.get(activeDomain) || 0;
    usageBuffer.set(activeDomain, current + elapsed);
  }

  // Reset timer to now — still on this domain, just snaphotting the interval
  trackingStartedAt = Date.now();
}

/**
 * Flush the in-memory buffer to chrome.storage.local.
 * Merges buffered values with existing stored data for today.
 * On failure, restores the buffer so data is not lost.
 */
async function flushBuffer() {
  if (usageBuffer.size === 0) return;

  // Snapshot and clear atomically before async work
  const snapshot = new Map(usageBuffer);
  usageBuffer.clear();

  const todayKey = getTodayKey();

  try {
    const result = await chrome.storage.local.get(todayKey);
    const existing = result[todayKey] || {};

    for (const [domain, ms] of snapshot) {
      existing[domain] = (existing[domain] || 0) + ms;
    }

    await chrome.storage.local.set({ [todayKey]: existing });
  } catch (error) {
    // Restore buffer on failure so data isn't lost on next flush
    for (const [domain, ms] of snapshot) {
      const current = usageBuffer.get(domain) || 0;
      usageBuffer.set(domain, current + ms);
    }
    console.error('[Focus] Failed to flush buffer:', error);
  }
}

/**
 * Persist current tracking cursor to storage so it survives SW restarts.
 */
async function saveState() {
  try {
    await StorageAdapter.saveTrackingState({ activeDomain, trackingStartedAt });
  } catch (error) {
    console.warn('[Focus] Failed to save tracking state:', error);
  }
}

// =============================================================================
// Tracking Control
// =============================================================================

/**
 * Start tracking a new domain. Records elapsed time for the previous domain.
 * Persists the new cursor to storage.
 * @param {string|null} domain
 */
async function startTracking(domain) {
  recordElapsedTime();
  activeDomain = domain;
  trackingStartedAt = domain ? Date.now() : null;
  await saveState();
}

/**
 * Pause all tracking (e.g., when idle or window loses focus).
 * Records elapsed time and persists the paused state.
 */
async function pauseTracking() {
  recordElapsedTime();
  trackingStartedAt = null;
  await saveState();
}

/**
 * Resume tracking the current domain (e.g., when user returns from idle).
 * Persists the resumed state.
 */
async function resumeTracking() {
  if (activeDomain) {
    trackingStartedAt = Date.now();
    await saveState();
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
    await startTracking(domain);
  } catch (error) {
    console.warn('[Focus] Tab activation handler error:', error);
  }
}

/**
 * Handle tab URL updates (e.g., navigation within a tab).
 * @param {number} tabId
 * @param {{ url?: string }} changeInfo
 */
async function onTabUpdated(tabId, changeInfo) {
  if (!changeInfo.url) return;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id === tabId) {
      const domain = extractDomain(changeInfo.url);
      await flushBuffer();
      await startTracking(domain);
    }
  } catch (error) {
    console.warn('[Focus] Tab update handler error:', error);
  }
}

/**
 * Handle window focus changes.
 * @param {number} windowId — WINDOW_ID_NONE (-1) if no window is focused
 */
async function onWindowFocusChanged(windowId) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    isWindowFocused = false;
    await pauseTracking();
    await flushBuffer();
  } else {
    isWindowFocused = true;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId });
      if (activeTab) {
        const domain = extractDomain(activeTab.url);
        await startTracking(domain);
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
      await resumeTracking();
    }
  } else {
    // "idle" or "locked"
    isUserActive = false;
    await pauseTracking();
    await flushBuffer();
  }
}

// =============================================================================
// Alarm Handler
// =============================================================================

/**
 * Periodic flush tick — triggered by the "focus-flush" chrome.alarm every 30s.
 * Unlike setInterval, chrome.alarms survive service worker restarts.
 */
async function onAlarm(alarm) {
  if (alarm.name !== FLUSH_ALARM_NAME) return;

  if (activeDomain && trackingStartedAt) {
    recordElapsedTime();
  }
  await flushBuffer();
  await saveState();
}

// =============================================================================
// Alarm Setup
// =============================================================================

/**
 * Ensure the persistent flush alarm is registered.
 * chrome.alarms survive SW restarts, but we re-create to avoid duplicates.
 */
async function ensureAlarm() {
  // Clear any stale alarm before creating a fresh one
  await chrome.alarms.clear(FLUSH_ALARM_NAME);
  await chrome.alarms.create(FLUSH_ALARM_NAME, {
    periodInMinutes: FLUSH_INTERVAL_MINUTES,
    delayInMinutes: FLUSH_INTERVAL_MINUTES,
  });
}

// =============================================================================
// Initialization (runs on EVERY service worker start)
// =============================================================================

/**
 * Restore persisted state and resume tracking.
 *
 * This runs as a top-level async IIFE so it executes on every SW instantiation,
 * not just onInstalled/onStartup. This is the correct MV3 pattern.
 */
(async () => {
  try {
    // Step 1: Restore previously persisted tracking cursor
    const saved = await StorageAdapter.getTrackingState();
    activeDomain = saved.activeDomain;
    const savedStartedAt = saved.trackingStartedAt;

    // Step 2: If we were tracking something when the SW was killed,
    //         credit the elapsed time — but cap it to avoid counting sleep/idle gaps.
    if (activeDomain && savedStartedAt) {
      const elapsed = Date.now() - savedStartedAt;
      const creditable = Math.min(elapsed, MAX_CREDITABLE_MS);
      if (creditable > 0) {
        const current = usageBuffer.get(activeDomain) || 0;
        usageBuffer.set(activeDomain, current + creditable);
      }
    }

    // Step 3: Flush any recovered time immediately to storage
    await flushBuffer();

    // Step 4: Query the currently active tab and begin fresh tracking
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab) {
      const domain = extractDomain(activeTab.url);
      await startTracking(domain);
    } else {
      // No active tab — persist the cleared state
      trackingStartedAt = null;
      await saveState();
    }

    // Step 5: Ensure the alarm is registered
    await ensureAlarm();

    // Step 6: Configure idle detection threshold
    chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

    console.log('[Focus] Tracking engine initialized.');
  } catch (error) {
    console.error('[Focus] Initialization error:', error);
  }
})();

// =============================================================================
// Event Listeners
// =============================================================================

// Tab events
chrome.tabs.onActivated.addListener(onTabActivated);
chrome.tabs.onUpdated.addListener(onTabUpdated);

// Window events
chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);

// Idle events
chrome.idle.onStateChanged.addListener(onIdleStateChanged);

// Alarm events — periodic flush (replaces setInterval)
chrome.alarms.onAlarm.addListener(onAlarm);

// onSuspend — last-chance save before Chrome kills the service worker
chrome.runtime.onSuspend.addListener(async () => {
  recordElapsedTime();
  await flushBuffer();
  await saveState();
  console.log('[Focus] SW suspended — state saved.');
});

// onInstalled — first-install logging only (tracking init is handled by the IIFE above)
chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log(`[Focus] Extension ${reason} — tracking engine running.`);
});

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
// Tracking Status Query
// =============================================================================

/**
 * Derive the current tracking status from in-memory state.
 * @returns {"tracking"|"paused"}
 */
function getTrackingStatus() {
  if (activeDomain && isUserActive && isWindowFocused) {
    return 'tracking';
  }
  return 'paused';
}

// =============================================================================
// Blocklist Change Listeners
// =============================================================================

/**
 * Listen for messages from the popup:
 *   - BLOCKLIST_UPDATE  → re-scan all tabs for blocked domains.
 *   - GET_TRACKING_STATUS → respond with the current tracking status.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BLOCKLIST_UPDATE') {
    blockActiveTabs();
    sendResponse({ status: 'ok' });
    return false;
  }

  if (message.type === 'GET_TRACKING_STATUS') {
    sendResponse({ status: getTrackingStatus() });
    return false;
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
