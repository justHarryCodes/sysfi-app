"use client";
// contexts/ThemeContext.js — mirrors crypto-wallet/contexts/ThemeContext.js:
// 'dark' | 'light' | 'system', dark by default, persisted under the same key.
// Colours themselves live in globals.css; this only flips <html data-theme>.
import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { APP_CONFIG } from "@/lib/config";

const ThemeContext = createContext(null);
const KEY = APP_CONFIG.STORAGE_KEYS.THEME;
const DARK_QUERY = "(prefers-color-scheme: dark)";

const readMode = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light" || saved === "system") return saved;
  } catch {}
  return "dark";
};

// The saved mode is an external store: the server (and hydration) see "dark",
// then the client switches to the stored value — no hydration mismatch, and
// other tabs follow via the storage event.
const MODE_EVENT = "tribe:theme-mode";
const subscribeMode = (cb) => {
  const onStorage = (e) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(MODE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(MODE_EVENT, cb);
  };
};

const subscribeSystem = (cb) => {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const getSystemDark = () => window.matchMedia(DARK_QUERY).matches;

/** Inline <head> script so the first paint already has the right theme. */
export const themeInitScript = `(function(){try{var m=localStorage.getItem(${JSON.stringify(KEY)});if(m!=="light"&&m!=="system")m="dark";if(m==="system")m=matchMedia(${JSON.stringify(DARK_QUERY)}).matches?"dark":"light";document.documentElement.dataset.theme=m;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export function ThemeProvider({ children }) {
  const themeMode = useSyncExternalStore(subscribeMode, readMode, () => "dark");
  const systemDark = useSyncExternalStore(subscribeSystem, getSystemDark, () => true);
  const isDark = themeMode === "system" ? systemDark : themeMode === "dark";

  // Resolve from the store, not `isDark`: during hydration isDark is still the
  // server's "dark", and writing that would flash a light-mode page.
  useEffect(() => {
    const m = readMode();
    const dark = m === "system" ? getSystemDark() : m === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [isDark]);

  const setTheme = useCallback((mode) => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {}
    window.dispatchEvent(new Event(MODE_EVENT));
  }, []);

  const toggleTheme = useCallback(() => setTheme(isDark ? "light" : "dark"), [isDark, setTheme]);

  return (
    <ThemeContext.Provider value={{ isDark, themeMode, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
