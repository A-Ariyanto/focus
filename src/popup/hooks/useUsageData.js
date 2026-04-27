import { useState, useEffect, useCallback } from 'react';
import { StorageAdapter } from '../../lib/storage-adapter';

/**
 * Custom hook to fetch and live-update today's usage data.
 *
 * - Fetches usage data from StorageAdapter on mount.
 * - Subscribes to chrome.storage.onChanged for real-time updates.
 * - Returns sorted top domains and total time.
 *
 * @param {number} topN — Number of top domains to return (default: 5)
 * @returns {{ usageData: Array<{domain: string, ms: number}>, totalMs: number, isLoading: boolean, error: string|null }}
 */
export function useUsageData(topN = 5) {
  const [rawUsage, setRawUsage] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch usage data
  const fetchUsage = useCallback(async () => {
    try {
      const data = await StorageAdapter.getTodayUsage();
      setRawUsage(data);
      setError(null);
    } catch (err) {
      console.error('[Focus] Failed to fetch usage data:', err);
      setError('Unable to load usage data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();

    // Subscribe to storage changes for real-time updates
    const unsubscribe = StorageAdapter.onStorageChanged((changes, area) => {
      if (area !== 'local') return;

      const todayKey = StorageAdapter.getTodayKey();
      if (changes[todayKey]) {
        setRawUsage(changes[todayKey].newValue || {});
      }
    });

    return unsubscribe;
  }, [fetchUsage]);

  // Derive sorted top-N domains and total time
  const entries = Object.entries(rawUsage)
    .map(([domain, ms]) => ({ domain, ms }))
    .sort((a, b) => b.ms - a.ms);

  const totalMs = entries.reduce((sum, entry) => sum + entry.ms, 0);
  const topDomains = entries.slice(0, topN);

  return { usageData: topDomains, totalMs, isLoading, error };
}
