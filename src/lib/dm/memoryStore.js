// lib/dm/memoryStore.js — a DmClient store that lives in memory (tests, and
// the reference for the platform stores). Keys are kept serialised so the
// round trip matches what persistent stores do.
import { exportKeyRing, importKeyRing } from "./crypto.js";

export function memoryStore() {
  let ring = null;
  let pins = null;
  return {
    loadRing: async () => (ring ? importKeyRing(ring) : null),
    saveRing: async (r) => void (ring = exportKeyRing(r)),
    clearRing: async () => void (ring = null),
    loadPins: async () => (pins ? JSON.parse(pins) : null),
    savePins: async (p) => void (pins = JSON.stringify(p)),
  };
}
