// lib/dm/http.js — the `http` adapter DmClient expects, over fetch. Shared by
// web, mobile and the backend tests; the platform supplies the base URL and
// how to get a Firebase ID token.
//
//   createDmHttp({ baseUrl, getToken, fetch })
//     baseUrl   ".../api/v1"
//     getToken  async (forceRefresh) → ID token
//
// Errors: Error with .status, .code (server code) and the server's extra
// fields (attemptsLeft, lockedUntil, …) on .body.

export function createDmHttp({ baseUrl, getToken, fetch: f = globalThis.fetch }) {
  async function call(method, path, { body, params, raw } = {}, retried = false) {
    const qs = params
      ? Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&")
      : "";
    const headers = { Authorization: `Bearer ${await getToken(retried)}` };
    let payload;
    if (raw) {
      headers["Content-Type"] = "application/octet-stream";
      payload = raw;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    let res;
    try {
      res = await f(`${baseUrl}${path}${qs ? `?${qs}` : ""}`, { method, headers, body: payload });
    } catch (cause) {
      throw Object.assign(new Error("Could not reach the server. Check your connection and try again.", { cause }), { status: 0, code: "OFFLINE" });
    }
    if (res.status === 401 && !retried) return call(method, path, { body, params, raw }, true);
    return res;
  }

  async function json(res) {
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.success === false) {
      throw Object.assign(new Error(j?.error || `Request failed (${res.status})`), { status: res.status, code: j?.code, body: j });
    }
    return j.data;
  }

  return {
    get: async (path, params) => json(await call("GET", path, { params })),
    send: async (method, path, body) => json(await call(method, path, { body })),
    upload: async (path, bytes) => json(await call("POST", path, { raw: bytes })),
    async download(path) {
      const res = await call("GET", path);
      if (!res.ok) await json(res);
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
