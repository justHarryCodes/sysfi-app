// lib/tribeApi.js — port of crypto-wallet/services/TribeApiService.js
// (backend: api/v1/guilds, api/v1/feed). Every call returns the response's
// `data` payload. Field names are the backend's own (a mix of snake_case
// rows from Postgres and camelCase documents from Mongo).
import { api } from "@/lib/api";

const data = (p) => p.then((json) => json?.data ?? json);

// ─── Tribes ───────────────────────────────────────────────────────────────────
export const getMyTribes = () => api.get("/guilds");
export const getTopTribes = (limit = 10) => api.publicGet("/guilds/top", { limit });
export const searchTribes = (q, genre) => api.publicGet("/guilds/search", { q, genre });
export const getTribe = (id) => api.publicGet(`/guilds/${id}`);
export const createTribe = (body) => data(api.post("/guilds", body));
export const updateTribe = (id, body) => data(api.put(`/guilds/${id}`, body));
export const deleteTribe = (id) => data(api.del(`/guilds/${id}`));

// ─── Membership ───────────────────────────────────────────────────────────────
export const getMembers = (id) => api.maybeGet(`/guilds/${id}/members`);
export const getMembership = (id) => api.get(`/guilds/${id}/membership`);
export const joinTribe = (id, body) => api.post(`/guilds/${id}/join`, body); // raw: { data, alreadyMember? }
export const leaveTribe = (id) => data(api.post(`/guilds/${id}/leave`));
export const banUser = (id, userId, username) => data(api.post(`/guilds/${id}/ban/${userId}`, { username }));

// ─── Invites ──────────────────────────────────────────────────────────────────
export const getInviteByCode = (code) => api.publicGet(`/guilds/invite/${code}`);
export const getInvites = (id) => api.get(`/guilds/${id}/invites`);
export const createInvite = (id, options = {}) => data(api.post(`/guilds/${id}/invites`, options));
export const deactivateInvite = (id, inviteId) => data(api.del(`/guilds/${id}/invites/${inviteId}`));

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const getMessages = (id, limit, before) => api.get(`/guilds/${id}/messages`, { limit, before });
export const pollMessages = (id, since) => api.get(`/guilds/${id}/messages/poll`, { since });
export const getPinnedMessages = (id) => api.get(`/guilds/${id}/messages/pinned`);
export const sendMessage = (id, body) => data(api.post(`/guilds/${id}/messages`, body));
export const editMessage = (id, messageId, newText) => data(api.put(`/guilds/${id}/messages/${messageId}`, { newText }));
export const deleteMessage = (id, messageId) => data(api.del(`/guilds/${id}/messages/${messageId}`));
export const pinMessage = (id, messageId) => data(api.post(`/guilds/${id}/messages/${messageId}/pin`));
export const unpinMessage = (id, messageId) => data(api.del(`/guilds/${id}/messages/${messageId}/pin`));
export const deleteAllUserMessages = (id, userId) => data(api.post(`/guilds/${id}/messages/batch-delete`, { userId }));
export const getUnreadCount = (id) => api.get(`/guilds/${id}/unread`);
export const resetUnread = (id) => data(api.post(`/guilds/${id}/unread/reset`));
export const getChatSettings = (id) => api.get(`/guilds/${id}/settings/chat`);
export const updateChatSettings = (id, body) => data(api.put(`/guilds/${id}/settings/chat`, body));

// ─── Posts ────────────────────────────────────────────────────────────────────
export const getPosts = (id, limit, before) => api.maybeGet(`/guilds/${id}/posts`, { limit, before });
export const getPost = (id, postId) => api.maybeGet(`/guilds/${id}/posts/${postId}`);
export const createPost = (id, body) => data(api.post(`/guilds/${id}/posts`, body));
export const deletePost = (id, postId) => data(api.del(`/guilds/${id}/posts/${postId}`));
export const getComments = (id, postId, limit, skip) => api.maybeGet(`/guilds/${id}/posts/${postId}/comments`, { limit, skip });
export const addComment = (id, postId, body) => data(api.post(`/guilds/${id}/posts/${postId}/comments`, body));
export const reactToPost = (id, postId, reactionType) => data(api.post(`/guilds/${id}/posts/${postId}/react`, { reactionType }));
export const repost = (id, postId, body) => data(api.post(`/guilds/${id}/posts/${postId}/repost`, body));
export const getRepostStatus = (id, postId) => api.get(`/guilds/${id}/posts/${postId}/repost-status`);
export const trackImpression = (id, postId) => api.post(`/guilds/${id}/posts/${postId}/impression`).catch(() => {});

