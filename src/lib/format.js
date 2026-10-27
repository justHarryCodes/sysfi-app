// lib/format.js — display formatting shared across screens. The balance/USD
// rules mirror the app's TokensScreen/HomeScreen helpers.

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export const formatCount = (n) => compact.format(Number(n) || 0);

/** "1 member", "2.4K members" */
export const countLabel = (n, singular, plural = `${singular}s`) =>
  `${formatCount(n)} ${Number(n) === 1 ? singular : plural}`;

/** Token amount: up to 4–6 decimals for small values, grouped/abbreviated for large. */
export function formatBalance(val) {
  const n = parseFloat(val || "0");
  if (!Number.isFinite(n) || n === 0) return "0";
  if (n < 1e-6) return "< 0.000001";
  if (n < 0.001) return n.toFixed(6).replace(/0+$/, "");
  if (n < 10000) return n.toFixed(4).replace(/\.?0+$/, "");
  if (n < 1e6) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${(n / 1e6).toFixed(2)}M`;
}

/** Fiat value, always two decimals ("$0.00" for zero). */
export function formatUsd(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n > 0 && n < 0.01) return "< $0.01";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Unit price — more precision for small prices. */
export function formatPrice(p) {
  const n = Number(p);
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n < 1e-6) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(n) {
  const v = Number(n) || 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export const formatCompactUsd = (v) =>
  Number.isFinite(Number(v)) ? `$${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(v)}` : "—";

const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function formatDay(ts) {
  if (!ts) return "Pending";
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return dayFmt.format(d);
}

export const formatTime = (ts) => (ts ? timeFmt.format(new Date(ts)) : "");

/** "now", "5m", "3h", "2d", then a date — feed/post timestamps. */
export function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ts));
}

/** Sanitises free-typed amounts: digits and a single dot. */
export const cleanAmount = (s) => s.replace(/,/g, ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
