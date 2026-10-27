// lib/cache/queryClient.js — TanStack Query client + per-query IndexedDB
// persistence + cross-tab sync.
//
// Query key convention (enforced by persistence scoping):
//   ["public", ...]       data anyone can see (top tribes, token prices)
//   ["user", uid, ...]    data tied to the signed-in user (my tribes, feed, chat)
// Opt out of persistence for volatile data with `meta: { persist: false }`.
//
// Behaviour
//   • stale-while-revalidate: cached data renders instantly, then refetches
//     in the background when stale (per-query `staleTime`).
//   • offline-first: cached data still renders with no network.
//   • identical requests in flight are deduped; failed requests retry with
//     backoff, except client errors (4xx) which fail fast.
//   • invalidations broadcast to other open tabs (BroadcastChannel).
import { QueryClient } from "@tanstack/react-query";
import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core";
import { queryGet, queryPut, queryDelete, queryEntries, evictOldest, userScope } from "./idb";

// Bump when cached response shapes change; older entries are discarded on read.
export const CACHE_BUSTER = "tribe-web-v3"; // v3: registry-backed token lists
const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // a week
const MAX_PERSISTED_QUERIES = 800;
const PREFIX = "q";

const scopeOfKey = (queryKey) => (queryKey?.[0] === "user" ? userScope(queryKey[1]) : "public");

// Structured-clone storage: IndexedDB stores objects natively, so skip the
// default JSON round-trip.
const storage = {
  getItem: (key) => queryGet(key),
  setItem: (key, value) => queryPut(key, value, scopeOfKey(value?.queryKey)),
  removeItem: (key) => queryDelete(key),
  entries: () => queryEntries(),
};

export const persister = experimental_createQueryPersister({
  storage: typeof window === "undefined" ? null : storage,
  serialize: (v) => v,
  deserialize: (v) => v,
  buster: CACHE_BUSTER,
  maxAge: PERSIST_MAX_AGE,
  prefix: PREFIX,
  filters: { predicate: (q) => shouldPersist(q) },
});

const isClientError = (err) => err?.status >= 400 && err?.status < 500;

const shouldPersist = (q) => q.meta?.persist !== false && ["public", "user"].includes(q.queryKey[0]);

export function makeQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 30 * 60_000,
        networkMode: "offlineFirst",
        refetchOnWindowFocus: true,
        retry: (count, err) => !isClientError(err) && count < 2,
        persister: persister.persisterFn,
      },
      mutations: { networkMode: "offlineFirst" },
    },
  });

  // The persister only writes after a fetch; also persist manual cache
  // writes (setQueryData from optimistic updates) so they survive reloads.
  if (typeof window !== "undefined") {
    client.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success" && event.action.manual && shouldPersist(event.query)) {
        persister.persistQuery(event.query);
      }
    });
  }
  return client;
}

/** Housekeeping on startup, when the browser is idle: expire + cap the store. */
export function scheduleCacheMaintenance() {
  if (typeof window === "undefined") return;
  const run = async () => {
    await persister.persisterGc();
    await evictOldest(MAX_PERSISTED_QUERIES);
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(() => run(), { timeout: 10_000 });
  else setTimeout(run, 3000);
}

// ─── Cross-tab invalidation ──────────────────────────────────────────────────

const CHANNEL = "tribe-cache";

/**
 * Invalidate locally and in every other open tab — use after mutations
 * (post created, tribe joined, …) so all tabs refetch.
 */
export function invalidateEverywhere(queryClient, queryKey) {
  const done = queryClient.invalidateQueries({ queryKey });
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ type: "invalidate", queryKey });
    bc.close();
  } catch {}
  return done;
}

export function listenForCrossTabInvalidation(queryClient) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const bc = new BroadcastChannel(CHANNEL);
  bc.onmessage = ({ data }) => {
    if (data?.type === "invalidate") queryClient.invalidateQueries({ queryKey: data.queryKey });
  };
  return () => bc.close();
}