// ─── Moderators ───────────────────────────────────────────────────────────────
export const getModerators = (id) => api.get(`/guilds/${id}/moderators`);
export const addModerator = (id, body) => data(api.post(`/guilds/${id}/moderators`, body));
export const removeModerator = (id, userId) => data(api.del(`/guilds/${id}/moderators/${userId}`));
export const updateModeratorPerms = (id, userId, permissions) =>
  data(api.put(`/guilds/${id}/moderators/${userId}/permissions`, { permissions }));

// ─── Links / DAO ──────────────────────────────────────────────────────────────
export const getExternalLinks = (id) => api.get(`/guilds/${id}/settings/links`);
export const updateExternalLinks = (id, body) => data(api.put(`/guilds/${id}/settings/links`, body));
export const linkDao = (id, daoAddress, chainId) => data(api.post(`/guilds/${id}/dao`, { daoAddress, chainId }));
export const unlinkDao = (id) => data(api.del(`/guilds/${id}/dao`));

// ─── Feed ─────────────────────────────────────────────────────────────────────
export const getFeed = (page = 1, limit = 20) => api.get("/feed", { page, limit });
export const pollFeed = (since) => api.get("/feed/poll", { since });
export const getGovernanceFeed = () => api.get("/feed/governance");
/** Recent posts from public tribes — no account needed. */
export const getPublicFeed = (limit = 30) => api.publicGet("/feed/public", { limit });

// ─── Shape helpers (backend mixes snake_case and camelCase) ──────────────────
export const tribeLogo = (t) => t?.logoUrl ?? t?.logo_url ?? null;
export const tribeBanner = (t) => t?.bannerUrl ?? t?.banner_url ?? null;
export const tribeMembers = (t) => t?.memberCount ?? t?.member_count ?? 0;
export const tribeOwner = (t) => t?.createdBy ?? t?.created_by ?? null;
export const tribeGating = (t) => t?.tokenGating ?? t?.token_gating ?? null;
export const tribeDao = (t) => ({
  address: t?.linkedDaoAddress ?? t?.linked_dao_address ?? null,
  chainId: t?.linkedDaoChainId ?? t?.linked_dao_chain_id ?? null,
});
export const entityTime = (x) => (typeof x?.timestamp === "number" ? x.timestamp : x?.createdAt ? Date.parse(x.createdAt) : 0);

export const GENRES = ["NFTs", "DeFi", "DAO", "GameFi", "DePIN", "AI", "Memecoin", "Degen", "RWA", "Metaverse", "Infrastructure"];

export const REACTIONS = [
  { type: "fire", emoji: "🔥", label: "Fire" },
  { type: "heart", emoji: "❤️", label: "Love" },
  { type: "thumbsup", emoji: "👍", label: "Like" },
  { type: "laugh", emoji: "🤣", label: "Haha" },
  { type: "wow", emoji: "😮", label: "Wow" },
  { type: "sad", emoji: "😢", label: "Sad" },
];

/** Invite URL in the domain the app's universal links are registered for. */
export const inviteUrl = (code) => `https://sysfi.network/invite/${code}`;
export const postUrl = (tribeId, postId) => `https://sysfi.network/post/${tribeId}/${postId}`;

/** An invite that's still usable: active and not past its expiry. */
export const isLiveInvite = (i) => !!i?.is_active && (!i.expires_at || Date.parse(i.expires_at) > Date.now());
