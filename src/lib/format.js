/**
 * Time formatting helpers shared by the popup views and log exports.
 */

/**
 * Format milliseconds into a human-readable time string.
 * @param {number} ms
 * @returns {string} e.g., "2h 15m", "45m", "30s"
 */
export function formatTime(ms) {
  if (ms < 1000) return "0s";

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Format milliseconds as a fixed-width "HH:MM:SS" duration.
 * @param {number} ms
 * @returns {string} e.g., "01:02:05"
 */
export function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
