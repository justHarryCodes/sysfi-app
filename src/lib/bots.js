// lib/bots.js — bots (backend api/v1/bots): the developer's bots, the
// directory, installs per tribe, and button clicks in chat.
import { api } from "@/lib/api";

const data = (p) => p.then((json) => json?.data ?? json);

// Developer
export const getMyBots = () => api.get("/developers/me/bots");
export const getMyBot = (id) => api.get(`/developers/me/bots/${id}`);
/** Returns { bot, token, webhookSecret } — the token is shown once. */
export const createBot = (body) => data(api.post("/developers/me/bots", body));
export const updateBot = (id, body) => data(api.put(`/developers/me/bots/${id}`, body));
export const deleteBot = (id) => data(api.del(`/developers/me/bots/${id}`));
export const rotateBotToken = (id) => data(api.post(`/developers/me/bots/${id}/token`));
export const rotateBotSecret = (id) => data(api.post(`/developers/me/bots/${id}/secret`));
export const submitBot = (id) => data(api.post(`/developers/me/bots/${id}/submit`));
export const pingBot = (id) => data(api.post(`/developers/me/bots/${id}/ping`));
export const getBotEvents = (id) => api.get(`/developers/me/bots/${id}/events`);

// Review (admins)
export const getPendingBots = () => api.get("/bots/admin/pending");
export const reviewBot = (id, status, reviewNotes) => data(api.post(`/bots/${id}/review`, { status, reviewNotes }));

// Directory
export const getBotDirectory = (q) => api.publicGet("/bots", { q: q || undefined });
export const getBot = (id) => api.maybeGet(`/bots/${id}`); // isMine needs auth; public otherwise
export const getInstallTargets = (id) => api.get(`/bots/${id}/install-targets`);

// Tribes
/** { role, permissionInfo, bots: [{ ...bot, granted }] } */
export const getTribeBots = (guildId) => api.get(`/guilds/${guildId}/bots`);
export const installBot = (guildId, botId, permissions) => data(api.post(`/guilds/${guildId}/bots/${botId}`, { permissions }));
export const setBotPermissions = (guildId, botId, permissions) => data(api.patch(`/guilds/${guildId}/bots/${botId}`, { permissions }));
export const removeBot = (guildId, botId) => data(api.del(`/guilds/${guildId}/bots/${botId}`));
/** { toast, delivered } */
export const clickBotButton = (guildId, messageId, buttonId) => data(api.post(`/guilds/${guildId}/messages/${messageId}/interact`, { buttonId }));

export const isBotsMissing = (err) => err?.status === 404 || /relation .*bot.* does not exist/i.test(err?.message ?? "");

// Mirrors backend/src/config/bots.js (the server re-checks everything).
export const BOT_PERMISSIONS = {
  "chat:write": { label: "Send messages and reply to commands", sensitive: false, always: true },
  "posts:write": { label: "Publish posts in the tribe", sensitive: false },
  "messages:read": { label: "Read every chat message (not just commands and mentions)", sensitive: true },
  "messages:manage": { label: "Delete and pin anyone’s messages", sensitive: true },
};
export const BOT_USERNAME = /^[a-z][a-z0-9_]{1,25}bot$/;
export const BOT_API_URL = "https://api.sysfi.network/api/bot/v1";
