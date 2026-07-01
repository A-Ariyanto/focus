import { useState, useEffect } from 'react';

/**
 * Custom hook to query the background service worker for the current
 * web usage tracking status.
 *
 * - Sends a GET_TRACKING_STATUS message to the SW on mount.
 * - A single fetch is sufficient: the popup opening causes the browser window
 *   to shift focus to the popup, which itself pauses tracking. The status
 *   will not change again while the popup is open.
 * - Gracefully degrades to "paused" when chrome.runtime is unavailable
 *   (e.g., Vite dev/preview mode).
 *
 * @returns {{ trackingStatus: "tracking"|"paused"|"unknown", isStatusLoading: boolean }}
 */
export function useTrackingStatus() {
  const [trackingStatus, setTrackingStatus] = useState('unknown');
  const [isStatusLoading, setIsStatusLoading] = useState(true);

  useEffect(() => {
    const hasRuntime =
      typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage;

    if (!hasRuntime) {
      // Dev/preview environment — no background worker available
      setTrackingStatus('paused');
      setIsStatusLoading(false);
      return;
    }

    chrome.runtime.sendMessage({ type: 'GET_TRACKING_STATUS' }, (response) => {
      if (chrome.runtime.lastError) {
        // SW may not be running yet — degrade gracefully
        console.warn('[Focus] Could not reach background SW:', chrome.runtime.lastError.message);
        setTrackingStatus('unknown');
      } else {
        setTrackingStatus(response?.status ?? 'unknown');
      }
      setIsStatusLoading(false);
    });
  }, []);

  return { trackingStatus, isStatusLoading };
}
