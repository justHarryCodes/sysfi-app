// lib/dm/crypto.js — end-to-end encryption for direct messages. Shared by the
// web app, the mobile app (metro maps @/lib → web/src/lib) and the backend
// tests, so all three speak byte-identical protocol.
//
// ── Keys ────────────────────────────────────────────────────────────────────
//   Account keys (per user, shared by all of the user's devices):
//     sign  Ed25519   — signs the user's key bundle and every message they send
//     box   X25519    — receives sealed conversation keys
//   Keys rotate by version (lost device, reset). A KeyRing keeps every version's
//   private keys so old conversations stay readable. The ring never leaves a
//   device unencrypted: it moves between devices only as a PIN backup or a
//   device-link transfer, both sealed below.
//
//   Bundle (public, published to the server):
//     { v, uid, version, signPub, boxPub, createdAt, sig, prevSig? }
//     sig      self-signature by this version's sign key (binds box → sign)
//     prevSig  the previous version's sign key over the same bytes, so a
//              rotation the user made can be told apart from a key the
//              server substituted (which can't carry it).
//
// ── Conversations ───────────────────────────────────────────────────────────
//   Each conversation has epochs; each epoch has a random 32-byte key (CK).
//   The CK is sealed (X25519 ECIES → XChaCha20-Poly1305) to every participant's
//   box key; the server only ever stores the sealed envelopes. A new epoch
//   starts when a participant's keys rotate (and, for groups, when membership
//   changes). Groups use the same structure with more envelopes.
//
// ── Messages ────────────────────────────────────────────────────────────────
//   payload (JSON) → padded to a 256-byte bucket (hides exact length)
//   → XChaCha20-Poly1305 under the epoch CK, with associated data binding
//     conversation, epoch, sender, sender key version and message id (no
//     cut-and-paste between conversations or senders)
//   → Ed25519 signature by the sender over AD ‖ ciphertext (in a group, other
//     members hold the CK too; the signature stops them forging each other).
//   Edits, reactions and unsends are messages too; the server can't read any.
//
// ── Backup (PIN) ────────────────────────────────────────────────────────────
//   scrypt(PIN, salt) → authKey (shown to the server, which rate-limits
//   attempts and releases `serverShare`) and encPart (never leaves the device).
//   backupKey = HKDF(encPart ‖ serverShare). Brute-forcing the PIN therefore
//   needs the server's cooperation (attempt-limited) or its database *and*
//   its pepper.
//
// Every function is pure and synchronous except the scrypt step.
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";
import { randomBytes, concatBytes } from "@noble/hashes/utils.js";
import { b64, unb64, utf8, fromUtf8, equalBytes } from "./encoding.js";

export const PROTOCOL_VERSION = 1;
const SEAL_VERSION = 1;
const PAD_BUCKET = 256;
// Fits the backend's 50 KB JSON body limit once padded, encrypted and base64'd.
export const MAX_PLAINTEXT_BYTES = 32 * 1024;
export const BACKUP_KDF = { name: "scrypt", N: 2 ** 15, r: 8, p: 1 };

// scrypt in pure JS is fine in browsers (~0.2 s) but takes many seconds under
// Hermes; the app plugs in its native scrypt here. Any standard scrypt gives
// the same bytes, so backups move freely between platforms.
let scrypt = (pw, salt, o) => scryptAsync(pw, salt, o);
/** fn(password: Uint8Array, salt: Uint8Array, { N, r, p, dkLen }) → Promise<Uint8Array> */
export function setScryptImplementation(fn) {
  scrypt = fn;
}

export class DmCryptoError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
const fail = (message, code) => {
  throw new DmCryptoError(message, code);
};

const hk = (ikm, salt, info, len = 32) => hkdf(sha256, ikm, salt, utf8(info), len);

// ─── Account keys ───────────────────────────────────────────────────────────

/** Fresh account keys for `version` (private + public, raw bytes). */
export function generateAccountKeys(version = 1) {
  const sign = ed25519.keygen();
  const box = x25519.keygen();
  return {
    version,
    signPriv: sign.secretKey,
    signPub: sign.publicKey,
    boxPriv: box.secretKey,
    boxPub: box.publicKey,
    createdAt: Date.now(),
  };
}

const bundleBytes = ({ uid, version, signPub, boxPub, createdAt }) =>
  utf8(`sysfi-dm-bundle:v${PROTOCOL_VERSION}|${uid}|${version}|${signPub}|${boxPub}|${createdAt}`);

