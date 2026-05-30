import { useEffect, useState } from "react";
import { StorageAdapter } from "../../lib/storage-adapter";

const THEME_KEY = "focus-theme";

function SunIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 14.5a8.5 8.5 0 1 1-10.5-10 7 7 0 0 0 10.5 10z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    let resolvedTheme = null;
    let hasSyncedTheme = false;

    const loadTheme = async () => {
      try {
        const settings = await StorageAdapter.getSettings();
        if (settings?.theme === "dark" || settings?.theme === "light") {
          resolvedTheme = settings.theme;
          hasSyncedTheme = true;
        }
      } catch {
        // Ignore storage errors in dev or restricted contexts.
      }

      if (resolvedTheme !== "dark" && resolvedTheme !== "light") {
        try {
          const localTheme = window.localStorage.getItem(THEME_KEY);
          if (localTheme === "dark" || localTheme === "light") {
            resolvedTheme = localTheme;
          }
        } catch {
          // Ignore localStorage errors.
        }
      }

      if (resolvedTheme !== "dark" && resolvedTheme !== "light") {
        resolvedTheme = root.classList.contains("dark") ? "dark" : "light";
      }

      root.classList.toggle("dark", resolvedTheme === "dark");
      setIsDark(resolvedTheme === "dark");

      if (!hasSyncedTheme) {
        try {
          await StorageAdapter.updateSettings({ theme: resolvedTheme });
        } catch {
          // Ignore storage errors.
        }
      }

      try {
        window.localStorage.setItem(THEME_KEY, resolvedTheme);
      } catch {
        // Ignore localStorage errors.
      }
    };

    loadTheme();

    const unsubscribe = StorageAdapter.onStorageChanged((changes, area) => {
      if (area !== "sync" || !changes.settings) return;

      const nextTheme = changes.settings.newValue?.theme;
      if (nextTheme !== "dark" && nextTheme !== "light") return;

      root.classList.toggle("dark", nextTheme === "dark");
      setIsDark(nextTheme === "dark");

      try {
        window.localStorage.setItem(THEME_KEY, nextTheme);
      } catch {
        // Ignore localStorage errors.
      }
    });

    return unsubscribe;
  }, []);

  const toggleTheme = () => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const next = !root.classList.contains("dark");

    root.classList.toggle("dark", next);
    setIsDark(next);

    try {
      window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      // Ignore storage failures in restricted contexts.
    }

    try {
      StorageAdapter.updateSettings({ theme: next ? "dark" : "light" });
    } catch {
      // Ignore storage failures in restricted contexts.
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-[#181f2c] dark:text-slate-200 dark:hover:bg-[#1f2736]"
    >
      {isDark ? (
        <SunIcon className="w-4 h-4" />
      ) : (
        <MoonIcon className="w-4 h-4" />
      )}
    </button>
  );
}
