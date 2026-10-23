/**
 * Usage Export — turns stored usage days into JSON log files.
 *
 * Files are saved to "<Downloads>/Focus Logs/" via the downloads API, which
 * works the same in Chrome and Firefox. Called from the popup, where
 * URL.createObjectURL is available in both browsers.
 */

import { formatDuration } from "./format.js";

const LOG_FOLDER = "Focus Logs";

/**
 * Build the log record for one day.
 * @param {string} date — "YYYY-MM-DD"
 * @param {Record<string, number>} usage — domain → ms
 */
export function buildDayLog(date, usage) {
  const sites = Object.entries(usage)
    .map(([domain, ms]) => ({ domain, ms, duration: formatDuration(ms) }))
    .sort((a, b) => b.ms - a.ms);
  const totalMs = sites.reduce((sum, site) => sum + site.ms, 0);

  return { date, totalMs, totalDuration: formatDuration(totalMs), sites };
}

/**
 * Save an object as a JSON file in the log folder.
 * Falls back to a plain link download outside the extension (Vite dev mode).
 * @param {string} filename — e.g. "usage_2026-10-22.json"
 * @param {object} data
 */
async function saveJson(filename, data) {
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));

  try {
    if (typeof chrome !== "undefined" && chrome?.downloads?.download) {
      await chrome.downloads.download({
        url,
        filename: `${LOG_FOLDER}/${filename}`,
        conflictAction: "overwrite",
        saveAs: false,
      });
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
    }
  } finally {
    // The download reads the blob asynchronously; give it time before revoking
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/**
 * Export a single day as "usage_YYYY-MM-DD.json".
 * @param {{ date: string, usage: Record<string, number> }} day
 */
export function exportDay({ date, usage }) {
  return saveJson(`usage_${date}.json`, buildDayLog(date, usage));
}

/**
 * Export several days as one "focus-history_<first>_to_<last>.json" file.
 * @param {Array<{ date: string, usage: Record<string, number> }>} days — newest first
 */
export function exportAllDays(days) {
  const newest = days[0].date;
  const oldest = days[days.length - 1].date;
  return saveJson(`focus-history_${oldest}_to_${newest}.json`, {
    from: oldest,
    to: newest,
    days: days.map(({ date, usage }) => buildDayLog(date, usage)),
  });
}
