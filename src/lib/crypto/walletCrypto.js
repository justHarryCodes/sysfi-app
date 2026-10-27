// lib/crypto/walletCrypto.js
// Browser port of crypto-wallet/utils/Encryption.js. Payloads must stay
// byte-compatible with the mobile app in both directions — a wallet encrypted
// on the phone has to unlock here and vice versa — so the on-disk format is
// copied exactly:
//   V3: scrypt(N from payload, r=8, p=1, dkLen=32) → AES-256-GCM, 16-byte IV,
//       16-byte tag stored separately, wallet address as AAD, all hex.
//   V2: PBKDF2-SHA256 (210k) → AES-256-GCM, no AAD. Decrypt-only.
//   V1: CryptoJS passphrase-mode AES. Decrypt-only.
// react-native-quick-crypto mirrors node:crypto, whose GCM keeps the tag
// apart from the ciphertext; WebCrypto appends it, hence the split/concat.
// scripts/verify-wallet-crypto.mjs checks this against node:crypto.
import { scryptAsync } from "@noble/hashes/scrypt.js";
import CryptoJS from "crypto-js";

export const ENCRYPTION_VERSION = { V1: 1, V2: 2, V3: 3 };
const CURRENT_VERSION = ENCRYPTION_VERSION.V3;

export const SCRYPT_N_LOCAL = 65536;
export const SCRYPT_N_CLOUD = 131072;

const V3 = { KEY_LENGTH: 32, SALT_LENGTH: 16, IV_LENGTH: 16, TAG_LENGTH: 16, R: 8, P: 1 };
const V2 = { ITERATIONS: 210000, KEY_LENGTH: 32, TAG_LENGTH: 16 };
const V1_ITERATIONS = 10000; // APP_CONFIG.ENCRYPTION_ITERATIONS

const subtle = () => globalThis.crypto.subtle;
const utf8 = new TextEncoder();
const utf8Decode = new TextDecoder("utf-8", { fatal: true });

// ─── Byte helpers ─────────────────────────────────────────────────────────────

export const toHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

export const fromHex = (hex) => {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error("Invalid hex payload");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

const importAesKey = (raw, usages) =>
  subtle().importKey("raw", raw, { name: "AES-GCM" }, false, usages);

// ─── V3 (scrypt + AES-256-GCM + AAD) ─────────────────────────────────────────

const deriveV3Key = (password, salt, N) =>
  // asyncTick keeps the tab responsive during the ~1–3s CLOUD-profile derive.
  scryptAsync(utf8.encode(password), salt, {
    N,
    r: V3.R,
    p: V3.P,
    dkLen: V3.KEY_LENGTH,
    maxmem: 256 * 1024 * 1024,
    asyncTick: 10,
  });

const encryptV3 = async (plaintext, password, aad, N) => {
  const salt = randomBytes(V3.SALT_LENGTH);
  const iv = randomBytes(V3.IV_LENGTH);
  const key = await importAesKey(await deriveV3Key(password, salt, N), ["encrypt"]);

  const params = { name: "AES-GCM", iv, tagLength: V3.TAG_LENGTH * 8 };
  if (aad) params.additionalData = utf8.encode(String(aad));

  const sealed = new Uint8Array(await subtle().encrypt(params, key, utf8.encode(plaintext)));
  const cut = sealed.length - V3.TAG_LENGTH;

  return {
    encrypted: toHex(sealed.slice(0, cut)),
    salt: toHex(salt),
    iv: toHex(iv),
    authTag: toHex(sealed.slice(cut)),
    version: ENCRYPTION_VERSION.V3,
    scryptN: N,
  };
};

const decryptGcm = async (rawKey, { encrypted, iv, authTag }, aad) => {
  const key = await importAesKey(rawKey, ["decrypt"]);
  const params = { name: "AES-GCM", iv: fromHex(iv), tagLength: 128 };
  if (aad) params.additionalData = utf8.encode(String(aad));
  const plain = await subtle().decrypt(params, key, concat(fromHex(encrypted), fromHex(authTag)));
  return utf8Decode.decode(plain);
};

const decryptV3 = async (payload, password, aad, N) =>
  decryptGcm(await deriveV3Key(password, fromHex(payload.salt), N), payload, aad);

// ─── V2 (PBKDF2-SHA256 + AES-256-GCM), decrypt-only ──────────────────────────

const decryptV2 = async (payload, password) => {
  const base = await subtle().importKey("raw", utf8.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle().deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(payload.salt), iterations: V2.ITERATIONS },
    base,
    V2.KEY_LENGTH * 8,
  );
  return decryptGcm(new Uint8Array(bits), payload, null);
};

// ─── V1 (CryptoJS), decrypt-only ─────────────────────────────────────────────

const decryptV1 = (encrypted, password, salt) => {
  const key = CryptoJS.PBKDF2(password, salt, { keySize: 256 / 32, iterations: V1_ITERATIONS }).toString();
  const out = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8);
  if (!out) throw new Error("Invalid password or corrupted data");
  return out;
};

// ─── Public API (same names/semantics as the app) ────────────────────────────

/** Encrypts wallet JSON as V3. `aad` is the wallet address. */
export const encryptWallet = async (walletData, password, aad = null, scryptN = SCRYPT_N_LOCAL) =>
  encryptV3(JSON.stringify(walletData), password, aad, scryptN);

/**
 * Decrypts a stored payload (Firestore `wallets/{uid}` doc shape). V1/V2
 * payloads never had AAD applied, so the address is only bound for V3.
 * Returns { walletData, needsMigration, migratedEncryption? } like the app.
 */
export const unlockWallet = async (stored, password, migrationScryptN = SCRYPT_N_LOCAL) => {
  const { encrypted, salt, version, scryptN, address } = stored;
  const v = version || ENCRYPTION_VERSION.V1;

  let plaintext;
  try {
    if (v === ENCRYPTION_VERSION.V3) {
      plaintext = await decryptV3(stored, password, address, scryptN || SCRYPT_N_LOCAL);
    } else if (v === ENCRYPTION_VERSION.V2) {
      plaintext = await decryptV2(stored, password);
    } else if (v === ENCRYPTION_VERSION.V1) {
      plaintext = decryptV1(encrypted, password, salt);
    } else {
      throw new Error(`Unsupported encryption version: ${v}`);
    }
  } catch {
    throw new Error("Failed to unlock wallet - invalid password");
  }

  const walletData = JSON.parse(plaintext);
  if (v >= CURRENT_VERSION) return { walletData, needsMigration: false };

  const migratedEncryption = await encryptWallet(walletData, password, address, migrationScryptN);
  return { walletData, needsMigration: true, migratedEncryption };
};
