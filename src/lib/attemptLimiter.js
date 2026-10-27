// lib/attemptLimiter.js — port of crypto-wallet/utils/AttemptLimiter.js.
// UX-level throttle only: in a browser it lives in localStorage and can be
// cleared, so the real brute-force cost is the scrypt work factor.

const PREFIX = "awarizon_attempts_";
const TIERS = [
  { minAttempts: 3, lockMs: 30 * 1000 },
  { minAttempts: 5, lockMs: 5 * 60 * 1000 },
  { minAttempts: 7, lockMs: 60 * 60 * 1000 },
  { minAttempts: 10, lockMs: 24 * 60 * 60 * 1000 },
];

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + key) || "null");
  } catch {
    return null;
  }
};

export const checkLocked = (key) => {
  const s = read(key);
  if (s?.lockedUntil && Date.now() < s.lockedUntil) {
    return { locked: true, attempts: s.attempts, remainingMs: s.lockedUntil - Date.now() };
  }
  return { locked: false, attempts: s?.attempts || 0, remainingMs: 0 };
};

export const recordFailedAttempt = (key) => {
  const attempts = (read(key)?.attempts || 0) + 1;
  let lockedUntil = null;
  for (const t of TIERS) if (attempts >= t.minAttempts) lockedUntil = Date.now() + t.lockMs;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ attempts, lockedUntil }));
  } catch {}
  return { attempts, locked: !!lockedUntil, lockedUntil };
};

export const clearAttempts = (key) => {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {}
};

export const formatLockMessage = (remainingMs) => {
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds < 60) return `Too many attempts. Try again in ${seconds} seconds.`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Too many attempts. Try again in ${minutes} minute${minutes > 1 ? "s" : ""}.`;
  const hours = Math.ceil(minutes / 60);
  return `Too many attempts. Try again in ${hours} hour${hours > 1 ? "s" : ""}.`;
};
