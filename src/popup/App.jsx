import { useState } from "react";
import Dashboard from "./components/Dashboard";
import Blocklist from "./components/Blocklist";
import ThemeToggle from "./components/ThemeToggle";

/**
 * App — Root component for the Focus popup.
 *
 * Views:
 *   - Dashboard: Today's screen time + top 5 domains
 *   - Blocklist: Site blocker management (add/remove domains, global toggle)
 */
export default function App() {
  const [activeView, setActiveView] = useState("dashboard");

  return (
    <div className="relative w-[360px] min-h-[480px] overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#121824] dark:text-white font-[Inter,system-ui,sans-serif] transition-colors">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-16 -right-14 z-0 h-56 w-56 rounded-full bg-blue-500/25 blur-3xl dark:bg-blue-500/30"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-6 -right-6 z-0 h-32 w-32 rounded-full bg-sky-400/30 blur-2xl dark:bg-sky-400/35"
      />
      {/* Header */}
      <header className="relative z-10 px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Focus
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Digital Wellbeing
          </p>
        </div>

        <ThemeToggle />
      </header>

      {/* Navigation Tabs */}
      <nav className="relative z-10 flex gap-1 px-5 mb-4">
        <button
          id="nav-dashboard"
          onClick={() => setActiveView("dashboard")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
            activeView === "dashboard"
              ? "bg-white text-slate-900 border-slate-200 shadow-sm dark:bg-[#181f2c] dark:text-white dark:border-slate-700"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
          }`}
        >
          Dashboard
        </button>
        <button
          id="nav-blocklist"
          onClick={() => setActiveView("blocklist")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 ${
            activeView === "blocklist"
              ? "bg-white text-slate-900 border-slate-200 shadow-sm dark:bg-[#181f2c] dark:text-white dark:border-slate-700"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-white/5"
          }`}
        >
          Blocklist
        </button>
      </nav>

      {/* Content Area */}
      <main className="relative z-10 px-5 pb-5">
        {activeView === "dashboard" ? <Dashboard /> : <Blocklist />}
      </main>
    </div>
  );
}
