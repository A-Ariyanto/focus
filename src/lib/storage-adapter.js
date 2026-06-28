/**
 * StorageAdapter — Centralized abstraction for chrome.storage
 *
 * Decouples all UI and background code from raw chrome.storage API calls.
 *
 * Storage strategy:
 *   - chrome.storage.local  → Usage stats + blocklist (10 MB quota, fast)
 *   - chrome.storage.sync   → Settings only (100 KB quota, syncs across devices)
 *
 * Key format:
 *   - Usage data: "usage_YYYY-MM-DD" → { domain: ms, ... }
 *   - Blocklist:  "blocklist"        → ["domain1.com", "domain2.com", ...]
 *   - Settings:   "settings"         → { blockingEnabled: boolean, ... }
 */

// =============================================================================
// Default Values
// =============================================================================

/**
 * Default granular YouTube Focus options.
 * Each key maps to a single CSS file that gets injected/removed on demand.
 */
const DEFAULT_YOUTUBE_FOCUS = {
  /** Master kill-switch — must be true for any individual option to take effect */
  active: true,
  /** Hide the homepage video grid feed */
  hideFeed: true,
  /** Hide the watch-page right sidebar (related/recommended videos) */
  hideSidebar: true,
  /** Hide the comments section */
  hideComments: true,
  /** Hide endscreen overlay cards at end of video */
  hideEndscreen: true,
  /** Hide Shorts from all surfaces (sidebar nav, shelves) */
  hideShorts: true,
  /** Hide the merch shelf below videos */
  hideMerch: true,
  /** Hide the left navigation guide / mini-guide */
  hideSubBar: false,
  /** Hide the Trending/Explore navigation entry */
  hideTrending: false,
  /** Hide the notification bell */
  hideNotificationBell: false,
  /** Hide the live chat panel on streams */
  hideLiveChat: false,
  /** Disable autoplay by clicking the toggle after 5 seconds */
  disableAutoplay: false,
};

const DEFAULT_SETTINGS = {
  blockingEnabled: true,
  youtubeFocus: DEFAULT_YOUTUBE_FOCUS,
};

// =============================================================================
// Dev Storage Shim (for Vite preview)
// =============================================================================

const hasChromeStorage =
  typeof chrome !== 'undefined' &&
  chrome?.storage?.local &&
  chrome?.storage?.sync &&
  chrome?.storage?.onChanged;

let memoryStorage = null;
const memoryStore = {
  local: {},
  sync: {},
};
const memoryListeners = new Set();

function getStorage() {
  if (hasChromeStorage) return chrome.storage;

  if (!memoryStorage) {
    memoryStorage = createMemoryStorage();
  }

  return memoryStorage;
}

function createMemoryStorage() {
  return {
    local: createMemoryArea('local'),
    sync: createMemoryArea('sync'),
    onChanged: {
      addListener: (listener) => memoryListeners.add(listener),
      removeListener: (listener) => memoryListeners.delete(listener),
    },
  };
}

function createMemoryArea(area) {
  return {
    get: async (keys) => {
      const store = memoryStore[area];

      if (keys == null) {
        return { ...store };
      }

      if (typeof keys === 'string') {
        return { [keys]: store[keys] };
      }

      if (Array.isArray(keys)) {
        const result = {};
        for (const key of keys) {
          result[key] = store[key];
        }
        return result;
      }

      if (typeof keys === 'object') {
        const result = {};
        for (const [key, defaultValue] of Object.entries(keys)) {
          result[key] = store[key] ?? defaultValue;
        }
        return result;
      }

      return {};
    },

    set: async (items) => {
      const store = memoryStore[area];
      const changes = {};

      for (const [key, newValue] of Object.entries(items)) {
        const oldValue = store[key];
        store[key] = newValue;

        if (!Object.is(oldValue, newValue)) {
          changes[key] = { oldValue, newValue };
        }
      }

      if (Object.keys(changes).length > 0) {
        emitChanges(area, changes);
      }
    },

    remove: async (keys) => {
      const store = memoryStore[area];
      const list = Array.isArray(keys) ? keys : [keys];
      const changes = {};

      for (const key of list) {
        if (Object.prototype.hasOwnProperty.call(store, key)) {
          const oldValue = store[key];
          delete store[key];
          changes[key] = { oldValue, newValue: undefined };
        }
      }

      if (Object.keys(changes).length > 0) {
        emitChanges(area, changes);
      }
    },
  };
}

