// lib/googleVault.js + lib/googleDrive.js — the passwordless Google backup.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { sealVault, openVault, toB64, fromB64, googleSubOf } from "@/lib/googleVault";
import { readVaultFile, writeVaultFile, VAULT_FILE } from "@/lib/googleDrive";

const kek = toB64(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const otherKek = toB64(Uint8Array.from({ length: 32 }, (_, i) => 200 - i));
const walletData = { mnemonic: "test test test test test test test test test test test junk", privateKey: "0xabc", publicKey: "0xdef", createdAt: "2026-10-27T00:00:00Z" };
const base = { uid: "uid-1", googleSub: "1098765", address: "0xAbC0000000000000000000000000000000000001", kek };

test("base64 helpers round-trip arbitrary bytes", () => {
  for (const len of [0, 1, 2, 3, 31, 32, 33, 100]) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) & 255);
    assert.deepEqual(fromB64(toB64(bytes)), bytes);
    assert.equal(toB64(bytes), Buffer.from(bytes).toString("base64"));
  }
});

test("seal → open returns the wallet; nothing readable is stored", () => {
  const v = sealVault({ walletData, ...base });
  assert.deepEqual(openVault({ firestore: v.firestore, drive: v.drive, ...base }), walletData);
  const stored = JSON.stringify(v);
  assert.ok(!stored.includes("junk") && !stored.includes("0xabc"), "no plaintext in either half");
  assert.equal(v.drive.uid, "uid-1");
  assert.equal(v.firestore.googleSub, "1098765");
});

test("each seal uses fresh keys and nonces", () => {
  const a = sealVault({ walletData, ...base });
  const b = sealVault({ walletData, ...base });
  assert.notEqual(a.firestore.wallet.data, b.firestore.wallet.data);
  assert.notEqual(a.drive.share.data, b.drive.share.data);
  assert.notEqual(a.firestore.share.iv, b.firestore.share.iv);
});

test("both halves are required, and they must be from the same backup", () => {
  const a = sealVault({ walletData, ...base });
  const b = sealVault({ walletData, ...base });
  assert.throws(() => openVault({ firestore: a.firestore, drive: null, ...base }), { code: "VAULT_DRIVE_MISSING" });
  assert.throws(() => openVault({ firestore: null, drive: a.drive, ...base }), { code: "VAULT_MISSING" });
  assert.throws(() => openVault({ firestore: a.firestore, drive: b.drive, ...base }), { code: "VAULT_TAMPERED" }, "Drive half from another backup");
});

test("the server key is required", () => {
  const v = sealVault({ walletData, ...base });
  assert.throws(() => openVault({ ...v, ...base, firestore: v.firestore, drive: v.drive, kek: otherKek }), { code: "VAULT_TAMPERED" });
  assert.throws(() => openVault({ firestore: v.firestore, drive: v.drive, ...base, kek: toB64(new Uint8Array(5)) }), { code: "BAD_KEK" });
});

test("bound to the account, the Google account and the address", () => {
  const v = sealVault({ walletData, ...base });
  assert.throws(() => openVault({ ...v, ...base, firestore: v.firestore, drive: v.drive, uid: "uid-2" }), { code: "VAULT_WRONG_ACCOUNT" });
  assert.throws(() => openVault({ ...v, ...base, firestore: v.firestore, drive: v.drive, googleSub: "999" }), { code: "VAULT_WRONG_ACCOUNT" });
  // Edit the stored ids so they match a different account: the ciphertexts still refuse.
  const forged = { firestore: { ...v.firestore, googleSub: "999" }, drive: { ...v.drive, googleSub: "999" } };
  assert.throws(() => openVault({ ...forged, ...base, googleSub: "999" }), { code: "VAULT_TAMPERED" });
  const moved = { firestore: { ...v.firestore, address: "0x0000000000000000000000000000000000000002" }, drive: { ...v.drive, address: "0x0000000000000000000000000000000000000002" } };
  assert.throws(() => openVault({ ...moved, ...base }), { code: "VAULT_TAMPERED" });
});

