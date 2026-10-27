// lib/cache/idb.js — the app's IndexedDB database ("tribe-web").
//
// Stores
//   queries  persisted TanStack Query entries, one record per query
//            { key, scope, savedAt, value: PersistedQuery }
//            indexes: by-scope (wipe a user's data), by-savedAt (LRU eviction)
//   kv       small app records (account metadata, etc.) { key, scope, value, savedAt }
//
// Scope: every record is tagged "public" or "user:<uid>". Signing out deletes
// that user's records, so a shared computer never shows the previous
// user's cached feed/tribes/chat.
//
// Never put key material here. The encrypted wallet blob is handled by
// Firestore (see lib/firebase.js), never by this cache.
//
// If IndexedDB is unavailable (some private-browsing modes, blocked storage)
// every call degrades to a no-op and the app simply runs uncached.
import { openDB } from "idb";

const DB_NAME = "tribe-web";
const DB_VERSION = 1;

let dbPromise = null;

export function getDB() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Versioned migrations — add `if (oldVersion < 2) {...}` blocks for future schema changes.
        if (oldVersion < 1) {
          const queries = db.createObjectStore("queries", { keyPath: "key" });
          queries.createIndex("by-scope", "scope");
          queries.createIndex("by-savedAt", "savedAt");
          const kv = db.createObjectStore("kv", { keyPath: "key" });
          kv.createIndex("by-scope", "scope");
        }
      },
      blocked() {
        console.warn("[idb] upgrade blocked by another open tab");
      },
      terminated() {
        dbPromise = null; // browser killed the connection; reopen lazily
      },
    }).catch((err) => {
      console.warn("[idb] unavailable, running without a persistent cache:", err?.message);
      return null;
    });
  }
  return dbPromise;
}

const safe = async (fn, fallback) => {
  try {
    const db = await getDB();
    return db ? await fn(db) : fallback;
  } catch (err) {
    console.warn("[idb]", err?.message);
    return fallback;
  }
};

export const userScope = (uid) => (uid ? `user:${uid}` : "public");

// ─── kv ───────────────────────────────────────────────────────────────────────

export const kvGet = (key) => safe(async (db) => (await db.get("kv", key))?.value, undefined);

export const kvSet = (key, value, scope = "public") =>
  safe((db) => db.put("kv", { key, scope, value, savedAt: Date.now() }), undefined);

export const kvDelete = (key) => safe((db) => db.delete("kv", key), undefined);

// ─── queries (used by the TanStack persister) ────────────────────────────────

export const queryGet = (key) => safe(async (db) => (await db.get("queries", key))?.value, undefined);

export const queryPut = (key, value, scope) =>
  safe((db) => db.put("queries", { key, scope, savedAt: Date.now(), value }), undefined);

export const queryDelete = (key) => safe((db) => db.delete("queries", key), undefined);

export const queryEntries = () =>
  safe(async (db) => (await db.getAll("queries")).map((r) => [r.key, r.value]), []);

// ─── Maintenance ─────────────────────────────────────────────────────────────

/** Deletes every record (both stores) belonging to a scope. */
export const wipeScope = (scope) =>
  safe(async (db) => {
    const tx = db.transaction(["queries", "kv"], "readwrite");
    for (const name of ["queries", "kv"]) {
      let cursor = await tx.objectStore(name).index("by-scope").openCursor(IDBKeyRange.only(scope));
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
    }
    await tx.done;
  }, undefined);

/** Keeps the query store under `max` records, dropping the least recently saved. */
export const evictOldest = (max) =>
  safe(async (db) => {
    const count = await db.count("queries");
    if (count <= max) return 0;
    let toDrop = count - max;
    const tx = db.transaction("queries", "readwrite");
    let cursor = await tx.store.index("by-savedAt").openCursor();
    while (cursor && toDrop > 0) {
      await cursor.delete();
      toDrop--;
      cursor = await cursor.continue();
    }
    await tx.done;
    return count - max;
  }, 0);