/**
 * Public bundle for `keys`, self-signed; `prevKeys` (the version before)
 * countersigns so peers accept the rotation without a warning.
 */
export function makeBundle(uid, keys, prevKeys = null) {
  const b = {
    v: PROTOCOL_VERSION,
    uid,
    version: keys.version,
    signPub: b64(keys.signPub),
    boxPub: b64(keys.boxPub),
    createdAt: keys.createdAt,
  };
  const msg = bundleBytes(b);
  b.sig = b64(ed25519.sign(msg, keys.signPriv));
  if (prevKeys) b.prevSig = b64(ed25519.sign(msg, prevKeys.signPriv));
  return b;
}

/**
 * Checks a bundle's self-signature (and, given the previous bundle, the
 * continuity signature). Returns { valid, continuous }.
 */
export function verifyBundle(bundle, prevBundle = null) {
  try {
    if (!bundle || bundle.v !== PROTOCOL_VERSION) return { valid: false, continuous: false };
    const msg = bundleBytes(bundle);
    const valid = unb64(bundle.signPub).length === 32 && unb64(bundle.boxPub).length === 32 && ed25519.verify(unb64(bundle.sig), msg, unb64(bundle.signPub));
    let continuous = false;
    if (valid && prevBundle && bundle.prevSig && prevBundle.uid === bundle.uid && prevBundle.version < bundle.version) {
      continuous = ed25519.verify(unb64(bundle.prevSig), msg, unb64(prevBundle.signPub));
    }
    return { valid, continuous };
  } catch {
    return { valid: false, continuous: false };
  }
}

// ─── Key ring (all versions of a user's private keys) ───────────────────────

export function newKeyRing() {
  const k = generateAccountKeys(1);
  return { current: 1, versions: { 1: k } };
}

/** Adds a new version (rotation). Returns { ring, keys, prev }. */
export function rotateKeyRing(ring) {
  const prev = ring.versions[ring.current];
  const keys = generateAccountKeys(ring.current + 1);
  return { ring: { current: keys.version, versions: { ...ring.versions, [keys.version]: keys } }, keys, prev };
}

export const currentKeys = (ring) => ring.versions[ring.current];

export function exportKeyRing(ring) {
  const versions = {};
  for (const [v, k] of Object.entries(ring.versions)) {
    versions[v] = { version: k.version, createdAt: k.createdAt, signPriv: b64(k.signPriv), boxPriv: b64(k.boxPriv) };
  }
  return JSON.stringify({ v: PROTOCOL_VERSION, current: ring.current, versions });
}

export function importKeyRing(json) {
  const o = typeof json === "string" ? JSON.parse(json) : json;
  if (!o || o.v !== PROTOCOL_VERSION || !o.versions?.[o.current]) fail("Unrecognised key ring", "BAD_RING");
  const versions = {};
  for (const [v, k] of Object.entries(o.versions)) {
    const signPriv = unb64(k.signPriv);
    const boxPriv = unb64(k.boxPriv);
    versions[v] = {
      version: Number(k.version),
      createdAt: k.createdAt,
      signPriv,
      boxPriv,
      signPub: ed25519.getPublicKey(signPriv),
      boxPub: x25519.getPublicKey(boxPriv),
    };
  }
  return { current: Number(o.current), versions };
}

// ─── Sealed boxes (ECIES: X25519 → HKDF-SHA256 → XChaCha20-Poly1305) ─────────

/** Encrypts `plaintext` to an X25519 public key. `context` is bound as AD. */
export function seal(recipientBoxPub, plaintext, context) {
  const eph = x25519.keygen();
  const shared = x25519.getSharedSecret(eph.secretKey, recipientBoxPub);
  const key = hk(shared, concatBytes(eph.publicKey, recipientBoxPub), `sysfi-dm-seal:v${SEAL_VERSION}`);
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce, utf8(context)).encrypt(plaintext);
  return concatBytes(Uint8Array.of(SEAL_VERSION), eph.publicKey, nonce, ct);
}

export function openSealed(boxPriv, sealed, context) {
  if (sealed.length < 1 + 32 + 24 + 16 || sealed[0] !== SEAL_VERSION) fail("Unrecognised sealed box", "BAD_SEAL");
  const ephPub = sealed.subarray(1, 33);
  const nonce = sealed.subarray(33, 57);
  const ct = sealed.subarray(57);
  const shared = x25519.getSharedSecret(boxPriv, ephPub);
  const key = hk(shared, concatBytes(ephPub, x25519.getPublicKey(boxPriv)), `sysfi-dm-seal:v${SEAL_VERSION}`);
  try {
    return xchacha20poly1305(key, nonce, utf8(context)).decrypt(ct);
  } catch {
    return fail("Sealed box failed to open", "SEAL_AUTH");
  }
}

