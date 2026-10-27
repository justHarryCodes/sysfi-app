// lib/googleDrive.js — the Drive half of the Google wallet backup
// (lib/googleVault.js), kept in the user's Drive appDataFolder: a hidden
// folder only this app can see (scope drive.appdata — no access to the
// user's own files). Shared by the web app and the mobile app; needs a Google
// OAuth access token with that scope.
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
export const VAULT_FILE = "sysfi-wallet-vault.json";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

const fail = (message, code, status) => Object.assign(new Error(message), { code, status });

async function call(url, token, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  } catch {
    throw fail("Couldn't reach Google Drive. Check your connection and try again.", "DRIVE_NETWORK");
  }
  if (res.status === 401) throw fail("Your Google session expired. Sign in with Google again.", "GOOGLE_TOKEN_EXPIRED", 401);
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
    if (/insufficient|scope|PERMISSION_DENIED/i.test(String(reason) + String(body?.error?.message ?? ""))) {
      throw fail("Allow Sysfi to use Google Drive to keep your wallet backup.", "DRIVE_SCOPE_MISSING", 403);
    }
    throw fail("Google Drive refused the request. Please try again.", "DRIVE_FORBIDDEN", 403);
  }
  if (!res.ok) throw fail(`Google Drive error (${res.status}). Please try again.`, "DRIVE_ERROR", res.status);
  return res;
}

/** The backup file's id, or null. */
export async function findVaultFile(token) {
  const q = encodeURIComponent(`name = '${VAULT_FILE}' and trashed = false`);
  const res = await call(`${API}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`, token);
  const { files } = await res.json();
  return files?.[0]?.id ?? null;
}

/** The Drive half of the backup, or null when there is none. */
export async function readVaultFile(token) {
  const id = await findVaultFile(token);
  if (!id) return null;
  const res = await call(`${API}/${id}?alt=media`, token);
  return res.json();
}

/** Create or replace the Drive half. Returns the file id. */
export async function writeVaultFile(token, content) {
  const body = JSON.stringify(content);
  const id = await findVaultFile(token);
  if (id) {
    await call(`${UPLOAD}/${id}?uploadType=media`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    return id;
  }
  const boundary = `sysfi${Math.random().toString(36).slice(2)}`;
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: VAULT_FILE, parents: ["appDataFolder"], mimeType: "application/json" }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const res = await call(`${UPLOAD}?uploadType=multipart&fields=id`, token, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  return (await res.json()).id;
}
