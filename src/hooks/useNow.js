"use client";
// hooks/useNow.js — a render-safe clock for countdowns ("2h 14m left").
// One shared ticker per interval via useSyncExternalStore; 0 on the server
// (callers treat 0 as "not yet known").
import { useSyncExternalStore } from "react";

const tickers = new Map(); // interval → { now, listeners, timer, subscribe, getSnapshot }

function ticker(interval) {
  let t = tickers.get(interval);
  if (t) return t;
  t = { now: Date.now(), listeners: new Set(), timer: null };
  // Stable functions per interval, so React never resubscribes on re-render.
  t.subscribe = (cb) => {
    t.listeners.add(cb);
    if (!t.timer) {
      t.now = Date.now();
      t.timer = setInterval(() => {
        t.now = Date.now();
        t.listeners.forEach((l) => l());
      }, interval);
    }
    return () => {
      t.listeners.delete(cb);
      if (!t.listeners.size) {
        clearInterval(t.timer);
        t.timer = null;
      }
    };
  };
  t.getSnapshot = () => t.now;
  tickers.set(interval, t);
  return t;
}

const getServerSnapshot = () => 0;

export function useNow(interval = 30_000) {
  const t = ticker(interval);
  return useSyncExternalStore(t.subscribe, t.getSnapshot, getServerSnapshot);
}
