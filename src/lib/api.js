// lib/api.js — backend client. Mirrors crypto-wallet/services/TribeApiService.js:
// Firebase ID token as Bearer, one forced token refresh + replay on 401.
// Responses are { success, data?, error? }.
import { auth } from "@/lib/firebase";
import { APP_CONFIG } from "@/lib/config";

const BASE = APP_CONFIG.BACKEND_URL;

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = "GET", body, params, auth: needsAuth = true, forceRefresh = false } = {}) {
  const url = new URL(BASE + path);
  if (params) {
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (needsAuth) {
    const user = auth.currentUser;
    if (!user) throw new ApiError("Not authenticated", 401);
    headers.Authorization = `Bearer ${await user.getIdToken(forceRefresh)}`;
  }

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }

  if (res.status === 401 && needsAuth && !forceRefresh) {
    return request(path, { method, body, params, auth: needsAuth, forceRefresh: true });
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    // Routes reply with either { error: "msg" } or { error: { message } }.
    const msg = typeof json?.error === "string" ? json.error : json?.error?.message || json?.message;
    throw new ApiError(msg || `Request failed (${res.status})`, res.status, json);
  }
  return json;
}

export const api = {
  get: (path, params, opts) => request(path, { ...opts, params }).then((j) => j.data),
  publicGet: (path, params) => request(path, { params, auth: false }).then((j) => j.data),
  /** Authenticated when signed in, anonymous otherwise (public pages that add per-user fields). */
  maybeGet: (path, params) => request(path, { params, auth: !!auth.currentUser }).then((j) => j.data),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  put: (path, body, opts) => request(path, { ...opts, method: "PUT", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  del: (path, body, opts) => request(path, { ...opts, method: "DELETE", body }),
};

/**
 * Google-gated wallet Key-Encryption-Key (see backend walletKeyService.js).
 * Only issued to sessions minted by Google Sign-In; used in place of a
 * password for Google-only accounts.
 */
export async function fetchWalletKek() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to unlock your wallet.");
  try {
    const json = await request("/auth/wallet-key", { forceRefresh: true });
    if (!json.kek) throw new Error();
    return json.kek;
  } catch (err) {
    if (err.status === 403) throw new Error("Your wallet is Google-secured — please sign in with Google to unlock it.");
    throw new Error(err.message || "Failed to unlock your wallet. Please try again.");
  }
}
