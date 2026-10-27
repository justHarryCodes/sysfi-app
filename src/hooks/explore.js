"use client";
// hooks/explore.js — Explore directory, app details and the user's consent.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as M from "@/lib/miniapp/api";

const MIN = 60_000;

export const exploreKeys = {
  directory: (kind, category, q) => ["public", "explore", "directory", kind, category, q],
  app: (id) => ["public", "explore", "app", id],
  grant: (uid, id) => ["user", uid, "explore", "grant", id],
  tribeApps: (guildId) => ["public", "explore", "tribe", guildId],
};

const noRetryMissing = (n, err) => !M.isPlatformMissing(err) && err?.status !== 404 && n < 2;

export const useDirectory = ({ kind, category, q }) =>
  useQuery({
    queryKey: exploreKeys.directory(kind, category, q),
    queryFn: () => M.getDirectory({ kind, category, search: q }),
    staleTime: 5 * MIN,
    retry: noRetryMissing,
    placeholderData: (prev) => prev,
  });

export const useMiniApp = (id) =>
  useQuery({ queryKey: exploreKeys.app(id), queryFn: () => M.getMiniApp(id), enabled: !!id, staleTime: 5 * MIN, retry: noRetryMissing });

/** What this user granted the app when opening it from Explore (null = not yet asked). */
export function useGrant(id) {
  const { user } = useAuth();
  return useQuery({
    queryKey: exploreKeys.grant(user?.uid, id),
    queryFn: () => M.getGrant(id),
    enabled: !!(user?.uid && id),
    staleTime: 10 * MIN,
    retry: noRetryMissing,
  });
}

export const useTribeApps = (guildId) =>
  useQuery({ queryKey: exploreKeys.tribeApps(guildId), queryFn: () => M.getTribeApps(guildId), enabled: !!guildId, staleTime: 5 * MIN, retry: noRetryMissing });
