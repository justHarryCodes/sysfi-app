"use client";
// hooks/bots.js — bot data for the portal, Explore and tribes.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as B from "@/lib/bots";

export const botKeys = {
  mine: (uid) => ["user", uid, "dev", "bots"],
  mineOne: (uid, id) => ["user", uid, "dev", "bot", id],
  pending: (uid) => ["user", uid, "dev", "admin", "bots"],
  directory: (q) => ["public", "explore", "bots", q],
  bot: (uid, id) => ["user", uid, "explore", "bot", id],
  targets: (uid, id) => ["user", uid, "explore", "bot-targets", id],
  tribe: (uid, guildId) => ["user", uid, "tribe", guildId, "bots"],
};

const retry = (n, err) => !B.isBotsMissing(err) && err?.status !== 403 && n < 2;
const useUid = () => useAuth().user?.uid;

export const useMyBots = (enabled = true) => {
  const uid = useUid();
  return useQuery({ queryKey: botKeys.mine(uid), queryFn: B.getMyBots, enabled: !!uid && enabled, staleTime: 30_000, retry });
};
export const useMyBot = (id) => {
  const uid = useUid();
  return useQuery({ queryKey: botKeys.mineOne(uid, id), queryFn: () => B.getMyBot(id), enabled: !!uid && !!id && id !== "new", retry });
};
export const usePendingBots = (enabled = true) => {
  const uid = useUid();
  return useQuery({ queryKey: botKeys.pending(uid), queryFn: B.getPendingBots, enabled: !!uid && enabled, retry });
};
export const useBotDirectory = (q) =>
  useQuery({ queryKey: botKeys.directory(q), queryFn: () => B.getBotDirectory(q), staleTime: 5 * 60_000, retry, placeholderData: (p) => p });
export const useBot = (id) => {
  const uid = useUid();
  return useQuery({ queryKey: botKeys.bot(uid, id), queryFn: () => B.getBot(id), enabled: !!id, staleTime: 5 * 60_000, retry });
};
export const useInstallTargets = (id, enabled) => {
  const uid = useUid();
  return useQuery({ queryKey: botKeys.targets(uid, id), queryFn: () => B.getInstallTargets(id), enabled: !!uid && !!id && enabled, retry });
};
/** Bots installed in a tribe (members only). Quiet when the backend doesn't have bots yet. */
export const useTribeBots = (guildId, enabled = true) => {
  const uid = useUid();
  return useQuery({ queryKey: botKeys.tribe(uid, guildId), queryFn: () => B.getTribeBots(guildId), enabled: !!uid && !!guildId && enabled, staleTime: 60_000, retry });
};
