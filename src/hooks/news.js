"use client";
// hooks/news.js — news cards in the feed and their social layer, cached like
// posts (hooks/tribes.js). Reactions are optimistic with the same toggle rules
// as posts. If the backend has news switched off, cards are simply empty.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as N from "@/lib/news/api";

const SEC = 1000;
export const CARDS_PAGE = 6;

export const newsKeys = {
  cards: (uid) => ["news", uid ?? "anon", "cards"],
  item: (uid, key) => ["news", uid ?? "anon", "item", key],
  comments: (key) => ["public", "news-comments", key],
};

const quiet404 = (p) => p.catch((e) => (e.status === 404 ? [] : Promise.reject(e)));

/** Pages of cards (offset-based); the feed asks for more as it grows. */
export function useNewsCards() {
  const { user } = useAuth();
  return useInfiniteQuery({
    queryKey: newsKeys.cards(user?.uid),
    queryFn: ({ pageParam = 0 }) => quiet404(N.getNewsCards(pageParam, CARDS_PAGE)),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last?.length === CARDS_PAGE ? all.length * CARDS_PAGE : undefined),
    staleTime: 60 * SEC,
    meta: { persist: false },
  });
}

export function useNewsItem(key) {
  const { user } = useAuth();
  return useQuery({ queryKey: newsKeys.item(user?.uid, key), queryFn: () => N.getNewsItem(key), enabled: !!key, staleTime: 30 * SEC, meta: { persist: false } });
}

/** Applies fn(card) to every cached copy of a card. */
function patchCard(qc, key, fn) {
  qc.setQueriesData({ queryKey: ["news"] }, (d) => {
    if (!d) return d;
    if (d.pages) return { ...d, pages: d.pages.map((pg) => pg?.map((c) => (c.key === key ? fn(c) : c))) };
    return d.key === key ? fn(d) : d;
  });
}

export function useNewsReact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, type }) => N.reactToNews(key, type),
    onMutate: ({ key, type }) =>
      patchCard(qc, key, (c) => {
        const s = c.social ?? { reactionCounts: {} };
        const counts = { ...(s.reactionCounts || {}) };
        const prev = s.myReaction;
        if (prev) counts[prev] = Math.max(0, (counts[prev] || 0) - 1);
        const next = prev === type ? null : type;
        if (next) counts[next] = (counts[next] || 0) + 1;
        return { ...c, social: { ...s, myReaction: next, reactionCounts: counts } };
      }),
    onSuccess: (res, { key }) => patchCard(qc, key, (c) => ({ ...c, social: { ...c.social, myReaction: res.activeReaction, reactionCounts: res.reactionCounts } })),
    onError: () => qc.invalidateQueries({ queryKey: ["news"] }),
  });
}

export function useNewsComments(key) {
  return useInfiniteQuery({
    queryKey: newsKeys.comments(key),
    queryFn: ({ pageParam = 0 }) => N.getNewsComments(key, 20, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last?.length === 20 ? all.length * 20 : undefined),
    enabled: !!key,
    staleTime: 15 * SEC,
    meta: { persist: false },
  });
}

export function useAddNewsComment(key) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (text) => N.addNewsComment(key, { text, username: user?.username || user?.displayName || "Anon", userAvatar: user?.profileImageUrl || null }),
    onSuccess: (comment) => {
      qc.setQueryData(newsKeys.comments(key), (d) => {
        if (!d) return d;
        const pages = [...d.pages];
        pages[pages.length - 1] = [...pages[pages.length - 1], comment];
        return { ...d, pages };
      });
      patchCard(qc, key, (c) => ({ ...c, social: { ...c.social, commentsCount: (c.social?.commentsCount || 0) + 1 } }));
    },
  });
}

export function useDeleteNewsComment(key) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => N.deleteNewsComment(id),
    onSuccess: (_r, id) => {
      qc.setQueryData(newsKeys.comments(key), (d) => (d ? { ...d, pages: d.pages.map((pg) => pg.filter((c) => c.id !== id)) } : d));
      patchCard(qc, key, (c) => ({ ...c, social: { ...c.social, commentsCount: Math.max(0, (c.social?.commentsCount || 1) - 1) } }));
    },
  });
}
