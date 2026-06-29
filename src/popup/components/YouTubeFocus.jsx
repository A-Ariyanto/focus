import { useState, useEffect, useCallback } from "react";
import { StorageAdapter } from "../../lib/storage-adapter";

/**
 * YouTubeFocus — Granular YouTube distraction-removal settings tab.
 *
 * Features:
 *   - Master on/off toggle for the entire YouTube Focus Mode
 *   - 11 individually toggleable distraction-removal features
 *   - Features grouped by context (Homepage / Video Page / Global)
 *   - Real-time sync with chrome.storage.onChanged
 */
export default function YouTubeFocus() {
  const [options, setOptions] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingKey, setPendingKey] = useState(null);

  // ===========================================================================
  // Data Fetching
  // ===========================================================================

  const fetchOptions = useCallback(async () => {
    try {
      const opts = await StorageAdapter.getYoutubeFocusOptions();
      setOptions(opts);
      setError(null);
    } catch (err) {
      console.error("[Focus] Failed to load YouTube Focus options:", err);
      setError("Unable to load settings.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOptions();

    const unsubscribe = StorageAdapter.onStorageChanged((changes, area) => {
      if (area === "sync" && changes.settings) {
        const newYtFocus = changes.settings.newValue?.youtubeFocus;
        if (newYtFocus) {
          setOptions((prev) => ({ ...prev, ...newYtFocus }));
        }
      }
    });

    return unsubscribe;
  }, [fetchOptions]);

  // ===========================================================================
  // Handlers
  // ===========================================================================

  const handleToggle = async (key) => {
    const newValue = !options[key];
    setPendingKey(key);

    // Optimistic update
    setOptions((prev) => ({ ...prev, [key]: newValue }));

    try {
      await StorageAdapter.updateYoutubeFocusOptions({ [key]: newValue });
    } catch (err) {
      // Revert on failure
      setOptions((prev) => ({ ...prev, [key]: !newValue }));
      console.error(`[Focus] Failed to update YouTube Focus option "${key}":`, err);
    } finally {
      setPendingKey(null);
    }
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-slate-200 border-t-red-500 rounded-full animate-spin mb-3 dark:border-slate-700 dark:border-t-red-400" />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Loading YouTube Focus settings...
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

  const isActive = options.active;

  return (
    <div className="space-y-3">
      {/* Master Toggle */}
      <MasterToggle
        enabled={isActive}
        onToggle={() => handleToggle("active")}
        pending={pendingKey === "active"}
      />

      {/* Feature groups — dimmed when master is off */}
      <div
        className={`space-y-3 transition-opacity duration-300 ${
          isActive ? "opacity-100" : "opacity-40 pointer-events-none"
        }`}
      >
        {/* Homepage group */}
        <FeatureGroup title="Homepage">
          <FeatureRow
            label="Hide Feed"
            description="Remove the video grid on the homepage"
            optionKey="hideFeed"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
          <FeatureRow
            label="Hide Trending"
            description="Remove the Trending/Explore nav entry"
            optionKey="hideTrending"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
        </FeatureGroup>

        {/* Video page group */}
        <FeatureGroup title="Video Page">
          <FeatureRow
            label="Hide Sidebar"
            description="Remove related videos panel"
            optionKey="hideSidebar"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
          <FeatureRow
            label="Hide Comments"
            description="Remove the comment section"
            optionKey="hideComments"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
          <FeatureRow
            label="Hide Endscreen"
            description="Remove recommended cards at end of video"
            optionKey="hideEndscreen"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
          <FeatureRow
            label="Hide Merch Shelf"
            description="Remove creator merchandise shelf"
            optionKey="hideMerch"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
          <FeatureRow
            label="Hide Live Chat"
            description="Remove chat on live streams"
            optionKey="hideLiveChat"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
          <FeatureRow
            label="Disable Autoplay"
            description="Turn off autoplay on video pages"
            optionKey="disableAutoplay"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
        </FeatureGroup>

        {/* Global group */}
        <FeatureGroup title="Global">
          <FeatureRow
            label="Hide Shorts"
            description="Remove Shorts from all surfaces"
            optionKey="hideShorts"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
          <FeatureRow
            label="Hide Nav Sidebar"
            description="Collapse the left navigation guide"
            optionKey="hideSubBar"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
          <FeatureRow
            label="Hide Notifications"
            description="Remove the notification bell"
            optionKey="hideNotificationBell"
            options={options}
            pending={pendingKey}
            onToggle={handleToggle}
          />
        </FeatureGroup>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function MasterToggle({ enabled, onToggle, pending }) {
  return (
    <div className="relative rounded-2xl bg-white border border-slate-100 shadow-sm p-4 overflow-hidden dark:bg-[#1e2533] dark:border-slate-800">
      {/* Ambient glow */}
      <div
        className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl transition-all duration-700 ${
          enabled ? "bg-red-500/25" : "bg-slate-500/10"
        }`}
      />
      <div
        className={`absolute -bottom-8 -left-8 w-20 h-20 rounded-full blur-2xl transition-all duration-700 ${
          enabled ? "bg-orange-500/15" : "bg-slate-500/5"
        }`}
      />

      <div className="relative z-10 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            {/* YouTube logo mark */}
            <span className="text-base leading-none">▶</span>
            <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
              YouTube Focus Mode
            </p>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 dark:text-slate-400">
            {enabled
              ? "Distractions hidden — stay focused"
              : "YouTube distractions allowed"}
          </p>
        </div>

        {/* Master toggle switch */}
        <button
          id="toggle-yt-focus-master"
          onClick={onToggle}
          disabled={pending}
          className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 disabled:cursor-wait ${
            enabled ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"
          }`}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle YouTube Focus Mode"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function FeatureGroup({ title, children }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4 dark:bg-[#1e2533] dark:border-slate-800">
      <h2 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-3 dark:text-slate-400">
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FeatureRow({ label, description, optionKey, options, pending, onToggle }) {
  const enabled = !!options[optionKey];
  const isPending = pending === optionKey;

  return (
    <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0 border-b border-slate-50 last:border-0 dark:border-white/5">
      <div className="min-w-0 pr-3">
        <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200 leading-tight">
          {label}
        </p>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
          {description}
        </p>
      </div>

      {/* Compact inline toggle */}
      <button
        id={`toggle-yt-${optionKey}`}
        onClick={() => onToggle(optionKey)}
        disabled={isPending}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 disabled:cursor-wait ${
          enabled ? "bg-red-500" : "bg-slate-200 dark:bg-slate-700"
        }`}
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${label}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
