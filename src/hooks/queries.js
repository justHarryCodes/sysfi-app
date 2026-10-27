"use client";
// hooks/queries.js — cached data hooks. Keys follow lib/cache/queryClient.js:
// ["public", ...] for anyone's data, ["user", uid, ...] for the signed-in
// user's. `staleTime` is how long cached data is served without a refetch.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const MIN = 60_000;

export const queryKeys = {
  topTribes: (limit) => ["public", "tribes", "top", limit],
  tribeSearch: (q) => ["public", "tribes", "search", q],
  tribe: (id) => ["public", "tribe", id],
  trendingTokens: (limit) => ["public", "tokens", "trending", limit],
};

export const useTopTribes = (limit = 5) =>
  useQuery({
    queryKey: queryKeys.topTribes(limit),
    queryFn: () => api.publicGet("/guilds/top", { limit }),
    staleTime: 5 * MIN,
  });

export const useTribeSearch = (q) => {
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.tribeSearch(term.toLowerCase()),
    queryFn: () => api.publicGet("/guilds/search", { q: term }),
    enabled: term.length >= 2,
    staleTime: MIN,
    meta: { persist: false }, // one-off queries — keep them out of IndexedDB
    placeholderData: (prev) => prev,
  });
};

export const useTribe = (id) =>
  useQuery({
    queryKey: queryKeys.tribe(id),
    queryFn: () => api.publicGet(`/guilds/${id}`),
    enabled: !!id,
    staleTime: MIN,
  });

export const useTrendingTokens = (limit = 5) =>
  useQuery({
    queryKey: queryKeys.trendingTokens(limit),
    queryFn: () => api.publicGet("/coingecko/trending", { limit }),
    staleTime: 2 * MIN,
  });
