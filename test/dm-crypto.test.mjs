// DM end-to-end crypto: round trips, and every tampering the protocol must
// refuse (wrong conversation, wrong sender, forged signature, swapped key,
// swapped file, wrong PIN, server-substituted bundle).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/lib/dm/crypto.js";
import { b64, unb64, utf8, fromUtf8 } from "../src/lib/dm/encoding.js";

const code = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.code ?? e.message;
  }
  return "no error";
};

test("base64url round-trips every length and accepts standard base64", () => {
  for (let n = 0; n < 70; n++) {
    const bytes = C.randomBytes(n);
    assert.deepEqual(unb64(b64(bytes)), bytes);
  }
  assert.deepEqual(unb64("+/8="), Uint8Array.of(0xfb, 0xff));
  assert.equal(fromUtf8(utf8("héllo 👋")), "héllo 👋");
  assert.throws(() => unb64("a"));
  assert.throws(() => unb64("ab!d"));
});

test("pure-JS UTF-8 fallback matches the native codec (for runtimes without TextDecoder)", async () => {
  const { utf8Js, fromUtf8Js } = await import("../src/lib/dm/encoding.js");
  const samples = ["", "gm", "héllo", "日本語", "👋🏽 family 👨‍👩‍👧", "\u0000\u007f\u0080߿ࠀ￿", "a".repeat(1000), "lone \ud800 surrogate"];
  for (const s of samples) {
    assert.deepEqual(utf8Js(s), new TextEncoder().encode(s), JSON.stringify(s));
    assert.equal(fromUtf8Js(new TextEncoder().encode(s)), new TextDecoder().decode(new TextEncoder().encode(s)));
  }
  for (const bad of [[0xc0, 0x80], [0xe0, 0x80, 0x80], [0xed, 0xa0, 0x80], [0xf8], [0xe2, 0x82], [0x80]]) {
    assert.throws(() => fromUtf8Js(Uint8Array.from(bad)), /Invalid UTF-8/, String(bad));
  }
});

test("bundles: self-signature, continuity across rotation, forgery detected", () => {
  const ring = C.newKeyRing();
  const b1 = C.makeBundle("alice", C.currentKeys(ring));
  assert.deepEqual(C.verifyBundle(b1), { valid: true, continuous: false });

  const { ring: ring2, keys, prev } = C.rotateKeyRing(ring);
  const b2 = C.makeBundle("alice", keys, prev);
  assert.deepEqual(C.verifyBundle(b2, b1), { valid: true, continuous: true });

  // A server substituting its own keys can self-sign but not continue the chain.
  const evil = C.makeBundle("alice", C.generateAccountKeys(2));
  assert.deepEqual(C.verifyBundle(evil, b1), { valid: true, continuous: false });

  // Any edit to a signed field breaks it.
  assert.equal(C.verifyBundle({ ...b2, boxPub: evil.boxPub }).valid, false);
  assert.equal(C.verifyBundle({ ...b2, uid: "mallory" }).valid, false);
  assert.equal(C.verifyBundle(null).valid, false);
  assert.equal(ring2.current, 2);
});

test("key ring export/import keeps every version", () => {
  let { ring } = C.rotateKeyRing(C.newKeyRing());
  ring = C.rotateKeyRing(ring).ring;
  const back = C.importKeyRing(C.exportKeyRing(ring));
  assert.equal(back.current, 3);
  for (const v of [1, 2, 3]) {
    assert.deepEqual(back.versions[v].signPub, ring.versions[v].signPub);
    assert.deepEqual(back.versions[v].boxPub, ring.versions[v].boxPub);
  }
  assert.equal(code(() => C.importKeyRing("{}")), "BAD_RING");
});

