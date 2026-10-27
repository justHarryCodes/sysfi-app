"use client";
// hooks/tribes.js — cached tribe/feed/post data + mutations (port of the
// app's useTribes / useTribeMembership / useTribePost / useActivityFeed /
// useTokenGating). Keys are ["user", uid, …] so they persist per user and
// are wiped on sign-out (lib/cache).
import { useCallback, useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Contract, formatUnits, parseUnits } from "ethers";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { kvGet, kvSet, userScope } from "@/lib/cache/idb";
import { invalidateEverywhere } from "@/lib/cache/queryClient";
import { LEGACY_CHAIN_ID, getChainById } from "@/lib/config";
import { getProvider } from "@/lib/chain/rpc";
import * as T from "@/lib/tribeApi";

const SEC = 1000;
const MIN = 60 * SEC;

export const tribeKeys = {
  mine: (uid) => ["user", uid, "tribes"],
  tribe: (id) => ["public", "tribe", id],
  membership: (uid, id) => ["user", uid, "membership", id],
  members: (uid, id) => ["user", uid, "tribe", id, "members"],
  invites: (uid, id) => ["user", uid, "tribe", id, "invites"],
  links: (uid, id) => ["user", uid, "tribe", id, "links"],
  chatSettings: (uid, id) => ["user", uid, "tribe", id, "chatSettings"],
  moderators: (uid, id) => ["user", uid, "tribe", id, "moderators"],
  posts: (uid, id) => ["user", uid, "tribe", id, "posts"],
  post: (uid, postId) => ["user", uid, "post", postId],
  comments: (uid, postId) => ["user", uid, "comments", postId],
  feed: (uid) => ["user", uid, "feed"],
  governance: (uid) => ["user", uid, "governance"],
  unread: (uid, id) => ["user", uid, "tribe", id, "unread"],
};

/** Author fields the backend stores on posts/messages/members. */
export function useAuthor() {
  const { user } = useAuth();
  const { address } = useWallet();
  return {
    uid: user?.uid,
    username: user?.username || user?.email?.split("@")[0] || "Unknown",
    displayName: user?.displayName || null,
    userAvatar: user?.profileImageUrl || null,
    walletAddress: address || null,
  };
}

// ─── Tribes ───────────────────────────────────────────────────────────────────

export function useMyTribes() {
  const { user } = useAuth();
  return useQuery({ queryKey: tribeKeys.mine(user?.uid), queryFn: T.getMyTribes, enabled: !!user, staleTime: 30 * SEC });
}

export const useTribeDetail = (id) =>
  useQuery({ queryKey: tribeKeys.tribe(id), queryFn: () => T.getTribe(id), enabled: !!id, staleTime: 30 * SEC });

/** Local-only pinning (the app keeps pins in SQLite on the device, too). */
export function useTribePins() {
  const { user } = useAuth();
  const key = `tribePins:${user?.uid}`;
  const [pins, setPins] = useState([]);
  useEffect(() => {
    if (user?.uid) kvGet(key).then((p) => Array.isArray(p) && setPins(p));
  }, [key, user?.uid]);
  const toggle = useCallback(
    (id) =>
      setPins((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        kvSet(key, next, userScope(user?.uid));
        return next;
      }),
    [key, user?.uid],
  );
  return { pins, toggle };
}

export function useMembership(id) {
  const { user } = useAuth();
  return useQuery({
    queryKey: tribeKeys.membership(user?.uid, id),
    queryFn: () => T.getMembership(id),
    enabled: !!(user && id),
    staleTime: MIN,
  });
}

export function useMembers(id, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: tribeKeys.members(user?.uid, id),
    queryFn: () => T.getMembers(id),
    enabled: !!(id && enabled), // public tribes are readable signed out
    staleTime: MIN,
  });
}

export function useJoinTribe(tribe) {
  const qc = useQueryClient();
  const author = useAuthor();
  return useMutation({
    mutationFn: (inviteId) =>
      T.joinTribe(tribe.id, {
        username: author.username,
        displayName: author.displayName,
        userAvatar: author.userAvatar,
        walletAddress: author.walletAddress,
        inviteId: inviteId || undefined,
      }),
    onSuccess: () => {
      invalidateEverywhere(qc, tribeKeys.membership(author.uid, tribe.id));
      invalidateEverywhere(qc, tribeKeys.mine(author.uid));
      invalidateEverywhere(qc, tribeKeys.members(author.uid, tribe.id));
      qc.invalidateQueries({ queryKey: tribeKeys.tribe(tribe.id) });
    },
  });
}

