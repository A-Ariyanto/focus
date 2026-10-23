import { useState, useEffect } from "react";
import { StorageAdapter } from "../../lib/storage-adapter";
import { formatTime } from "../../lib/format";
import { exportDay, exportAllDays } from "../../lib/usage-export";

const HISTORY_DAYS = 30;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Label a "YYYY-MM-DD" date as "Today", "Yesterday", or e.g. "Wed, Oct 21".
 * Builds the Date from parts so it stays in local time.
 * @param {string} date
 * @returns {string}
 */
function formatDayLabel(date) {
  const [yyyy, mm, dd] = date.split("-").map(Number);
  const day = new Date(yyyy, mm - 1, dd);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today - day) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Sum a day's usage map.
 * @param {Record<string, number>} usage
 * @returns {number}
 */
function totalOf(usage) {
  return Object.values(usage).reduce((sum, ms) => sum + ms, 0);
}

// =============================================================================
// Sub-components
// =============================================================================

function ExportButton({ onClick, disabled, saving, children, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`text-[10px] font-medium px-2 py-1 rounded-md transition-all duration-200 ${
        disabled
          ? "text-slate-300 cursor-not-allowed dark:text-slate-600"
          : "text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-95 dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-white/5"
      }`}
    >
      {saving ? "Saving…" : children}
    </button>
  );
}

// =============================================================================
// History Component
// =============================================================================

/**
 * History — Lists the stored usage days (last 30) and exports them as JSON
 * log files, either one day at a time or all together.
 */
export default function History() {
  const [days, setDays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const history = await StorageAdapter.getUsageHistory();
        if (!cancelled) setDays(history);
      } catch (err) {
        console.error("[Focus] Failed to load history:", err);
        if (!cancelled) setError("Unable to load history.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    // Refresh when a flush updates a day or the retention cleanup removes one
    const unsubscribe = StorageAdapter.onStorageChanged((changes, area) => {
      if (area !== "local") return;
      if (Object.keys(changes).some((key) => key.startsWith("usage_"))) load();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function runExport(id, fn) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      console.error("[Focus] Export failed:", err);
      setError("Export failed. Check the browser's download settings.");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mb-3 dark:border-violet-400/30 dark:border-t-violet-400" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Loading history...
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 dark:bg-[#1e2533] dark:border-slate-800">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider dark:text-slate-400">
          History
          {days.length > 0 && (
            <span className="ml-1.5 text-slate-400 dark:text-slate-500">
              ({days.length})
            </span>
          )}
        </h2>
        {days.length > 0 && (
          <ExportButton
            onClick={() => runExport("all", () => exportAllDays(days))}
            disabled={busyId !== null}
            saving={busyId === "all"}
            label="Export all days"
          >
            Export all
          </ExportButton>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mb-3 dark:text-slate-500">
        Kept for {HISTORY_DAYS} days. Exports save to Downloads/Focus Logs.
      </p>

      {error && (
        <p className="text-[10px] text-red-600 mb-2 dark:text-red-400">{error}</p>
      )}

      {days.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-2xl mb-2 opacity-50">🗓️</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No history yet.
          </p>
          <p className="text-[10px] text-slate-400 mt-1 dark:text-slate-500">
            Each day you browse will appear here.
          </p>
        </div>
      ) : (
        <ul className="scroll-list max-h-72 -mr-2 pr-2 space-y-1">
          {days.map((day) => {
            const siteCount = Object.keys(day.usage).length;
            return (
              <li
                key={day.date}
                className="flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 hover:bg-slate-50 dark:hover:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate dark:text-slate-200">
                    {formatDayLabel(day.date)}
                  </p>
                  <p className="text-[10px] text-slate-400 tabular-nums dark:text-slate-500">
                    {formatTime(totalOf(day.usage))} · {siteCount} {siteCount === 1 ? "site" : "sites"}
                  </p>
                </div>
                <ExportButton
                  onClick={() => runExport(day.date, () => exportDay(day))}
                  disabled={busyId !== null}
                  saving={busyId === day.date}
                  label={`Export ${day.date}`}
                >
                  Export
                </ExportButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
