// lib/googleVault.js — the passwordless wallet backup for Google sign-in,
// shared by the web app and the mobile app (metro maps "@/lib/*" here).
//
// The wallet (same walletData the password cloud copy holds: mnemonic,
// account-0 key, …) is encrypted with a random 256-bit data key K
// (AES-256-GCM). K is split in two (2-of-2, XOR):
//
//   Drive share      random 32 bytes → the user's Google Drive, in the hidden
//                    app-only folder (appDataFolder)
//   Firestore share  K ⊕ Drive share → wallets/{uid}.googleVault, next to the
//                    encrypted wallet
//
// Either share alone is uniformly random and says nothing about K. Each share
// is additionally encrypted (wrapped) with its own key derived (HKDF-SHA256)
// from the server key-encryption key — which the backend only hands to a
// session that signed in with Google (GET /auth/wallet-key). To open the
// vault you therefore need all of: the user's Google Drive, our Firestore
// record, and our server, reached through a Google-authenticated session.
// A leak of any one of them reveals nothing.
//
// The Google account id (`sub`) and the Firebase uid are bound into every
// ciphertext as authenticated data — never used as key material: they aren't
// secret. A vault (or a Drive file) can't be replayed into another account.
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export const VAULT_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
// UTF-8 without TextEncoder/TextDecoder: React Native (Hermes) doesn't
// guarantee TextDecoder, and this module runs there too.
const utf8 = {
  encode(str) {
    const out = [];
    for (const ch of String(str)) {
      const c = ch.codePointAt(0);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  },
};
const utf8d = {
  decode(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; ) {
      const b = bytes[i++];
      let c;
      if (b < 0x80) c = b;
      else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[i++] & 63);
      else if (b < 0xf0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      else c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      out += String.fromCodePoint(c);
    }
    return out;
  },
};

const randomBytes = (n) => {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
};

// base64 without Buffer/atob differences between browsers and React Native.
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function toB64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}
export function fromB64(str) {
  const clean = String(str).replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2] ?? "A") & 63) << 6) | (B64.indexOf(clean[i + 3] ?? "A") & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

const xor = (a, b) => a.map((x, i) => x ^ b[i]);
const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const wipe = (...arrs) => arrs.forEach((a) => a?.fill?.(0));

const fail = (message, code) => Object.assign(new Error(message), { code });

const aad = {
  wallet: (uid, sub, address) => utf8.encode(`sysfi-vault:v${VAULT_VERSION}:wallet:${uid}:${sub}:${String(address).toLowerCase()}`),
  share: (where, uid, sub) => utf8.encode(`sysfi-vault:v${VAULT_VERSION}:${where}-share:${uid}:${sub}`),
};

/** Per-location wrapping key from the server KEK (base64, 32 bytes). */
function wrapKey(kekB64, where) {
  const kek = fromB64(kekB64);
  if (kek.length !== KEY_BYTES) throw fail("Invalid wallet key from the server", "BAD_KEK");
  const k = hkdf(sha256, kek, utf8.encode("sysfi-vault-salt-v1"), utf8.encode(`sysfi-vault-v1:${where}-share`), KEY_BYTES);
  wipe(kek);
  return k;
}

function seal(key, plaintext, ad) {
  const iv = randomBytes(IV_BYTES);
  return { iv: toB64(iv), data: toB64(gcm(key, iv, ad).encrypt(plaintext)) };
}

function open(key, box, ad, what) {
  try {
    return gcm(key, fromB64(box.iv), ad).decrypt(fromB64(box.data));
  } catch {
    throw fail(`The ${what} doesn't belong to this account or was altered`, "VAULT_TAMPERED");
  }
}

function assertParams({ uid, googleSub, kek }) {
  if (!uid) throw fail("Missing account id", "VAULT_PARAMS");
  if (!googleSub) throw fail("Missing Google account id", "VAULT_PARAMS");
  if (!kek) throw fail("Missing wallet key", "VAULT_PARAMS");
}

/**
 * Encrypt a wallet into the two vault halves.
 * @returns {{ firestore: object, drive: object }} — store `firestore` at
 *   wallets/{uid}.googleVault and `drive` as the Drive appDataFolder file.
 */
export function sealVault({ walletData, uid, googleSub, address, kek }) {
  assertParams({ uid, googleSub, kek });
  if (!address) throw fail("Missing wallet address", "VAULT_PARAMS");
  const dataKey = randomBytes(KEY_BYTES);
  const driveShare = randomBytes(KEY_BYTES);
  const firestoreShare = xor(dataKey, driveShare);
  const wf = wrapKey(kek, "firestore");
  const wd = wrapKey(kek, "drive");
  try {
    const wallet = seal(dataKey, utf8.encode(JSON.stringify(walletData)), aad.wallet(uid, googleSub, address));
    const createdAt = new Date().toISOString();
    // Pairs the two halves (not secret): a re-backup replaces both, and a
    // restore picks the Firestore half whose id matches the Drive file.
    const backupId = toHex(randomBytes(8));
    return {
      firestore: {
        v: VAULT_VERSION,
        alg: "aes-256-gcm/xor-2of2",
        backupId,
        googleSub,
        address,
        wallet,
        share: seal(wf, firestoreShare, aad.share("firestore", uid, googleSub)),
        createdAt,
      },
      drive: {
        v: VAULT_VERSION,
        app: "sysfi",
        backupId,
        uid,
        googleSub,
        address,
        share: seal(wd, driveShare, aad.share("drive", uid, googleSub)),
        createdAt,
      },
    };
  } finally {
    wipe(dataKey, driveShare, firestoreShare, wf, wd);
  }
}

/** Decrypt a wallet from its two halves. Throws VAULT_* errors on any mismatch. */
export function openVault({ firestore, drive, uid, googleSub, kek }) {
  assertParams({ uid, googleSub, kek });
  if (!firestore?.wallet || !firestore?.share) throw fail("No Google backup found for this account", "VAULT_MISSING");
  if (!drive?.share) throw fail("The Google Drive half of your backup is missing", "VAULT_DRIVE_MISSING");
  if (firestore.v !== VAULT_VERSION || drive.v !== VAULT_VERSION) throw fail("Unsupported backup version", "VAULT_VERSION");
  if (firestore.googleSub !== googleSub || drive.googleSub !== googleSub || drive.uid !== uid) {
    throw fail("This backup belongs to a different Google account", "VAULT_WRONG_ACCOUNT");
  }
  if (String(firestore.address).toLowerCase() !== String(drive.address).toLowerCase()) {
    throw fail("The two halves of your backup don't match", "VAULT_MISMATCH");
  }
  const wf = wrapKey(kek, "firestore");
  const wd = wrapKey(kek, "drive");
  let fs, dr, dataKey, plain;
  try {
    fs = open(wf, firestore.share, aad.share("firestore", uid, googleSub), "backup record");
    dr = open(wd, drive.share, aad.share("drive", uid, googleSub), "Google Drive backup");
    dataKey = xor(fs, dr);
    plain = open(dataKey, firestore.wallet, aad.wallet(uid, googleSub, firestore.address), "backup");
    return JSON.parse(utf8d.decode(plain));
  } finally {
    wipe(wf, wd, fs, dr, dataKey, plain);
  }
}

/** Google account id (`sub`) of the Google provider linked to a Firebase user, if any. */
export const googleSubOf = (firebaseUser) => firebaseUser?.providerData?.find((p) => p.providerId === "google.com")?.uid ?? null;
