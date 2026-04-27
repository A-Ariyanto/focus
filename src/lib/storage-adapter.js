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

const DEFAULT_SETTINGS = {
  blockingEnabled: true,
};

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
    const result = await chrome.storage.local.get(key);
    return result[key] || {};
  }

  /**
   * Get usage data for a specific date.
   * @param {Date} date
   * @returns {Promise<Record<string, number>>} domain → milliseconds
   */
  static async getUsageForDate(date) {
    const key = StorageAdapter.getKeyForDate(date);
    const result = await chrome.storage.local.get(key);
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
    const result = await chrome.storage.local.get(key);
    const existing = result[key] || {};

    existing[domain] = (existing[domain] || 0) + ms;
    await chrome.storage.local.set({ [key]: existing });
  }

  /**
   * Bulk-merge a usage map into today's data.
   * @param {Record<string, number>} usageMap — { domain: ms, ... }
   */
  static async mergeUsage(usageMap) {
    const key = StorageAdapter.getTodayKey();
    const result = await chrome.storage.local.get(key);
    const existing = result[key] || {};

    for (const [domain, ms] of Object.entries(usageMap)) {
      existing[domain] = (existing[domain] || 0) + ms;
    }

    await chrome.storage.local.set({ [key]: existing });
  }

  // ===========================================================================
  // Blocklist (chrome.storage.local)
  // ===========================================================================

  /**
   * Get the current blocklist.
   * @returns {Promise<string[]>} Array of blocked domains
   */
  static async getBlocklist() {
    const result = await chrome.storage.local.get('blocklist');
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
      await chrome.storage.local.set({ blocklist });
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
    await chrome.storage.local.set({ blocklist: updated });
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
   * @returns {Promise<{ blockingEnabled: boolean }>}
   */
  static async getSettings() {
    const result = await chrome.storage.sync.get('settings');
    return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
  }

  /**
   * Update settings with a partial object (shallow merge).
   * @param {Partial<{ blockingEnabled: boolean }>} partial
   */
  static async updateSettings(partial) {
    const current = await StorageAdapter.getSettings();
    const updated = { ...current, ...partial };
    await chrome.storage.sync.set({ settings: updated });
  }

  // ===========================================================================
  // Data Management
  // ===========================================================================

  /**
   * Remove usage data older than N days.
   * @param {number} daysToKeep — number of days of data to retain
   */
  static async clearOldData(daysToKeep = 30) {
    const allData = await chrome.storage.local.get(null);
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
      await chrome.storage.local.remove(keysToRemove);
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
    chrome.storage.onChanged.addListener(callback);
    return () => chrome.storage.onChanged.removeListener(callback);
  }
}
