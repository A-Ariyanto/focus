import { useState } from 'react';

/**
 * App — Root component for the Focus popup.
 *
 * Stage 1: Placeholder shell with navigation scaffolding.
 * Stage 2 will add Dashboard and Management views.
 */
export default function App() {
  const [activeView, setActiveView] = useState('dashboard');

  return (
    <div className="w-[360px] min-h-[480px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-sans">
      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Focus
          </span>
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">Digital Wellbeing</p>
      </header>

      {/* Navigation */}
      <nav className="flex gap-1 px-5 mb-4">
        <button
          onClick={() => setActiveView('dashboard')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeView === 'dashboard'
              ? 'bg-white/10 text-white shadow-sm backdrop-blur-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveView('blocklist')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeView === 'blocklist'
              ? 'bg-white/10 text-white shadow-sm backdrop-blur-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          Blocklist
        </button>
      </nav>

      {/* Content Area */}
      <main className="px-5 pb-5">
        {activeView === 'dashboard' ? (
          <DashboardPlaceholder />
        ) : (
          <BlocklistPlaceholder />
        )}
      </main>
    </div>
  );
}

/** Placeholder for Dashboard view — will be replaced in Stage 2 */
function DashboardPlaceholder() {
  return (
    <div className="rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-6 text-center">
      <div className="text-3xl mb-3">📊</div>
      <h2 className="text-sm font-semibold text-slate-200 mb-1">Usage Dashboard</h2>
      <p className="text-xs text-slate-400">
        Tracking engine is active. Your browsing data will appear here.
      </p>
    </div>
  );
}

/** Placeholder for Blocklist view — will be replaced in Stage 2 */
function BlocklistPlaceholder() {
  return (
    <div className="rounded-xl bg-white/5 backdrop-blur-md border border-white/10 p-6 text-center">
      <div className="text-3xl mb-3">🛡️</div>
      <h2 className="text-sm font-semibold text-slate-200 mb-1">Site Blocker</h2>
      <p className="text-xs text-slate-400">
        Manage your blocked sites. Coming in Stage 2.
      </p>
    </div>
  );
}