// ─── Conversation keys ──────────────────────────────────────────────────────

export const newConversationKey = () => randomBytes(32);

const ckContext = (conversationId, epoch, uid, keyVersion) => `sysfi-dm-ck:v${PROTOCOL_VERSION}|${conversationId}|${epoch}|${uid}|${keyVersion}`;

/** Envelope of `ck` for one participant (their verified bundle). */
export function sealConversationKey(ck, { conversationId, epoch }, bundle) {
  return {
    uid: bundle.uid,
    keyVersion: bundle.version,
    sealed: b64(seal(unb64(bundle.boxPub), ck, ckContext(conversationId, epoch, bundle.uid, bundle.version))),
  };
}

/** Opens this user's envelope with the matching key version from their ring. */
export function openConversationKey(ring, { conversationId, epoch }, uid, envelope) {
  const keys = ring.versions[envelope.keyVersion];
  if (!keys) fail(`No key version ${envelope.keyVersion} on this device — restore your keys`, "MISSING_KEY_VERSION");
  const ck = openSealed(keys.boxPriv, unb64(envelope.sealed), ckContext(conversationId, epoch, uid, envelope.keyVersion));
  if (ck.length !== 32) fail("Bad conversation key", "BAD_CK");
  return ck;
}

// ─── Messages ───────────────────────────────────────────────────────────────

const msgAd = ({ conversationId, epoch, senderId, senderKeyVersion, messageId }) =>
  utf8(`sysfi-dm-msg:v${PROTOCOL_VERSION}|${conversationId}|${epoch}|${senderId}|${senderKeyVersion}|${messageId}`);

function pad(bytes) {
  const total = Math.ceil((bytes.length + 4) / PAD_BUCKET) * PAD_BUCKET;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, bytes.length);
  out.set(bytes, 4);
  return out;
}

function unpad(bytes) {
  if (bytes.length < 4) fail("Bad padding", "BAD_PAD");
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (len > bytes.length - 4) fail("Bad padding", "BAD_PAD");
  return bytes.subarray(4, 4 + len);
}

/**
 * Encrypts and signs a payload object. `ids` = { conversationId, epoch,
 * senderId, senderKeyVersion, messageId } (the key version says which of the
 * sender's signing keys to verify with after they rotate). Returns { ct, sig }
 * (base64url) for the server.
 */
export function encryptMessage(ck, ids, payload, signPriv) {
  const plain = utf8(JSON.stringify({ ...payload, v: PROTOCOL_VERSION }));
  if (plain.length > MAX_PLAINTEXT_BYTES) fail("Message is too large", "TOO_LARGE");
  const ad = msgAd(ids);
  const nonce = randomBytes(24);
  const ct = concatBytes(nonce, xchacha20poly1305(ck, nonce, ad).encrypt(pad(plain)));
  const sig = ed25519.sign(concatBytes(ad, ct), signPriv);
  return { ct: b64(ct), sig: b64(sig) };
}

/** Verifies the sender's signature, then decrypts. Throws DmCryptoError. */
export function decryptMessage(ck, ids, { ct, sig }, senderSignPub) {
  const ad = msgAd(ids);
  const ctBytes = unb64(ct);
  let ok = false;
  try {
    ok = ed25519.verify(unb64(sig), concatBytes(ad, ctBytes), senderSignPub);
  } catch {}
  if (!ok) fail("Message signature is invalid", "BAD_SIG");
  if (ctBytes.length < 24 + 16) fail("Message is truncated", "BAD_CT");
  let plain;
  try {
    plain = xchacha20poly1305(ck, ctBytes.subarray(0, 24), ad).decrypt(ctBytes.subarray(24));
  } catch {
    return fail("Message failed to decrypt", "DECRYPT");
  }
  const payload = JSON.parse(fromUtf8(unpad(plain)));
  if (payload?.v !== PROTOCOL_VERSION) fail("Unsupported message version", "VERSION");
  return payload;
}

// ─── Attachments ────────────────────────────────────────────────────────────

const FILE_AD = utf8(`sysfi-dm-file:v${PROTOCOL_VERSION}`);

/**
 * Encrypts file bytes with a fresh key. Upload `data`; put the returned
 * `ref` (key, digest, size) inside the encrypted message payload.
 */
