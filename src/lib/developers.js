// lib/developers.js — developer portal endpoints (backend api/v1/developers).
import { api } from "@/lib/api";

const data = (p) => p.then((json) => json?.data ?? json);

/** { developer | null, isAdmin, apiScopes } */
export const getDeveloperMe = () => api.get("/developers/me");
export const applyAsDeveloper = (body) => data(api.post("/developers/apply", body));
export const getMyApps = () => api.get("/developers/me/apps");

export const listKeys = () => api.get("/developers/me/keys");
/** Returns the key with `secret` — shown once, never retrievable again. */
export const createKey = (name, scopes) => data(api.post("/developers/me/keys", { name, scopes }));
export const revokeKey = (id) => data(api.del(`/developers/me/keys/${id}`));

export const getApplications = (status = "applied") => api.get("/developers/admin/applications", { status });
export const reviewDeveloper = (uid, status, reviewNotes) => data(api.post(`/developers/admin/${uid}/review`, { status, reviewNotes }));

export const isNotDeployed = (err) => err?.status === 404 || /relation .*(developers|miniapps|api_keys).* does not exist/i.test(err?.message ?? "");