function emitChanges(area, changes) {
  for (const listener of memoryListeners) {
    listener(changes, area);
  }
}

// =============================================================================
// StorageAdapter Class
// =============================================================================

export class StorageAdapter {
  // ===========================================================================
  // Date Helpers
  // ===========================================================================

  /**
   * Get the storage key for today's usage data.
   * @returns {string} e.g., "usage_2026-04-27"
   */
  static getTodayKey() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `usage_${yyyy}-${mm}-${dd}`;
  }

  /**
   * Get the storage key for a specific date.
   * @param {Date} date
   * @returns {string}
   */
  static getKeyForDate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `usage_${yyyy}-${mm}-${dd}`;
  }

  // ===========================================================================
  // Usage Stats (chrome.storage.local)
  // ===========================================================================

  /**
   * Get today's usage data.
   * @returns {Promise<Record<string, number>>} domain → milliseconds
   */
  static async getTodayUsage() {
    const key = StorageAdapter.getTodayKey();
    const result = await getStorage().local.get(key);
    return result[key] || {};
  }

  /**
   * Get usage data for a specific date.
   * @param {Date} date
   * @returns {Promise<Record<string, number>>} domain → milliseconds
   */
  static async getUsageForDate(date) {
    const key = StorageAdapter.getKeyForDate(date);
    const result = await getStorage().local.get(key);
    return result[key] || {};
  }

  /**
   * Add usage time for a domain to today's data.
   * Merges with existing data (additive).
   * @param {string} domain
   * @param {number} ms — milliseconds to add
   */
  static async addUsage(domain, ms) {
    const key = StorageAdapter.getTodayKey();
    const result = await getStorage().local.get(key);
    const existing = result[key] || {};

    existing[domain] = (existing[domain] || 0) + ms;
    await getStorage().local.set({ [key]: existing });
  }

  /**
   * Bulk-merge a usage map into today's data.
   * @param {Record<string, number>} usageMap — { domain: ms, ... }
   */
  static async mergeUsage(usageMap) {
    const key = StorageAdapter.getTodayKey();
    const result = await getStorage().local.get(key);
    const existing = result[key] || {};

    for (const [domain, ms] of Object.entries(usageMap)) {
      existing[domain] = (existing[domain] || 0) + ms;
    }

    await getStorage().local.set({ [key]: existing });
  }

  // ===========================================================================
  // Blocklist (chrome.storage.local)
  // ===========================================================================

  /**
   * Get the current blocklist.
   * @returns {Promise<string[]>} Array of blocked domains
   */
  static async getBlocklist() {
    const result = await getStorage().local.get('blocklist');
    return result.blocklist || [];
  }

  /**
   * Add a domain to the blocklist (deduplicated).
   * @param {string} domain
   */
  static async addToBlocklist(domain) {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    const blocklist = await StorageAdapter.getBlocklist();

    if (!blocklist.includes(normalized)) {
      blocklist.push(normalized);
      await getStorage().local.set({ blocklist });
    }
  }

  /**
   * Remove a domain from the blocklist.
   * @param {string} domain
   */
  static async removeFromBlocklist(domain) {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    const blocklist = await StorageAdapter.getBlocklist();
    const updated = blocklist.filter((d) => d !== normalized);
    await getStorage().local.set({ blocklist: updated });
  }

  /**
   * Check if a domain is on the blocklist.
   * Supports subdomain matching: "m.youtube.com" matches "youtube.com".
   * @param {string} domain
   * @returns {Promise<boolean>}
   */
  static async isBlocked(domain) {
    const normalized = domain.toLowerCase().replace(/^www\./, '');
    const blocklist = await StorageAdapter.getBlocklist();
    return blocklist.some(
      (blocked) => normalized === blocked || normalized.endsWith('.' + blocked)
    );
  }

  // ===========================================================================
  // Settings (chrome.storage.sync)
  // ===========================================================================

  /**
   * Get all user settings, merged with defaults.
   * Also handles migration from legacy `youtubeCleanMode` boolean.
   * @returns {Promise<{ blockingEnabled: boolean, youtubeFocus: object }>}
   */
  static async getSettings() {
    const result = await getStorage().sync.get('settings');
    const raw = result.settings || {};

    // -------------------------------------------------------------------------
    // Migration: youtubeCleanMode (boolean) → youtubeFocus.active
    // Runs once and writes back the migrated value to storage.
    // -------------------------------------------------------------------------
    if ('youtubeCleanMode' in raw && !('youtubeFocus' in raw)) {
      const migrated = {
        ...DEFAULT_SETTINGS,
        ...raw,
        youtubeFocus: {
          ...DEFAULT_YOUTUBE_FOCUS,
          active: raw.youtubeCleanMode !== false,
        },
      };
      delete migrated.youtubeCleanMode;
      await getStorage().sync.set({ settings: migrated });
      return migrated;
    }

    // Merge top-level settings with defaults, then deeply merge youtubeFocus
    const settings = { ...DEFAULT_SETTINGS, ...raw };
    settings.youtubeFocus = { ...DEFAULT_YOUTUBE_FOCUS, ...(raw.youtubeFocus || {}) };

    return settings;
  }

  /**
   * Update top-level settings with a partial object (shallow merge).
   * @param {Partial<{ blockingEnabled: boolean, youtubeFocus: object }>} partial
   */
  static async updateSettings(partial) {
    const current = await StorageAdapter.getSettings();
    const updated = { ...current, ...partial };
    await getStorage().sync.set({ settings: updated });
  }

  /**
   * Get only the YouTube Focus sub-options, merged with defaults.
   * @returns {Promise<typeof DEFAULT_YOUTUBE_FOCUS>}
   */
  static async getYoutubeFocusOptions() {
    const settings = await StorageAdapter.getSettings();
    return settings.youtubeFocus;
  }

  /**
   * Update individual YouTube Focus options (deep partial merge).
   * Preserves all other settings and other youtubeFocus keys.
   * @param {Partial<typeof DEFAULT_YOUTUBE_FOCUS>} partial
   */
  static async updateYoutubeFocusOptions(partial) {
    const current = await StorageAdapter.getSettings();
    const updated = {
      ...current,
      youtubeFocus: { ...current.youtubeFocus, ...partial },
    };
    await getStorage().sync.set({ settings: updated });
  }

  // ===========================================================================
  // Data Management
  // ===========================================================================

  /**
   * Remove usage data older than N days.
   * @param {number} daysToKeep — number of days of data to retain
   */
  static async clearOldData(daysToKeep = 30) {
    const allData = await getStorage().local.get(null);
    const keysToRemove = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    for (const key of Object.keys(allData)) {
      if (!key.startsWith('usage_')) continue;

      const dateStr = key.replace('usage_', '');
      const keyDate = new Date(dateStr);

      if (!isNaN(keyDate.getTime()) && keyDate < cutoff) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await getStorage().local.remove(keysToRemove);
    }

    return keysToRemove.length;
  }

  // ===========================================================================
  // Listeners
  // ===========================================================================

  /**
   * Subscribe to storage changes. Returns an unsubscribe function.
   * @param {(changes: object, area: string) => void} callback
   * @returns {() => void} unsubscribe function
   */
  static onStorageChanged(callback) {
    const storage = getStorage();
    storage.onChanged.addListener(callback);
    return () => storage.onChanged.removeListener(callback);
  }
}