export function encryptAttachment(bytes) {
  const key = randomBytes(32);
  const nonce = randomBytes(24);
  const data = concatBytes(nonce, xchacha20poly1305(key, nonce, FILE_AD).encrypt(bytes));
  return { data, ref: { key: b64(key), sha256: b64(sha256(data)), size: bytes.length } };
}

/** Checks the digest (the server can't swap the file), then decrypts. */
export function decryptAttachment(data, ref) {
  if (!equalBytes(sha256(data), unb64(ref.sha256))) fail("Attachment does not match its digest", "FILE_DIGEST");
  try {
    return xchacha20poly1305(unb64(ref.key), data.subarray(0, 24), FILE_AD).decrypt(data.subarray(24));
  } catch {
    return fail("Attachment failed to decrypt", "FILE_DECRYPT");
  }
}

// ─── Safety numbers ─────────────────────────────────────────────────────────

function fingerprint(uid, signPubB64) {
  let h = concatBytes(utf8(`sysfi-dm-fp:v${PROTOCOL_VERSION}|${uid}|`), unb64(signPubB64));
  for (let i = 0; i < 1024; i++) h = sha512(concatBytes(h, unb64(signPubB64)));
  let digits = "";
  for (let i = 0; i < 6; i++) {
    const n = ((h[i * 5] * 2 ** 32 + ((h[i * 5 + 1] << 24) >>> 0) + (h[i * 5 + 2] << 16) + (h[i * 5 + 3] << 8) + h[i * 5 + 4]) % 100000);
    digits += String(n).padStart(5, "0");
  }
  return digits;
}

/**
 * 60-digit number both people see identically (order-independent). If it
 * matches on both phones, nobody is in the middle.
 */
export function safetyNumber(a, b) {
  const [x, y] = [a, b].sort((p, q) => (p.uid < q.uid ? -1 : 1));
  const all = fingerprint(x.uid, x.signPub) + fingerprint(y.uid, y.signPub);
  return all.match(/.{5}/g).join(" ");
}

// ─── PIN backup ─────────────────────────────────────────────────────────────

export const normalisePin = (pin) => String(pin ?? "").normalize("NFKC").trim();

/** PIN rules: 6+ characters; digits-only PINs need 6+ digits, no 111111/123456 runs. */
export function pinProblem(pin) {
  const p = normalisePin(pin);
  if (p.length < 6) return "Use at least 6 characters";
  if (/^(\d)\1+$/.test(p)) return "Avoid repeating the same digit";
  if ("01234567890".includes(p) || "09876543210".includes(p)) return "Avoid sequences like 123456";
  return null;
}

/** Slow step (scrypt): → { authKey, encPart }. Same inputs, same output, on every platform. */
export async function deriveBackupSecrets(pin, salt, kdf = BACKUP_KDF) {
  if (kdf.name !== "scrypt") fail(`Unsupported KDF ${kdf.name}`, "KDF");
  const stretched = await scrypt(utf8(normalisePin(pin)), salt, { N: kdf.N, r: kdf.r, p: kdf.p, dkLen: 64 });
  return {
    authKey: hk(stretched, salt, "sysfi-dm-backup-auth"),
    encPart: hk(stretched, salt, "sysfi-dm-backup-enc"),
  };
}

// ─── Wallet backup ──────────────────────────────────────────────────────────
// The default: no PIN. The backup secret comes from the user's wallet — a
// signature (EIP-191 personal_sign) by the account's primary address over a
// fixed message. Wallet signatures are deterministic (RFC 6979), so the same
// wallet gives the same secret on every device: restoring the wallet restores
// the messages (XMTP does the same). The secret is high-entropy, so there's
// no scrypt and no wrong-try budget; the server share and the account sign-in
// are still needed, so a leaked signature alone opens nothing. In-app
// signing bridges (dapp browser, mini-apps) refuse to sign this message.

export const WALLET_BACKUP_HEADER = "Sysfi encrypted messages";
export const WALLET_BACKUP_KDF_VERSION = 1;

/** The message the wallet signs. Fixed per account. */
export const walletBackupMessage = (uid) =>
  `${WALLET_BACKUP_HEADER}\n\nSign to unlock your message keys on this device. This is free and doesn't send a transaction.\n\nAccount: ${uid}\nVersion: ${WALLET_BACKUP_KDF_VERSION}`;