test("tampering with any ciphertext is detected", () => {
  const v = sealVault({ walletData, ...base });
  const flip = (box) => {
    const bytes = fromB64(box.data);
    bytes[0] ^= 1;
    return { ...box, data: toB64(bytes) };
  };
  assert.throws(() => openVault({ firestore: { ...v.firestore, wallet: flip(v.firestore.wallet) }, drive: v.drive, ...base }), { code: "VAULT_TAMPERED" });
  assert.throws(() => openVault({ firestore: { ...v.firestore, share: flip(v.firestore.share) }, drive: v.drive, ...base }), { code: "VAULT_TAMPERED" });
  assert.throws(() => openVault({ firestore: v.firestore, drive: { ...v.drive, share: flip(v.drive.share) }, ...base }), { code: "VAULT_TAMPERED" });
});

test("googleSubOf reads the Google provider's id", () => {
  assert.equal(googleSubOf({ providerData: [{ providerId: "password", uid: "a@b.c" }, { providerId: "google.com", uid: "1234" }] }), "1234");
  assert.equal(googleSubOf({ providerData: [{ providerId: "password", uid: "a@b.c" }] }), null);
});

// ─── Drive appDataFolder client (fake Drive API) ─────────────────────────────
const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

function fakeDrive() {
  const files = new Map();
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(`${init.method ?? "GET"} ${u.pathname}`);
    assert.equal(init.headers.Authorization, "Bearer tok");
    const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
    if (u.pathname === "/drive/v3/files" && (init.method ?? "GET") === "GET") {
      assert.equal(u.searchParams.get("spaces"), "appDataFolder");
      return json({ files: [...files.keys()].map((id) => ({ id })) });
    }
    if (u.pathname.startsWith("/drive/v3/files/") && u.searchParams.get("alt") === "media") return json(files.get(u.pathname.split("/").pop()));
    if (u.pathname === "/upload/drive/v3/files" && init.method === "POST") {
      assert.match(init.body, /"parents":\["appDataFolder"\]/);
      assert.match(init.body, new RegExp(VAULT_FILE.replace(".", "\\.")));
      const content = JSON.parse(init.body.split("\r\n\r\n")[2].split("\r\n--")[0]);
      files.set("f1", content);
      return json({ id: "f1" });
    }
    if (u.pathname.startsWith("/upload/drive/v3/files/") && init.method === "PATCH") {
      files.set(u.pathname.split("/").pop(), JSON.parse(init.body));
      return json({ id: "f1" });
    }
    return json({ error: "unexpected" }, 500);
  };
  return { files, calls };
}

test("Drive: create, read back, then update in place", async () => {
  const drive = fakeDrive();
  assert.equal(await readVaultFile("tok"), null);
  assert.equal(await writeVaultFile("tok", { v: 1, n: 1 }), "f1");
  assert.deepEqual(await readVaultFile("tok"), { v: 1, n: 1 });
  await writeVaultFile("tok", { v: 1, n: 2 });
  assert.deepEqual(await readVaultFile("tok"), { v: 1, n: 2 });
  assert.equal(drive.files.size, 1, "one file, replaced — not duplicated");
});

test("Drive: expired token and missing scope are told apart", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 401 });
  await assert.rejects(readVaultFile("tok"), { code: "GOOGLE_TOKEN_EXPIRED" });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { errors: [{ reason: "insufficientPermissions" }] } }), { status: 403 });
  await assert.rejects(readVaultFile("tok"), { code: "DRIVE_SCOPE_MISSING" });
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(readVaultFile("tok"), { code: "DRIVE_NETWORK" });
});

// ─── Backup / restore orchestration ──────────────────────────────────────────
import { backupToGoogle, restoreFromGoogle } from "@/lib/googleBackup";

const DELETE = Symbol("deleteField");
function fakeFirestore() {
  const doc = {};
  return {
    doc,
    // setDoc(…, { merge: true }): plain objects merge deeply, deleteField removes.
    saveWalletFields: async (fields) => {
      const merge = (target, src) => {
        for (const [k, v] of Object.entries(src)) {
          if (v === DELETE) delete target[k];
          else if (v && typeof v === "object" && !Array.isArray(v) && !("backupId" in v)) merge((target[k] ??= {}), v);
          else target[k] = v;
        }
      };
      merge(doc, fields);
    },
  };
}
const googleUser = { uid: "uid-1", providerData: [{ providerId: "google.com", uid: "1098765" }] };