export function useLeaveTribe(tribeId) {
  const qc = useQueryClient();
  const { uid } = useAuthor();
  return useMutation({
    mutationFn: () => T.leaveTribe(tribeId),
    onSuccess: () => {
      qc.setQueryData(tribeKeys.membership(uid, tribeId), null);
      invalidateEverywhere(qc, tribeKeys.mine(uid));
      invalidateEverywhere(qc, tribeKeys.members(uid, tribeId));
      qc.invalidateQueries({ queryKey: tribeKeys.tribe(tribeId) });
    },
  });
}

/** Owner-or-moderator capability check for a tribe. */
export function useTribeRole(tribe) {
  const { user } = useAuth();
  const membership = useMembership(tribe?.id);
  const isOwner = !!user && T.tribeOwner(tribe) === user.uid;
  const status = membership.data?.status ?? null;
  return {
    isOwner,
    isMember: isOwner || !!membership.data,
    isPending: status === "pending",
    status,
    // A disabled query (signed out) stays "pending" forever — only wait when there is a user.
    loading: !!user && membership.isPending,
  };
}

// ─── Token gating (port of useTokenGating) ───────────────────────────────────

const GATE_ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];

/**
 * Checks whether `address` meets a tribe's token gate on-chain.
 * Gate shape: { tokenType: "Token" | "NFT", tokenAddress, minTokenAmount, name, symbol, decimals, chainId? }
 */
export function useTokenGate(gate, address, enabled = true) {
  return useQuery({
    queryKey: ["tokengate", gate?.tokenAddress, gate?.chainId ?? LEGACY_CHAIN_ID, address, gate?.minTokenAmount],
    queryFn: async () => {
      const chain = getChainById(gate.chainId ?? LEGACY_CHAIN_ID);
      const c = new Contract(gate.tokenAddress, GATE_ABI, getProvider(chain));
      const bal = await c.balanceOf(address);
      if (gate.tokenType === "NFT") return { hasToken: bal >= 1n, balance: bal.toString() };
      const decimals = gate.decimals ?? Number(await c.decimals());
      const need = parseUnits(String(gate.minTokenAmount || "1"), decimals);
      return { hasToken: bal >= need, balance: formatUnits(bal, decimals) };
    },
    enabled: !!(enabled && gate?.tokenAddress && address),
    staleTime: MIN,
    meta: { persist: false },
  });
}

// ─── Posts ────────────────────────────────────────────────────────────────────

const PAGE = 10;

export function useTribePosts(tribeId, enabled = true) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: tribeKeys.posts(user?.uid, tribeId),
    queryFn: ({ pageParam }) => T.getPosts(tribeId, PAGE, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last?.length === PAGE ? T.entityTime(last[last.length - 1]) : undefined),
    enabled: !!(tribeId && enabled),
    staleTime: 30 * SEC,
  });
}

