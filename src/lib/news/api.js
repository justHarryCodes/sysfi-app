// lib/news/api.js — news cards and their social layer (backend
// modules/news/routes.js). Shared by web and mobile (metro maps @/lib).
// Cards: { type: 'story'|'insight', key, story|insight, social }, where social
// = { reactionCounts, commentsCount, impressionCount, myReaction }.
import { api } from "@/lib/api";

const k = (key) => encodeURIComponent(key);

export const getNewsCards = (offset = 0, count = 6, coins) => api.maybeGet("/news/cards", { offset, count, coins: coins?.length ? coins.join(",") : undefined });
export const getNewsItem = (key) => api.maybeGet(`/news/items/${k(key)}`);
export const reactToNews = (key, reactionType) => api.post(`/news/items/${k(key)}/react`, { reactionType }).then((j) => j.data);
export const getNewsComments = (key, limit = 20, skip = 0) => api.publicGet(`/news/items/${k(key)}/comments`, { limit, skip });
export const addNewsComment = (key, body) => api.post(`/news/items/${k(key)}/comments`, body).then((j) => j.data);
export const deleteNewsComment = (id) => api.del(`/news/comments/${id}`);
export const trackNewsImpression = (key) => api.post(`/news/items/${k(key)}/impression`, undefined, { auth: false }).catch(() => {});

/** Path of a card's own page (web route /news/[key]). */
export const newsPath = (key) => `/news/${k(key)}`;