test("backup then restore through Firestore + Drive", async () => {
  fakeDrive();
  const fs = fakeFirestore();
  const r = await backupToGoogle({ walletData, address: base.address, user: googleUser, accessToken: "tok", fetchKek: async () => kek, walletDoc: fs.doc, saveWalletFields: fs.saveWalletFields, deleteField: () => DELETE });
  assert.ok(fs.doc.googleVault && !Object.keys(fs.doc.googleVaults ?? {}).length, "committed, staging cleared");
  assert.equal(fs.doc.googleVault.backupId, r.backupId);
  assert.deepEqual((await restoreFromGoogle({ walletDoc: fs.doc, user: googleUser, accessToken: "tok", fetchKek: async () => kek })).walletData, walletData);
});

test("a crash between the writes never strands the wallet", async () => {
  const drive = fakeDrive();
  const fs = fakeFirestore();
  const args = { walletData, address: base.address, user: googleUser, accessToken: "tok", fetchKek: async () => kek, walletDoc: fs.doc, saveWalletFields: fs.saveWalletFields, deleteField: () => DELETE };
  await backupToGoogle(args);

  // Crash after the Drive write, before promotion: restore uses the pending half.
  let n = 0;
  const crashOnPromote = async (fields) => {
    if (++n === 2) throw new Error("network");
    return fs.saveWalletFields(fields);
  };
  await assert.rejects(backupToGoogle({ ...args, saveWalletFields: crashOnPromote }));
  assert.ok(fs.doc.googleVault.backupId !== drive.files.get("f1").backupId, "Drive moved on, committed record didn't");
  assert.deepEqual((await restoreFromGoogle({ walletDoc: fs.doc, user: googleUser, accessToken: "tok", fetchKek: async () => kek })).walletData, walletData);

  // A second backup then fails at the Drive write: the Drive file still holds
  // the interrupted backup's half, and its Firestore half is still there.
  const driveHalf = drive.files.get("f1");
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  await assert.rejects(backupToGoogle(args));
  fakeDrive().files.set("f1", driveHalf);
  assert.deepEqual((await restoreFromGoogle({ walletDoc: fs.doc, user: googleUser, accessToken: "tok", fetchKek: async () => kek })).walletData, walletData);
});

test("restore explains what's missing", async () => {
  fakeDrive();
  await assert.rejects(restoreFromGoogle({ walletDoc: {}, user: googleUser, accessToken: "tok", fetchKek: async () => kek }), { code: "VAULT_MISSING" });
  await assert.rejects(restoreFromGoogle({ walletDoc: { googleVault: { backupId: "x" } }, user: googleUser, accessToken: "tok", fetchKek: async () => kek }), { code: "VAULT_DRIVE_MISSING" });
  await assert.rejects(restoreFromGoogle({ walletDoc: { googleVault: { backupId: "x" } }, user: { uid: "u", providerData: [] }, accessToken: "tok", fetchKek: async () => kek }), { code: "GOOGLE_NOT_LINKED" });
});

test("restore can use a Drive half cached on the device (no Drive call)", async () => {
  fakeDrive();
  const fs = fakeFirestore();
  const { driveHalf } = await backupToGoogle({ walletData, address: base.address, user: googleUser, accessToken: "tok", fetchKek: async () => kek, walletDoc: fs.doc, saveWalletFields: fs.saveWalletFields, deleteField: () => DELETE });
  globalThis.fetch = async () => { throw new Error("Drive must not be called"); };
  const r = await restoreFromGoogle({ walletDoc: fs.doc, user: googleUser, driveHalf, fetchKek: async () => kek });
  assert.deepEqual(r.walletData, walletData);
});

test("non-ASCII wallet names and data survive the round trip", () => {
  const data = { ...walletData, name: "Wallet — ñandú 🦊 日本" };
  const v = sealVault({ walletData: data, ...base });
  assert.deepEqual(openVault({ firestore: v.firestore, drive: v.drive, ...base }), data);
});