export function usePost(tribeId, postId) {
  const { user } = useAuth();
  return useQuery({
    queryKey: tribeKeys.post(user?.uid, postId),
    queryFn: () => T.getPost(tribeId, postId),
    enabled: !!(tribeId && postId),
    staleTime: 30 * SEC,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  const author = useAuthor();
  return useMutation({
    mutationFn: ({ tribeId, description, imageUrl }) =>
      T.createPost(tribeId, { description, imageUrl: imageUrl || null, username: author.username, userAvatar: author.userAvatar }),
    onSuccess: (_post, { tribeId }) => {
      invalidateEverywhere(qc, tribeKeys.posts(author.uid, tribeId));
      invalidateEverywhere(qc, tribeKeys.feed(author.uid));
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  const { uid } = useAuthor();
  return useMutation({
    mutationFn: ({ tribeId, postId }) => T.deletePost(tribeId, postId),
    onSuccess: (_r, { tribeId }) => {
      invalidateEverywhere(qc, tribeKeys.posts(uid, tribeId));
      invalidateEverywhere(qc, tribeKeys.feed(uid));
    },
  });
}

/** Applies `fn` to a post wherever it's cached (feed, tribe posts, detail). */
function patchPostEverywhere(qc, uid, postId, fn) {
  const patchList = (list) => list?.map((p) => (p.id === postId ? fn(p) : p));
  qc.setQueriesData({ queryKey: ["user", uid, "feed"] }, (d) => (d ? { ...d, pages: d.pages.map(patchList) } : d));
  qc.setQueriesData({ queryKey: ["user", uid, "tribe"] }, (d) => (d?.pages ? { ...d, pages: d.pages.map(patchList) } : d));
  qc.setQueryData(tribeKeys.post(uid, postId), (p) => (p ? fn(p) : p));
}

/** Optimistic reaction toggle (same rules as the backend's upsertReaction). */
export function useReact() {
  const qc = useQueryClient();
  const { uid } = useAuthor();
  return useMutation({
    mutationFn: ({ tribeId, postId, type }) => T.reactToPost(tribeId, postId, type),
    onMutate: ({ postId, type }) => {
      patchPostEverywhere(qc, uid, postId, (p) => {
        const counts = { ...(p.reactionCounts || {}) };
        const prev = p.myReaction;
        if (prev) counts[prev] = Math.max(0, (counts[prev] || 0) - 1);
        const next = prev === type ? null : type;
        if (next) counts[next] = (counts[next] || 0) + 1;
        return { ...p, myReaction: next, reactionCounts: counts };
      });
    },
    onSuccess: (res, { postId }) => {
      patchPostEverywhere(qc, uid, postId, (p) => ({
        ...p,
        myReaction: res.activeReaction ?? null,
        reactionCounts: res.reactionCounts ?? res.counts ?? p.reactionCounts,
      }));
    },
    onError: () => invalidateEverywhere(qc, ["user", uid]),
  });
}

export function useRepost() {
  const qc = useQueryClient();
  const author = useAuthor();
  return useMutation({
    mutationFn: ({ tribeId, postId, comment, targetTribeId }) =>
      T.repost(tribeId, postId, { username: author.username, userAvatar: author.userAvatar, comment: comment || undefined, targetGuildId: targetTribeId }),
    onSuccess: (_r, { postId }) => {
      patchPostEverywhere(qc, author.uid, postId, (p) => ({ ...p, hasReposted: true, repostCount: (p.repostCount || 0) + 1 }));
      invalidateEverywhere(qc, tribeKeys.feed(author.uid));
    },
  });
}

// ─── Comments ─────────────────────────────────────────────────────────────────

const COMMENT_PAGE = 30;

export function useComments(tribeId, postId) {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: tribeKeys.comments(user?.uid, postId),
    queryFn: ({ pageParam = 0 }) => T.getComments(tribeId, postId, COMMENT_PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last?.length === COMMENT_PAGE ? all.length * COMMENT_PAGE : undefined),
    enabled: !!(tribeId && postId),
    staleTime: 15 * SEC,
  });
}

export function useAddComment(tribeId, postId) {
  const qc = useQueryClient();
  const author = useAuthor();
  return useMutation({
    mutationFn: (text) => T.addComment(tribeId, postId, { text, username: author.username, userAvatar: author.userAvatar }),
    onSuccess: (comment) => {
      qc.setQueryData(tribeKeys.comments(author.uid, postId), (d) => {
        if (!d) return d;
        const pages = [...d.pages];
        pages[pages.length - 1] = [...pages[pages.length - 1], comment];
        return { ...d, pages };
      });
      patchPostEverywhere(qc, author.uid, postId, (p) => ({ ...p, commentsCount: (p.commentsCount || 0) + 1 }));
    },
  });
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

const FEED_PAGE = 20;

export function useFeed() {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: tribeKeys.feed(user?.uid),
    queryFn: ({ pageParam = 1 }) => T.getFeed(pageParam, FEED_PAGE),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last?.length === FEED_PAGE ? all.length + 1 : undefined),
    enabled: !!user,
    staleTime: 30 * SEC,
  });
}

/** Signed-out visitors: recent posts from public tribes. */
export function usePublicFeed(enabled = true) {
  return useQuery({ queryKey: ["public", "feed"], queryFn: () => T.getPublicFeed(30), enabled, staleTime: MIN });
}

export function useGovernanceFeed(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: tribeKeys.governance(user?.uid),
    queryFn: T.getGovernanceFeed,
    enabled: !!user && enabled,
    staleTime: 5 * MIN,
  });
}

/** Feed rows use guildName/guildLogoUrl; tribe posts don't carry tribe info. */
export const normaliseFeedPost = (p, tribe) => ({
  ...p,
  tribeId: p.guildId,
  tribeName: p.guildName ?? tribe?.name ?? "Tribe",
  tribeLogoUrl: p.guildLogoUrl ?? T.tribeLogo(tribe),
});