/** True for the backup message (and anything dressed up as it) — signing bridges refuse these. */
export const isWalletBackupMessage = (message) => {
  let text = message;
  if (typeof message === "string" && /^0x([0-9a-f]{2})*$/i.test(message)) {
    try {
      text = fromUtf8(Uint8Array.from(message.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16)));
    } catch {
      return false;
    }
  } else if (message instanceof Uint8Array) text = fromUtf8(message);
  return typeof text === "string" && text.includes(WALLET_BACKUP_HEADER);
};

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * Signature (65-byte 0x hex) → { authKey, encPart }. Only r and s count, with
 * s in low form, so wallets that differ in v (27/28 vs 0/1) or s form agree.
 */
export function deriveWalletBackupSecrets(signature, salt) {
  const hex = String(signature ?? "").replace(/^0x/i, "");
  if (!/^[0-9a-f]{130}$/i.test(hex)) fail("Unexpected wallet signature", "BAD_SIGNATURE");
  const r = BigInt(`0x${hex.slice(0, 64)}`);
  let s = BigInt(`0x${hex.slice(64, 128)}`);
  if (s > SECP256K1_N / 2n) s = SECP256K1_N - s;
  const num = (n) => Uint8Array.from(n.toString(16).padStart(64, "0").match(/../g), (h) => parseInt(h, 16));
  const ikm = concatBytes(num(r), num(s));
  return {
    authKey: hk(ikm, salt, "sysfi-dm-wallet-backup-auth"),
    encPart: hk(ikm, salt, "sysfi-dm-wallet-backup-enc"),
  };
}

const backupKey = (encPart, serverShare, salt) => hk(concatBytes(encPart, serverShare), salt, "sysfi-dm-backup-key");
const BACKUP_AD = utf8(`sysfi-dm-backup:v${PROTOCOL_VERSION}`);

export function sealBackup(ring, { encPart, serverShare, salt }) {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(backupKey(encPart, serverShare, salt), nonce, BACKUP_AD).encrypt(utf8(exportKeyRing(ring)));
  return b64(concatBytes(nonce, ct));
}

export function openBackup(blob, { encPart, serverShare, salt }) {
  const bytes = unb64(blob);
  try {
    const plain = xchacha20poly1305(backupKey(encPart, serverShare, salt), bytes.subarray(0, 24), BACKUP_AD).decrypt(bytes.subarray(24));
    return importKeyRing(fromUtf8(plain));
  } catch (e) {
    if (e instanceof DmCryptoError) throw e;
    return fail("Backup failed to decrypt", "BACKUP_DECRYPT");
  }
}

// ─── Device linking (QR) ────────────────────────────────────────────────────
// The new device shows a QR with its one-time public key; an existing device
// scans it and seals the key ring to that key. The QR carries the key itself,
// so the server relaying the sealed ring can't substitute its own.

const LINK_PREFIX = `sysfi-dm-link:${PROTOCOL_VERSION}:`;

export function newLinkKeys() {
  const k = x25519.keygen();
  return { priv: k.secretKey, pub: k.publicKey };
}

export const linkQrPayload = (linkId, pub) => `${LINK_PREFIX}${linkId}:${b64(pub)}`;

export function parseLinkQr(text) {
  if (typeof text !== "string" || !text.startsWith(LINK_PREFIX)) fail("Not a Sysfi device-link code", "BAD_QR");
  const [linkId, pub] = text.slice(LINK_PREFIX.length).split(":");
  const pubBytes = unb64(pub ?? "");
  if (!linkId || pubBytes.length !== 32) fail("Damaged device-link code", "BAD_QR");
  return { linkId, pub: pubBytes };
}

const linkContext = (linkId, uid) => `sysfi-dm-link:v${PROTOCOL_VERSION}|${linkId}|${uid}`;

export const sealRingForLink = (ring, { linkId, pub }, uid) => b64(seal(pub, utf8(exportKeyRing(ring)), linkContext(linkId, uid)));

export const openLinkedRing = (sealedB64, { linkId, priv }, uid) => importKeyRing(fromUtf8(openSealed(priv, unb64(sealedB64), linkContext(linkId, uid))));

/** 6-digit code both screens show during linking — a human check on top of the QR. */
export const linkCheckCode = (pub) => String(new DataView(sha256(pub).buffer).getUint32(0) % 1_000_000).padStart(6, "0");

// ─── Ids ────────────────────────────────────────────────────────────────────

/** Time-ordered random id (UUIDv7) for messages, so clients can name them before sending. */
export function messageId(now = Date.now()) {
  const r = randomBytes(16);
  const t = BigInt(now);
  for (let i = 0; i < 6; i++) r[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn);
  r[6] = (r[6] & 0x0f) | 0x70;
  r[8] = (r[8] & 0x3f) | 0x80;
  const h = Array.from(r, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export { b64, unb64, randomBytes };