test("conversation keys: only the addressed user + context opens an envelope", () => {
  const alice = C.newKeyRing();
  const bob = C.newKeyRing();
  const bobBundle = C.makeBundle("bob", C.currentKeys(bob));
  const ck = C.newConversationKey();
  const at = { conversationId: "c1", epoch: 1 };
  const env = C.sealConversationKey(ck, at, bobBundle);

  assert.deepEqual(C.openConversationKey(bob, at, "bob", env), ck);
  assert.equal(code(() => C.openConversationKey(alice, at, "bob", env)), "SEAL_AUTH");
  assert.equal(code(() => C.openConversationKey(bob, { conversationId: "c2", epoch: 1 }, "bob", env)), "SEAL_AUTH");
  assert.equal(code(() => C.openConversationKey(bob, { conversationId: "c1", epoch: 2 }, "bob", env)), "SEAL_AUTH");
  assert.equal(code(() => C.openConversationKey(bob, at, "bob", { ...env, keyVersion: 9 })), "MISSING_KEY_VERSION");
});

test("old epochs stay readable after a key rotation", () => {
  const bob = C.newKeyRing();
  const ck = C.newConversationKey();
  const at = { conversationId: "c1", epoch: 1 };
  const env = C.sealConversationKey(ck, at, C.makeBundle("bob", C.currentKeys(bob)));
  const { ring: rotated } = C.rotateKeyRing(bob);
  assert.deepEqual(C.openConversationKey(rotated, at, "bob", env), ck);
});

test("messages: round trip, padding, and every swap is refused", () => {
  const alice = C.currentKeys(C.newKeyRing());
  const mallory = C.currentKeys(C.newKeyRing());
  const ck = C.newConversationKey();
  const ids = { conversationId: "c1", epoch: 1, senderId: "alice", senderKeyVersion: 1, messageId: C.messageId() };
  const payload = { kind: "text", text: "gm 🌅", replyTo: null };
  const wire = C.encryptMessage(ck, ids, payload, alice.signPriv);

  assert.deepEqual(C.decryptMessage(ck, ids, wire, alice.signPub), { ...payload, v: 1 });

  // Length hidden in 256-byte buckets (+24 nonce +16 tag).
  const short = unb64(C.encryptMessage(ck, ids, { kind: "text", text: "a" }, alice.signPriv).ct).length;
  const longer = unb64(C.encryptMessage(ck, ids, { kind: "text", text: "a".repeat(150) }, alice.signPriv).ct).length;
  assert.equal(short, 256 + 40);
  assert.equal(short, longer);

  assert.equal(code(() => C.decryptMessage(ck, { ...ids, conversationId: "c2" }, wire, alice.signPub)), "BAD_SIG");
  assert.equal(code(() => C.decryptMessage(ck, { ...ids, senderId: "mallory" }, wire, alice.signPub)), "BAD_SIG");
  assert.equal(code(() => C.decryptMessage(ck, { ...ids, messageId: C.messageId() }, wire, alice.signPub)), "BAD_SIG");
  assert.equal(code(() => C.decryptMessage(ck, { ...ids, senderKeyVersion: 2 }, wire, alice.signPub)), "BAD_SIG");
  assert.equal(code(() => C.decryptMessage(ck, ids, wire, mallory.signPub)), "BAD_SIG");

  // A participant holding the CK can encrypt, but can't sign as someone else.
  const forged = C.encryptMessage(ck, ids, { kind: "text", text: "send me your seed" }, mallory.signPriv);
  assert.equal(code(() => C.decryptMessage(ck, ids, forged, alice.signPub)), "BAD_SIG");

  // Wrong key with a valid signature still fails to decrypt.
  assert.equal(code(() => C.decryptMessage(C.newConversationKey(), ids, wire, alice.signPub)), "DECRYPT");

  // Bit-flip in ciphertext.
  const bytes = unb64(wire.ct);
  bytes[40] ^= 1;
  assert.equal(code(() => C.decryptMessage(ck, ids, { ...wire, ct: b64(bytes) }, alice.signPub)), "BAD_SIG");

  assert.equal(code(() => C.encryptMessage(ck, ids, { text: "x".repeat(C.MAX_PLAINTEXT_BYTES) }, alice.signPriv)), "TOO_LARGE");
});

test("attachments: digest pins the file, key opens it", () => {
  const file = C.randomBytes(5000);
  const { data, ref } = C.encryptAttachment(file);
  assert.deepEqual(C.decryptAttachment(data, ref), file);
  const other = C.encryptAttachment(C.randomBytes(5000));
  assert.equal(code(() => C.decryptAttachment(other.data, ref)), "FILE_DIGEST");
  assert.equal(code(() => C.decryptAttachment(data, { ...ref, key: other.ref.key })), "FILE_DECRYPT");
});

