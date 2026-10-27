// lib/miniapp/api.js — Explore + mini-app endpoints (backend api/v1/miniapps).
import { api } from "@/lib/api";

const data = (p) => p.then((json) => json?.data ?? json);

export const getDirectory = ({ kind, category, search } = {}) =>
  api.publicGet("/miniapps/directory", { kind, category: category && category !== "all" ? category : undefined, search: search || undefined });
export const getMiniApp = (id) => api.publicGet(`/miniapps/${id}`);
export const getMyMiniApps = () => api.get("/miniapps/mine");

export const getGrant = (id) => api.get(`/miniapps/${id}/grant`);
export const setGrant = (id, scopes) => data(api.put(`/miniapps/${id}/grant`, { scopes }));
export const revokeGrant = (id) => data(api.del(`/miniapps/${id}/grant`));
export const recordOpen = (id) => api.post(`/miniapps/${id}/open`, {}, { auth: false }).catch(() => null);

export const getStorage = (id, key) => api.get(`/miniapps/${id}/storage/${encodeURIComponent(key)}`).then((d) => d?.value ?? null);
export const setStorage = (id, key, value) => data(api.put(`/miniapps/${id}/storage/${encodeURIComponent(key)}`, { value }));

export const getTribeApps = (guildId) => api.publicGet(`/guilds/${guildId}/miniapps`);
export const installApp = (guildId, appId, scopes) => data(api.post(`/guilds/${guildId}/miniapps/${appId}/install`, { scopes }));
export const uninstallApp = (guildId, appId) => data(api.del(`/guilds/${guildId}/miniapps/${appId}`));

/** True when the backend has the mini-app tables (the production DB may not yet). */
export const isPlatformMissing = (err) => /relation .*miniapps.* does not exist/i.test(err?.message ?? "");

/** Signed-in read: owners and reviewers also see pending/rejected apps. */
export const getMiniAppAuthed = (id) => api.get(`/miniapps/${id}`);
export const submitApp = (manifest) => data(api.post("/miniapps", manifest));
export const updateApp = (id, patch) => data(api.put(`/miniapps/${id}`, patch));
export const deleteApp = (id) => data(api.del(`/miniapps/${id}`));
export const getPendingApps = () => api.get("/miniapps/admin/pending");
export const reviewApp = (id, status, reviewNotes) => data(api.post(`/miniapps/${id}/review`, { status, reviewNotes }));
