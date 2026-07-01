import { useState, useEffect, useRef } from 'react';
import { StorageAdapter } from '../../lib/storage-adapter';

const hasRuntime =
  typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage;

/**
 * Query the background service worker for the current tracking cursor.
 *
 * As a side-effect, the SW calls recordElapsedTime() before responding,
 * which snapshots all time up to this moment into its buffer and resets
 * trackingStartedAt to Date.now(). This gives the popup a clean zero-point
 * to tick from.
 *
 * @returns {Promise<{
 *   status: "tracking"|"paused",
 *   activeDomain: string|null,
 *   trackingStartedAt: number|null,
 *   bufferedUsage: Record<string, number>
 * }>}
 */
function queryCursor() {
  return new Promise((resolve) => {
    if (!hasRuntime) {
      resolve({ status: 'paused', activeDomain: null, trackingStartedAt: null, bufferedUsage: {} });
      return;
    }

    chrome.runtime.sendMessage({ type: 'GET_TRACKING_STATUS' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve({ status: 'paused', activeDomain: null, trackingStartedAt: null, bufferedUsage: {} });
        return;
      }
      resolve({
        status: response.status ?? 'paused',
        activeDomain: response.activeDomain ?? null,
        trackingStartedAt: response.trackingStartedAt ?? null,
        bufferedUsage: response.bufferedUsage ?? {},
      });
    });
  });
}

/**
 * Custom hook to fetch and live-update today's usage data with real-time ticking.
 *
 * Data is merged from three layers:
 *   1. Storage baseline  — last flushed value in chrome.storage.local
 *   2. Buffered usage    — in-memory usageBuffer snapshot from the SW (unflushed)
 *   3. Active elapsed    — Date.now() - trackingStartedAt, ticking every 1s
 *
 * This gives second-by-second accuracy in the UI without adding any extra
 * storage writes beyond the existing 30-second flush cycle.
 *
 * On each 30-second flush (detected via onStorageChanged), the hook re-queries
 * the SW for a fresh buffer snapshot and a reset trackingStartedAt, preventing
 * double-counting of time that has moved from bufferedUsage into the baseline.
 *
 * @param {number} topN — Number of top domains to return (default: 5)
 * @returns {{ usageData: Array<{domain: string, ms: number}>, totalMs: number, isLoading: boolean, error: string|null }}
 */
export function useUsageData(topN = 5) {
  // Layer 1: last flushed storage baseline
  const [storageBaseline, setStorageBaseline] = useState({});
  // Layer 2: SW in-memory buffer snapshot (unflushed time)
  const [bufferedUsage, setBufferedUsage] = useState({});
  // Layer 3: tick counter — incremented every 1s to trigger re-render
  const [tick, setTick] = useState(0);
  // Tracking status as React state so the indicator re-renders on changes
  const [isTracking, setIsTracking] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refs for the active cursor — stored in refs to avoid stale closures in setInterval
  const activeDomainRef = useRef(null);
  const trackingStartedAtRef = useRef(null);
  // Mirror of isTracking as a ref — lets the setInterval read current value without stale closure
  const isTrackingRef = useRef(false);

  // -------------------------------------------------------------------------
  // Initial load: fetch storage baseline and query the SW cursor
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Fetch storage baseline and SW cursor in parallel
        const [baseline, cursor] = await Promise.all([
          StorageAdapter.getTodayUsage(),
          queryCursor(),
        ]);

        if (cancelled) return;

        setStorageBaseline(baseline);
        setBufferedUsage(cursor.bufferedUsage);
        activeDomainRef.current = cursor.activeDomain;
        trackingStartedAtRef.current = cursor.trackingStartedAt;
        isTrackingRef.current = cursor.status === 'tracking';
        setIsTracking(cursor.status === 'tracking');
        setError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('[Focus] Failed to initialise usage data:', err);
        setError('Unable to load usage data.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // -------------------------------------------------------------------------
  // 1-second tick interval — only active while tracking
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isTrackingRef.current) return;

    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  // Re-run this effect whenever the tracking state changes (via the storage
  // change handler below, which updates isTrackingRef and forces a re-render
  // by updating state). We depend on bufferedUsage as a proxy signal for that.
  }, [bufferedUsage]);

  // -------------------------------------------------------------------------
  // Storage change listener — fires on every 30s flush
  // -------------------------------------------------------------------------
  useEffect(() => {
    const unsubscribe = StorageAdapter.onStorageChanged(async (changes, area) => {
      if (area !== 'local') return;

      const todayKey = StorageAdapter.getTodayKey();
      if (!changes[todayKey]) return;

      // Update the storage baseline from the new flushed value
      const newBaseline = changes[todayKey].newValue || {};
      setStorageBaseline(newBaseline);

      // Re-query the SW for a fresh buffer snapshot and reset tick zero-point.
      // This prevents double-counting: the old bufferedUsage is now part of
      // newBaseline, so we need a fresh (near-zero) buffer to add on top.
      try {
        const cursor = await queryCursor();
        setBufferedUsage(cursor.bufferedUsage);
        activeDomainRef.current = cursor.activeDomain;
        trackingStartedAtRef.current = cursor.trackingStartedAt;
        isTrackingRef.current = cursor.status === 'tracking';
        setIsTracking(cursor.status === 'tracking');
        // Reset the tick counter so elapsed restarts from zero
        setTick(0);
      } catch (err) {
        console.warn('[Focus] Failed to re-query cursor after flush:', err);
      }
    });

    return unsubscribe;
  }, []);

  // -------------------------------------------------------------------------
  // Merge all three layers into final display values
  // (recomputed on every render, including every 1s tick)
  // -------------------------------------------------------------------------
  const elapsedMs =
    isTrackingRef.current && trackingStartedAtRef.current
      ? Math.max(0, Date.now() - trackingStartedAtRef.current)
      : 0;

  // Build a merged domain map: baseline + buffer + active elapsed
  const mergedUsage = { ...storageBaseline };

  for (const [domain, ms] of Object.entries(bufferedUsage)) {
    mergedUsage[domain] = (mergedUsage[domain] || 0) + ms;
  }

  if (activeDomainRef.current && elapsedMs > 0) {
    mergedUsage[activeDomainRef.current] =
      (mergedUsage[activeDomainRef.current] || 0) + elapsedMs;
  }

  // Sort descending and slice to top-N
  const entries = Object.entries(mergedUsage)
    .map(([domain, ms]) => ({ domain, ms }))
    .sort((a, b) => b.ms - a.ms);

  const totalMs = entries.reduce((sum, entry) => sum + entry.ms, 0);
  const topDomains = entries.slice(0, topN);

  // eslint-disable-next-line no-unused-vars
  void tick; // consumed to trigger re-renders on each 1s interval tick

  return { usageData: topDomains, totalMs, isLoading, error, isTracking };
}
