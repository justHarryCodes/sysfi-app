// lib/deviceVault.js — keeps the Drive half of a Google wallet backup on this
// browser so everyday signing doesn't need a Google popup (Drive tokens only
// last an hour). It's stored in IndexedDB encrypted with a per-user AES key
// that is itself stored as a non-extractable CryptoKey — script on the page
// can use it but never read it out. Opening the wallet still needs the
// Firestore half and the server key (a Google-authenticated session).
// Removed on sign-out with the rest of the user's cached data.
import { kvDelete, kvGet, kvSet, userScope } from "@/lib/cache/idb";

const keyId = (uid) => `vault-device-key:${uid}`;
const halfId = (uid) => `vault-drive-half:${uid}`;
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deviceKey(uid, create) {
  const existing = await kvGet(keyId(uid));
  if (existing || !create) return existing ?? null;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await kvSet(keyId(uid), key, userScope(uid));
  return key;
}

export async function saveDriveHalf(uid, driveHalf) {
  try {
    const key = await deviceKey(uid, true);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(uid) }, key, enc.encode(JSON.stringify(driveHalf))));
    await kvSet(halfId(uid), { iv, data }, userScope(uid));
  } catch (err) {
    console.warn("[deviceVault] couldn't keep the Drive half on this device:", err);
  }
}

export async function loadDriveHalf(uid) {
  try {
    const [key, box] = await Promise.all([deviceKey(uid, false), kvGet(halfId(uid))]);
    if (!key || !box) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv, additionalData: enc.encode(uid) }, key, box.data);
    return JSON.parse(dec.decode(plain));
  } catch {
    return null; // missing or unreadable → fetch from Drive again
  }
}

export async function forgetDriveHalf(uid) {
  await Promise.all([kvDelete(halfId(uid)), kvDelete(keyId(uid))]).catch(() => {});
}