test("safety numbers: same on both sides, change with the key", () => {
  const a = C.makeBundle("alice", C.currentKeys(C.newKeyRing()));
  const b = C.makeBundle("bob", C.currentKeys(C.newKeyRing()));
  const n = C.safetyNumber(a, b);
  assert.match(n, /^(\d{5} ){11}\d{5}$/);
  assert.equal(C.safetyNumber(b, a), n);
  const b2 = C.makeBundle("bob", C.currentKeys(C.newKeyRing()));
  assert.notEqual(C.safetyNumber(a, b2), n);
});

test("PIN rules", () => {
  assert.equal(C.pinProblem("12345"), "Use at least 6 characters");
  assert.equal(C.pinProblem("111111"), "Avoid repeating the same digit");
  assert.equal(C.pinProblem("123456"), "Avoid sequences like 123456");
  assert.equal(C.pinProblem("654321"), "Avoid sequences like 123456");
  assert.equal(C.pinProblem("482915"), null);
  assert.equal(C.pinProblem("  correct horse  "), null);
});

test("PIN backup: right PIN + server share opens, anything else doesn't", async () => {
  const fast = { name: "scrypt", N: 2 ** 10, r: 8, p: 1 };
  const ring = C.rotateKeyRing(C.newKeyRing()).ring;
  const salt = C.randomBytes(16);
  const serverShare = C.randomBytes(32);
  const s = await C.deriveBackupSecrets("482915", salt, fast);
  const blob = C.sealBackup(ring, { encPart: s.encPart, serverShare, salt });

  const again = await C.deriveBackupSecrets(" 482915 ", salt, fast); // normalised
  assert.deepEqual(again.authKey, s.authKey);
  const back = C.openBackup(blob, { encPart: again.encPart, serverShare, salt });
  assert.deepEqual(back.versions[2].boxPub, ring.versions[2].boxPub);

  const wrong = await C.deriveBackupSecrets("482916", salt, fast);
  assert.notDeepEqual(wrong.authKey, s.authKey);
  assert.equal(code(() => C.openBackup(blob, { encPart: wrong.encPart, serverShare, salt })), "BACKUP_DECRYPT");
  // The PIN alone isn't enough without the server's share.
  assert.equal(code(() => C.openBackup(blob, { encPart: s.encPart, serverShare: C.randomBytes(32), salt })), "BACKUP_DECRYPT");
  // authKey and encPart are independent (seeing one says nothing usable about the other).
  assert.notDeepEqual(s.authKey, s.encPart);
});

test("device linking: QR round trip, ring transfer, wrong device refused", () => {
  const ring = C.newKeyRing();
  const fresh = C.newLinkKeys();
  const qr = C.linkQrPayload("link-1", fresh.pub);
  const parsed = C.parseLinkQr(qr);
  assert.equal(parsed.linkId, "link-1");
  assert.equal(C.linkCheckCode(parsed.pub), C.linkCheckCode(fresh.pub));
  assert.match(C.linkCheckCode(fresh.pub), /^\d{6}$/);

  const sealed = C.sealRingForLink(ring, parsed, "alice");
  const got = C.openLinkedRing(sealed, { linkId: "link-1", priv: fresh.priv }, "alice");
  assert.deepEqual(got.versions[1].signPub, ring.versions[1].signPub);

  const attacker = C.newLinkKeys();
  assert.equal(code(() => C.openLinkedRing(sealed, { linkId: "link-1", priv: attacker.priv }, "alice")), "SEAL_AUTH");
  assert.equal(code(() => C.openLinkedRing(sealed, { linkId: "link-2", priv: fresh.priv }, "alice")), "SEAL_AUTH");
  assert.equal(code(() => C.parseLinkQr("https://evil.example")), "BAD_QR");
});

test("message ids are time-ordered UUIDv7", () => {
  const a = C.messageId(1_700_000_000_000);
  const b = C.messageId(1_700_000_000_001);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.ok(a < b);
});
