import { useUsageData } from "../hooks/useUsageData";
import { useTrackingStatus } from "../hooks/useTrackingStatus";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format milliseconds into a human-readable time string.
 * @param {number} ms
 * @returns {string} e.g., "2h 15m", "45m", "30s"
 */
function formatTime(ms) {
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
 * Get a gradient color pair based on the domain's index/rank.
 * Higher-ranked (more time) domains get warmer colors.
 * @param {number} index — 0-based rank index
 * @returns {{ from: string, to: string }}
 */
const RANK_GRADIENTS = [
  { from: "from-violet-500", to: "to-fuchsia-500" },
  { from: "from-cyan-500", to: "to-blue-500" },
  { from: "from-emerald-500", to: "to-teal-500" },
  { from: "from-amber-500", to: "to-orange-500" },
  { from: "from-rose-500", to: "to-pink-500" },
];

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Animated circular indicator for total focus time.
 */
function TotalTimeCard({ totalMs, trackingStatus }) {
  const timeStr = formatTime(totalMs);

  const isTracking = trackingStatus === 'tracking';
  const isUnknown = trackingStatus === 'unknown';

  const dotColor = isTracking
    ? 'bg-emerald-500'
    : isUnknown
    ? 'bg-slate-400'
    : 'bg-amber-500';

  const pingColor = isTracking ? 'bg-emerald-400' : '';

  const label = isTracking ? 'Tracking' : isUnknown ? '—' : 'Paused';

  const labelColor = isTracking
    ? 'text-emerald-600 dark:text-emerald-400'
    : isUnknown
    ? 'text-slate-400 dark:text-slate-500'
    : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="relative rounded-2xl bg-white border border-slate-100 shadow-sm p-5 mb-4 overflow-hidden group dark:bg-[#1e2533] dark:border-slate-800">
      {/* Ambient glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-violet-500/20 rounded-full blur-3xl group-hover:bg-violet-500/30 transition-all duration-700" />
      <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-cyan-500/15 rounded-full blur-2xl group-hover:bg-cyan-500/25 transition-all duration-700" />

      <div className="relative z-10 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1 dark:text-slate-400">
            Today's Screen Time
          </p>
          <p className="text-3xl font-bold tracking-tight">
            <span className="text-slate-900 dark:text-white">{timeStr}</span>
          </p>
        </div>

        {/* Dynamic tracking indicator */}
        <div className="flex items-center gap-2">
          <div className="relative flex h-3 w-3">
            {isTracking && (
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pingColor} opacity-75`} />
            )}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${dotColor} transition-colors duration-300`} />
          </div>
          <span className={`text-[10px] font-medium transition-colors duration-300 ${labelColor}`}>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Single domain usage row with animated progress bar.
 */
function DomainRow({ domain, ms, maxMs, index }) {
  const percentage = maxMs > 0 ? Math.round((ms / maxMs) * 100) : 0;
  const timeStr = formatTime(ms);
  const gradient = RANK_GRADIENTS[index % RANK_GRADIENTS.length];

  return (
    <div className="group py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {/* Favicon */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            alt=""
            className="w-4 h-4 rounded-sm flex-shrink-0"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
          <span className="text-[13px] font-medium text-slate-700 truncate dark:text-slate-200">
            {domain}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-500 tabular-nums flex-shrink-0 ml-2 dark:text-slate-400">
          {timeStr}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden dark:bg-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient.from} ${gradient.to} transition-all duration-1000 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Dashboard Component
// =============================================================================

/**
 * Dashboard — Displays today's total screen time and top 5 domains.
 *
 * Uses the useUsageData hook for real-time data from StorageAdapter.
 * Fully decoupled from chrome.storage — all data flows through the hook.
 */
export default function Dashboard() {
  const { usageData, totalMs, isLoading, error } = useUsageData(5);
  const { trackingStatus } = useTrackingStatus();

  // The max value among top domains (for relative progress bars)
  const maxMs = usageData.length > 0 ? usageData[0].ms : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin mb-3 dark:border-violet-400/30 dark:border-t-violet-400" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Loading usage data...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-center dark:bg-red-500/10 dark:border-red-500/20">
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Total Time Card */}
      <TotalTimeCard totalMs={totalMs} trackingStatus={trackingStatus} />

      {/* Top Domains */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 dark:bg-[#1e2533] dark:border-slate-800">
        <h2 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-3 dark:text-slate-400">
          Top Sites
        </h2>

        {usageData.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-2xl mb-2 opacity-50">🌐</div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No browsing data yet today.
            </p>
            <p className="text-[10px] text-slate-400 mt-1 dark:text-slate-500">
              Start browsing — your usage will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {usageData.map((entry, index) => (
              <DomainRow
                key={entry.domain}
                domain={entry.domain}
                ms={entry.ms}
                maxMs={maxMs}
                index={index}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
