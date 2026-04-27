import { useState, useEffect, useCallback } from 'react';
import { StorageAdapter } from '../../lib/storage-adapter';

/**
 * Blocklist — Management UI for the site blocker.
 *
 * Features:
 *   - Global "Blocking Enabled" toggle (synced to chrome.storage.sync)
 *   - Add domains via input field with validation
 *   - Remove domains with confirmation animation
 *   - Real-time sync with chrome.storage.onChanged
 */
export default function Blocklist() {
  const [blocklist, setBlocklist] = useState([]);
  const [settings, setSettings] = useState({ blockingEnabled: true });
  const [newDomain, setNewDomain] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addError, setAddError] = useState(null);
  const [removingDomain, setRemovingDomain] = useState(null);

  // ===========================================================================
  // Data Fetching
  // ===========================================================================

  const fetchData = useCallback(async () => {
    try {
      const [list, sets] = await Promise.all([
        StorageAdapter.getBlocklist(),
        StorageAdapter.getSettings(),
      ]);
      setBlocklist(list);
      setSettings(sets);
      setError(null);
    } catch (err) {
      console.error('[Focus] Failed to load blocklist:', err);
      setError('Unable to load blocklist.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Real-time sync
    const unsubscribe = StorageAdapter.onStorageChanged((changes, area) => {
      if (area !== 'sync') return;
      if (changes.blocklist) {
        setBlocklist(changes.blocklist.newValue || []);
      }
      if (changes.settings) {
        setSettings((prev) => ({ ...prev, ...(changes.settings.newValue || {}) }));
      }
    });

    return unsubscribe;
  }, [fetchData]);

  // ===========================================================================
  // Handlers
  // ===========================================================================

  const handleToggleBlocking = async () => {
    const newValue = !settings.blockingEnabled;
    setSettings((prev) => ({ ...prev, blockingEnabled: newValue }));
    try {
      await StorageAdapter.updateSettings({ blockingEnabled: newValue });
      // Broadcast to content scripts
      broadcastBlocklistUpdate();
    } catch (err) {
      // Revert on failure
      setSettings((prev) => ({ ...prev, blockingEnabled: !newValue }));
      console.error('[Focus] Failed to toggle blocking:', err);
    }
  };

  const handleAddDomain = async (e) => {
    e.preventDefault();
    setAddError(null);

    const domain = normalizeDomain(newDomain.trim());
    if (!domain) {
      setAddError('Please enter a valid domain.');
      return;
    }

    if (blocklist.includes(domain)) {
      setAddError('This domain is already blocked.');
      return;
    }

    try {
      await StorageAdapter.addToBlocklist(domain);
      setNewDomain('');
      broadcastBlocklistUpdate();
    } catch (err) {
      console.error('[Focus] Failed to add domain:', err);
      setAddError('Failed to add domain.');
    }
  };

  const handleRemoveDomain = async (domain) => {
    setRemovingDomain(domain);
    // Brief animation delay
    setTimeout(async () => {
      try {
        await StorageAdapter.removeFromBlocklist(domain);
        broadcastBlocklistUpdate();
      } catch (err) {
        console.error('[Focus] Failed to remove domain:', err);
      } finally {
        setRemovingDomain(null);
      }
    }, 200);
  };

  // ===========================================================================
  // Render
  // ===========================================================================

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin mb-3" />
        <p className="text-xs text-slate-400">Loading blocklist...</p>
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
      {/* Global Toggle */}
      <GlobalToggle
        enabled={settings.blockingEnabled}
        onToggle={handleToggleBlocking}
      />

      {/* Add Domain */}
      <AddDomainForm
        value={newDomain}
        onChange={setNewDomain}
        onSubmit={handleAddDomain}
        error={addError}
        disabled={!settings.blockingEnabled}
      />

      {/* Domain List */}
      <DomainList
        domains={blocklist}
        onRemove={handleRemoveDomain}
        removingDomain={removingDomain}
        disabled={!settings.blockingEnabled}
      />
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function GlobalToggle({ enabled, onToggle }) {
  return (
    <div className="relative rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4 overflow-hidden group">
      {/* Ambient glow */}
      <div
        className={`absolute -top-10 -right-10 w-28 h-28 rounded-full blur-3xl transition-all duration-700 ${
          enabled ? 'bg-emerald-500/20' : 'bg-slate-500/10'
        }`}
      />

      <div className="relative z-10 flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-slate-200">
            Site Blocking
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {enabled ? 'Actively blocking sites' : 'Blocking is paused'}
          </p>
        </div>

        {/* Toggle switch */}
        <button
          id="toggle-blocking"
          onClick={onToggle}
          className={`relative w-11 h-6 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
            enabled ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle site blocking"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function AddDomainForm({ value, onChange, onSubmit, error, disabled }) {
  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
      <h2 className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-3">
        Add Site
      </h2>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          id="input-add-domain"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. facebook.com"
          disabled={disabled}
          className={`flex-1 px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 text-white placeholder-slate-500 outline-none transition-all duration-200 ${
            disabled
              ? 'opacity-40 cursor-not-allowed'
              : 'focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/25'
          }`}
        />
        <button
          id="btn-add-domain"
          type="submit"
          disabled={disabled || !value.trim()}
          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
            disabled || !value.trim()
              ? 'bg-white/5 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-violet-500 to-cyan-500 text-white hover:shadow-lg hover:shadow-violet-500/20 active:scale-95'
          }`}
        >
          Block
        </button>
      </form>

      {error && (
        <p className="text-[10px] text-red-400 mt-2 pl-1">{error}</p>
      )}
    </div>
  );
}

function DomainList({ domains, onRemove, removingDomain, disabled }) {
  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-4">
      <h2 className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-3">
        Blocked Sites
        {domains.length > 0 && (
          <span className="ml-1.5 text-slate-500">({domains.length})</span>
        )}
      </h2>

      {domains.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-2xl mb-2 opacity-50">🛡️</div>
          <p className="text-xs text-slate-500">No sites blocked yet.</p>
          <p className="text-[10px] text-slate-600 mt-1">
            Add a domain above to start blocking.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {domains.map((domain) => (
            <li
              key={domain}
              className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 ${
                removingDomain === domain
                  ? 'opacity-0 -translate-x-4 scale-95'
                  : 'opacity-100 hover:bg-white/5'
              } ${disabled ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                  alt=""
                  className="w-4 h-4 rounded-sm flex-shrink-0"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <span className="text-xs text-slate-200 truncate">
                  {domain}
                </span>
              </div>

              <button
                onClick={() => onRemove(domain)}
                disabled={disabled}
                className={`text-[10px] font-medium px-2 py-1 rounded-md transition-all duration-200 ${
                  disabled
                    ? 'text-slate-600 cursor-not-allowed'
                    : 'text-slate-500 hover:text-red-400 hover:bg-red-400/10 active:scale-95'
                }`}
                aria-label={`Remove ${domain} from blocklist`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Normalize a domain input — strip protocols, paths, and www prefix.
 * @param {string} input
 * @returns {string|null}
 */
function normalizeDomain(input) {
  if (!input) return null;

  let domain = input;

  // Strip protocol if present
  domain = domain.replace(/^https?:\/\//, '');
  // Strip path, query, hash
  domain = domain.split('/')[0].split('?')[0].split('#')[0];
  // Strip www.
  domain = domain.replace(/^www\./, '');
  // Lowercase
  domain = domain.toLowerCase();

  // Basic validation: must have at least one dot
  if (!domain.includes('.') || domain.length < 3) return null;

  return domain;
}

/**
 * Broadcast a BLOCKLIST_UPDATE message to the background service worker.
 * This is a best-effort supplementary notification — the content script
 * also listens to chrome.storage.onChanged directly, so blocking works
 * even if this message fails to deliver.
 */
async function broadcastBlocklistUpdate() {
  try {
    await chrome.runtime.sendMessage({ type: 'BLOCKLIST_UPDATE' });
  } catch {
    // Background SW may be asleep — this is fine.
    // Content scripts will pick up the change via chrome.storage.onChanged.
  }
}
