import { useUsageData } from '../hooks/useUsageData';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format milliseconds into a human-readable time string.
 * @param {number} ms
 * @returns {string} e.g., "2h 15m", "45m", "30s"
 */
function formatTime(ms) {
  if (ms < 1000) return '0s';

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
  { from: 'from-violet-500', to: 'to-fuchsia-500' },
  { from: 'from-cyan-500', to: 'to-blue-500' },
  { from: 'from-emerald-500', to: 'to-teal-500' },
  { from: 'from-amber-500', to: 'to-orange-500' },
  { from: 'from-rose-500', to: 'to-pink-500' },
];

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Animated circular indicator for total focus time.
 */
function TotalTimeCard({ totalMs }) {
  const timeStr = formatTime(totalMs);

  return (
    <div className="relative rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-5 mb-4 overflow-hidden group">
      {/* Ambient glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-violet-500/20 rounded-full blur-3xl group-hover:bg-violet-500/30 transition-all duration-700" />
      <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-cyan-500/15 rounded-full blur-2xl group-hover:bg-cyan-500/25 transition-all duration-700" />

      <div className="relative z-10 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Today's Screen Time
          </p>
          <p className="text-3xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              {timeStr}
            </span>
          </p>
        </div>

        {/* Pulse indicator */}
        <div className="flex items-center gap-2">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </div>
          <span className="text-[10px] text-emerald-400 font-medium">Tracking</span>
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
              e.target.style.display = 'none';
            }}
          />
          <span className="text-[13px] font-medium text-slate-200 truncate">
            {domain}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-slate-400 tabular-nums flex-shrink-0 ml-2">
          {timeStr}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
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

  // The max value among top domains (for relative progress bars)
  const maxMs = usageData.length > 0 ? usageData[0].ms : 0;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-400">Loading usage data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-center">
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Total Time Card */}
      <TotalTimeCard totalMs={totalMs} />

      {/* Top Domains */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
        <h2 className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-3">
          Top Sites
        </h2>

        {usageData.length === 0 ? (
          <div className="text-center py-6">
            <div className="text-2xl mb-2 opacity-50">🌐</div>
            <p className="text-xs text-slate-500">
              No browsing data yet today.
            </p>
            <p className="text-[10px] text-slate-600 mt-1">
              Start browsing — your usage will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
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
