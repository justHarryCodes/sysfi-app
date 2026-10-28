// lib/joined.js — the day someone joined, from whatever shape it arrives in
// (web + mobile; metro maps @/lib). users/{uid}.createdAt is a Firestore
// Timestamp when live, { seconds, nanoseconds } once it's been through a JSON
// cache, an ISO string or a number in older docs. Firebase Auth's own
// account-creation time is the source of truth when the doc's value is
// missing or was reset later.

/** Any stored date shape → Date, or null. */
export function toDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v.toDate === "function") return toDate(v.toDate());
  if (typeof v === "object") {
    const s = v.seconds ?? v._seconds;
    return typeof s === "number" ? new Date(s * 1000 + Math.floor((v.nanoseconds ?? v._nanoseconds ?? 0) / 1e6)) : null;
  }
  if (typeof v === "number") return toDate(new Date(v < 1e12 ? v * 1000 : v)); // seconds or ms
  return toDate(new Date(v));
}

/**
 * The join date: the earlier of the profile's createdAt and the account's
 * creation time (Firebase Auth user.metadata.creationTime) — a createdAt that
 * was rewritten later never wins.
 */
export function joinedDate(createdAt, authCreationTime) {
  const dates = [toDate(createdAt), toDate(authCreationTime)].filter(Boolean);
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 2026" (no Intl needed — same on every device). */
export const formatJoined = (d) => (d ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null);

/** "Oct 2026", for tight stat blocks. */
export const formatJoinedShort = (d) => (d ? `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : null);
