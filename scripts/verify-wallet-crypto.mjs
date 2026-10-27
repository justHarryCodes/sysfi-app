// Cross-checks src/lib/crypto/walletCrypto.js against node:crypto, which is
// the API react-native-quick-crypto mirrors in crypto-wallet/utils/Encryption.js.
// Run: node scripts/verify-wallet-crypto.mjs
import assert from "node:assert/strict";
import { scryptSync, pbkdf2Sync, createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import CryptoJS from "crypto-js";
import { encryptWallet, unlockWallet, SCRYPT_N_LOCAL, SCRYPT_N_CLOUD } from "../src/lib/crypto/walletCrypto.js";

const walletData = {
  mnemonic: "test test test test test test test test test test test junk",
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  publicKey: "0x04deadbeef",
  createdAt: "2026-10-19T00:00:00.000Z",
};
const address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const password = "Correct-Horse-9 ✓ ünïcode";

// ── App-side V3 encrypt, copied from Encryption.js's V3_Crypto.encrypt ──────
function appEncryptV3(data, pw, aad, N) {
  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const key = scryptSync(pw, salt, 32, { N, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(String(aad), "utf8"));
  const enc = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(data), "utf8")), cipher.final()]);
  return {
    encrypted: enc.toString("hex"), salt: salt.toString("hex"), iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"), version: 3, scryptN: N,
  };
}

// ── App-side V3 decrypt, copied from V3_Crypto.decrypt ───────────────────────
function appDecryptV3(p, pw, aad) {
  const key = scryptSync(pw, Buffer.from(p.salt, "hex"), 32, { N: p.scryptN, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(p.iv, "hex"));
  if (aad) d.setAAD(Buffer.from(String(aad), "utf8"));
  d.setAuthTag(Buffer.from(p.authTag, "hex"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(p.encrypted, "hex")), d.final()]).toString("utf8"));
}

// ── App-side V2 encrypt (PBKDF2), mirrors V2_CONFIG ─────────────────────────
function appEncryptV2(data, pw) {
  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const key = pbkdf2Sync(pw, salt, 210000, 32, "sha256");
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(Buffer.from(JSON.stringify(data), "utf8")), c.final()]);
  return {
    encrypted: enc.toString("hex"), salt: salt.toString("hex"), iv: iv.toString("hex"),
    authTag: c.getAuthTag().toString("hex"), version: 2,
  };
}

// ── App-side V1 (CryptoJS) ───────────────────────────────────────────────────
function appEncryptV1(data, pw) {
  const salt = randomBytes(32).toString("hex");
  const key = CryptoJS.PBKDF2(pw, salt, { keySize: 8, iterations: 10000 }).toString();
  return { encrypted: CryptoJS.AES.encrypt(JSON.stringify(data), key).toString(), salt };
}

const run = async (name, fn) => {
  const t = Date.now();
  await fn();
  console.log(`✓ ${name} (${Date.now() - t}ms)`);
};

await run("app V3 (cloud N) → web unlock", async () => {
  const p = { ...appEncryptV3(walletData, password, address, SCRYPT_N_CLOUD), address };
  const r = await unlockWallet(p, password, SCRYPT_N_CLOUD);
  assert.deepEqual(r.walletData, walletData);
  assert.equal(r.needsMigration, false);
});

await run("web V3 → app decrypt", async () => {
  const p = await encryptWallet(walletData, password, address, SCRYPT_N_LOCAL);
  assert.deepEqual(appDecryptV3(p, password, address), walletData);
});

await run("wrong password rejected", async () => {
  const p = { ...appEncryptV3(walletData, password, address, SCRYPT_N_LOCAL), address };
  await assert.rejects(unlockWallet(p, "wrong-password"), /invalid password/);
});

await run("swapped address (AAD) rejected", async () => {
  const p = { ...appEncryptV3(walletData, password, address, SCRYPT_N_LOCAL), address: "0x0000000000000000000000000000000000000001" };
  await assert.rejects(unlockWallet(p, password), /invalid password/);
});

await run("app V2 → web unlock + migrate to V3", async () => {
  const p = { ...appEncryptV2(walletData, password), address };
  const r = await unlockWallet(p, password, SCRYPT_N_CLOUD);
  assert.deepEqual(r.walletData, walletData);
  assert.equal(r.needsMigration, true);
  assert.equal(r.migratedEncryption.version, 3);
  assert.equal(r.migratedEncryption.scryptN, SCRYPT_N_CLOUD);
  assert.deepEqual(appDecryptV3(r.migratedEncryption, password, address), walletData);
});

await run("app V1 (legacy, no version) → web unlock", async () => {
  const p = { ...appEncryptV1(walletData, password), address };
  const r = await unlockWallet(p, password, SCRYPT_N_CLOUD);
  assert.deepEqual(r.walletData, walletData);
  assert.equal(r.needsMigration, true);
});

console.log("All wallet-crypto compatibility checks passed.");
