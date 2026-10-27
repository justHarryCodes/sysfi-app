// lib/dm/webStore.js — DmClient store for browsers (IndexedDB, per user).
// The private key ring is encrypted with an AES-GCM key created as
// non-extractable WebCrypto key: scripts on the page can use it but never read
// it out, so copying the browser's IndexedDB files doesn't yield the keys.
// Pinned peer keys are public data and stored as-is.
import { openDB } from "idb";
import { exportKeyRing, importKeyRing } from "./crypto.js";

const DB = "sysfi-dm";
let dbp = null;
const db = () => (dbp ??= openDB(DB, 1, { upgrade: (d) => d.createObjectStore("kv") }));

async function wrapKey(uid) {
  const d = await db();
  let key = await d.get("kv", `wrap:${uid}`);
  if (!key) {
    key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await d.put("kv", key, `wrap:${uid}`);
  }
  return key;
}

export function webStore(uid) {
  const ad = new TextEncoder().encode(`sysfi-dm-ring:${uid}`);
  return {
    async loadRing() {
      const rec = await (await db()).get("kv", `ring:${uid}`);
      if (!rec) return null;
      try {
        const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: rec.iv, additionalData: ad }, await wrapKey(uid), rec.data);
        return importKeyRing(new TextDecoder().decode(plain));
      } catch {
        return null; // wrapping key gone (site data partly cleared) — restore from backup
      }
    },
    async saveRing(ring) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: ad }, await wrapKey(uid), new TextEncoder().encode(exportKeyRing(ring)));
      await (await db()).put("kv", { iv, data }, `ring:${uid}`);
    },
    async clearRing() {
      const d = await db();
      await d.delete("kv", `ring:${uid}`);
      await d.delete("kv", `wrap:${uid}`);
    },
    loadPins: async () => (await (await db()).get("kv", `pins:${uid}`)) ?? null,
    savePins: async (pins) => void (await (await db()).put("kv", pins, `pins:${uid}`)),
  };
}
