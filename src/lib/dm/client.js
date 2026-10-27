// lib/dm/client.js — the device side of end-to-end encrypted direct messages.
// Shared by the web app and the mobile app (and driven by the backend's
// end-to-end tests), so platform pieces are injected:
//
//   http   { get(path, params) → data, send(method, path, body) → data,
//            upload(path, bytes) → data, download(path) → Uint8Array }
//          errors carry .status and .code (the server's error code)
//   store  { loadRing(), saveRing(ring), clearRing(), loadPins(), savePins(pins) }
//          async; where the private key ring lives on this device
//
// Protocol and threat model: ./crypto.js. The client never sends a private key
// or a conversation key to the server in the clear.
import * as C from "./crypto.js";
import { b64, unb64 } from "./encoding.js";

const PEER_TTL_MS = 60_000;

export class DmClientError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
const fail = (message, code) => {
  throw new DmClientError(message, code);
};

/**
 * Folds a decrypted, seq-ordered message list into a timeline: reactions and
 * edits attach to their targets (an edit counts only from the original
 * sender) instead of showing as rows. Pure; UIs call it after each change.
 */
export function foldMessages(list) {
  const rows = [];
  const byId = new Map();
  for (const m of list) {
    const p = m.payload;
    if (p?.kind === "reaction" || p?.kind === "edit") continue;
    const row = { ...m, reactions: {}, editedAt: null, text: p?.text ?? null };
    rows.push(row);
    byId.set(m.id, row);
  }
  for (const m of list) {
    const p = m.payload;
    const target = p && byId.get(p.target);
    if (!target) continue;
    if (p.kind === "reaction") {
      if (p.emoji) target.reactions[m.senderId] = p.emoji;
      else delete target.reactions[m.senderId];
    } else if (p.kind === "edit" && m.senderId === target.senderId && !target.deleted) {
      target.text = String(p.text ?? "");
      target.editedAt = m.createdAt;
    }
  }
  return rows;
}

export class DmClient {
  constructor({ uid, http, store }) {
    if (!uid || !http || !store) throw new TypeError("DmClient needs uid, http and store");
    this.uid = uid;
    this.http = http;
    this.store = store;
    this.ring = null;
    this.pins = null;
    this.cks = new Map(); // `${conversationId}:${epoch}` → key
    this.convs = new Map(); // id → last fetched conversation view
    this.peers = new Map(); // uid → { at, value }
    this.listeners = new Set();
  }

  // ─── Local state ─────────────────────────────────────────────────────
  async loadRing() {
    this.ring ??= await this.store.loadRing();
    return this.ring;
  }
  async #saveRing(ring) {
    this.ring = ring;
    await this.store.saveRing(ring);
  }
  async #loadPins() {
    this.pins ??= (await this.store.loadPins()) ?? {};
    return this.pins;
  }
  async #savePins() {
    await this.store.savePins(this.pins);
  }
  #requireRing() {
    if (!this.ring) fail("Set up or restore encrypted messages on this device first", "NO_KEYS");
    return this.ring;
  }

  /**
   * Where this device stands:
   *   "new"      account has never set up DMs        → setup({ wallet })
   *   "restore"  keys exist but not on this device    → restore({ wallet }) or startLink()
   *   "ready"    good to go
   * backupKind: "wallet" | "pin" | null (older accounts may have a PIN backup).
   */
  async status() {
    const [me, ring] = await Promise.all([this.http.get("/dm/me"), this.loadRing()]);
    const latest = me.bundles.at(-1) ?? null;
    let state = "ready";
    if (!latest) state = "new";
    else if (!ring || !ring.versions[latest.version] || b64(ring.versions[latest.version].signPub) !== latest.signPub) state = "restore";
    return {
      state,
      latestVersion: latest?.version ?? 0,
      backup: me.backup.exists,
      backupKind: me.backup.kind ?? (me.backup.exists ? "pin" : null),
      backupAddress: me.backup.address ?? null,
      settings: me.settings,
    };
  }

  // ─── Keys: setup, backup, restore, rotate, reset ─────────────────────
  // `source` unlocks the backup:
  //   { wallet: { address, sign(message) → 0x signature } }   the default
  //   { pin }                                                  older backups
  // (A bare string is taken as a PIN.)

  /** Checks a source before any keys change, so a bad PIN can't leave half a setup. */
  #checkSource(source) {
    if (source?.wallet) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(source.wallet.address ?? "") || typeof source.wallet.sign !== "function") fail("No wallet to back up with", "NO_WALLET");
      return;
    }
    const problem = C.pinProblem(source?.pin);
    if (problem) fail(problem, "WEAK_PIN");
  }

  /** Backup secrets for `kdf` (read from the server on restore). */
  async #secrets(source, salt, kdf) {
    if (kdf?.name === "wallet") {
      const wallet = source?.wallet;
      if (!wallet) fail("This backup is unlocked with your wallet", "NEEDS_WALLET");
      if (kdf.address && wallet.address.toLowerCase() !== kdf.address.toLowerCase()) {
        fail(`Your messages are backed up with wallet ${kdf.address.slice(0, 6)}…${kdf.address.slice(-4)}. Restore that wallet to unlock them.`, "WRONG_WALLET");
      }
      return C.deriveWalletBackupSecrets(await wallet.sign(C.walletBackupMessage(this.uid)), salt);
    }
    if (source?.pin == null) fail("This backup is unlocked with your messaging PIN", "NEEDS_PIN");
    return C.deriveBackupSecrets(source.pin, salt, kdf);
  }

  /**
   * The backup's secrets, worked out first — the wallet prompt (or PIN
   * stretch) happens before any keys change, so backing out of it leaves
   * nothing half done.
   */
  async #prepareBackup(source) {
    const src = typeof source === "string" ? { pin: source } : source;
    this.#checkSource(src);
    const salt = C.randomBytes(16);
    const serverShare = C.randomBytes(32);
    const kdf = src.wallet ? { name: "wallet", v: C.WALLET_BACKUP_KDF_VERSION, address: src.wallet.address.toLowerCase() } : C.BACKUP_KDF;
    return { salt, serverShare, kdf, ...(await this.#secrets(src, salt, kdf)) };
  }

  async #writeBackup(ring, { salt, serverShare, kdf, authKey, encPart }) {
    const blob = C.sealBackup(ring, { encPart, serverShare, salt });
    await this.http.send("PUT", "/dm/backup", { salt: b64(salt), kdf, authKey: b64(authKey), serverShare: b64(serverShare), blob });
  }

  async setup(source) {
    const prepared = await this.#prepareBackup(source);
    const ring = C.newKeyRing();
    await this.http.send("PUT", "/dm/keys", C.makeBundle(this.uid, C.currentKeys(ring)));
    await this.#saveRing(ring);
    await this.#writeBackup(ring, prepared);
  }

  /** (Re)writes the backup of this device's key ring — also how a PIN backup moves to the wallet. */
  async backup(source) {
    const ring = this.#requireRing();
    await this.#writeBackup(ring, await this.#prepareBackup(source));
  }

  /** New device → keys, unlocked by the wallet (or the PIN, for a PIN backup). */
  async restore(source) {
    const src = typeof source === "string" ? { pin: source } : source;
    const params = await this.http.get("/dm/backup");
    if (!params.exists) fail("There’s no backup for this account — link a device instead", "NO_BACKUP");
    const salt = unb64(params.salt);
    const { authKey, encPart } = await this.#secrets(src, salt, params.kdf);
    const { serverShare, blob } = await this.http.send("POST", "/dm/backup/restore", { authKey: b64(authKey) });
    const ring = C.openBackup(blob, { encPart, serverShare: unb64(serverShare), salt });
    await this.#saveRing(ring);
    const { state } = await this.status();
    if (state !== "ready") fail("This backup is older than your current keys — link a device that has them", "STALE_BACKUP");
    return ring;
  }

  /** New key version, countersigned by the old one (peers see no warning). Lost-device hygiene. */
  async rotate(source) {
    const prepared = await this.#prepareBackup(source);
    const { ring, keys, prev } = C.rotateKeyRing(this.#requireRing());
    await this.http.send("PUT", "/dm/keys", C.makeBundle(this.uid, keys, prev));
    await this.#saveRing(ring);
    await this.#writeBackup(ring, prepared);
    this.cks.clear();
  }

  /**
   * Start over when no device and no backup has the keys. Old messages stay
   * unreadable; people you talk to are told your keys changed.
   */
  async reset(source) {
    const prepared = await this.#prepareBackup(source);
    const me = await this.http.get("/dm/me");
    const version = (me.bundles.at(-1)?.version ?? 0) + 1;
    const keys = C.generateAccountKeys(version);
    await this.http.send("PUT", "/dm/keys", C.makeBundle(this.uid, keys));
    const ring = { current: version, versions: { [version]: keys } };
    await this.#saveRing(ring);
    await this.#writeBackup(ring, prepared);
    this.cks.clear();
  }

  // ─── Device linking ──────────────────────────────────────────────────
  /** New device: returns the QR text + check code to show, and wait() for the hand-over. */
  async startLink() {
    const keys = C.newLinkKeys();
    const { id, expiresAt } = await this.http.send("POST", "/dm/links", { pub: b64(keys.pub) });
    const wait = async ({ intervalMs = 1500, signal } = {}) => {
      while (!signal?.aborted) {
        if (Date.parse(expiresAt) < Date.now()) fail("The code expired — show a new one", "LINK_EXPIRED");
        const r = await this.http.get(`/dm/links/${id}/result`);
        if (r.status === "sealed") {
          const ring = C.openLinkedRing(r.sealed, { linkId: id, priv: keys.priv }, this.uid);
          await this.#saveRing(ring);
          return ring;
        }
        await new Promise((res) => setTimeout(res, intervalMs));
      }
      fail("Linking cancelled", "CANCELLED");
    };
    return { linkId: id, qr: C.linkQrPayload(id, keys.pub), code: C.linkCheckCode(keys.pub), expiresAt, wait };
  }

  /** Existing device: scanned QR → hand over the keys. Returns the check code to compare. */
  async approveLink(qrText) {
    const ring = this.#requireRing();
    const target = C.parseLinkQr(qrText);
    const l = await this.http.get(`/dm/links/${target.linkId}`);
    // The QR is the source of truth for the key; a server swapping it is caught here.
    if (l.pub !== b64(target.pub)) fail("This code doesn’t match — start linking again", "LINK_MISMATCH");
    await this.http.send("PUT", `/dm/links/${target.linkId}`, { sealed: C.sealRingForLink(ring, target, this.uid) });
    return { code: C.linkCheckCode(target.pub) };
  }

  // ─── Peers: key pinning + safety numbers ─────────────────────────────
  /**
   * Someone's verified keys. First sight pins them; later versions are
   * accepted silently only if each was countersigned by the one before. A
   * break (reset, or a key the server substituted) sets keyChanged until
   * the user acknowledges it.
   */
  async peer(uid, { fresh = false } = {}) {
    const cached = this.peers.get(uid);
    if (!fresh && cached && Date.now() - cached.at < PEER_TTL_MS) return cached.value;
    const list = await this.http.get(`/dm/keys/${encodeURIComponent(uid)}`);
    const bundles = {};
    for (const b of list) if (b.uid === uid && C.verifyBundle(b).valid) bundles[b.version] = b;
    const versions = Object.keys(bundles).map(Number).sort((a, b) => a - b);
    if (!versions.length) fail("This person hasn’t set up encrypted messages yet", "PEER_NO_KEYS");
    const latest = bundles[versions.at(-1)];

    const pins = await this.#loadPins();
    let pin = pins[uid];
    let keyChanged = false;
    if (!pin) {
      pin = pins[uid] = { version: latest.version, signPub: latest.signPub, verified: false };
      await this.#savePins();
    } else if (pin.version === latest.version) {
      keyChanged = pin.signPub !== latest.signPub;
    } else if (latest.version > pin.version) {
      let ok = bundles[pin.version]?.signPub === pin.signPub;
      for (let v = pin.version + 1; ok && v <= latest.version; v++) ok = !!bundles[v] && C.verifyBundle(bundles[v], bundles[v - 1]).continuous;
      if (ok) {
        pins[uid] = { ...pin, version: latest.version, signPub: latest.signPub };
        await this.#savePins();
      } else keyChanged = true;
    } else keyChanged = true; // version went backwards
    pin = pins[uid];

    const value = {
      uid,
      bundle: latest,
      bundles,
      keyChanged,
      verified: !!pin.verified && !keyChanged,
      safetyNumber: this.ring ? C.safetyNumber({ uid: this.uid, signPub: b64(C.currentKeys(this.ring).signPub) }, latest) : null,
    };
    this.peers.set(uid, { at: Date.now(), value });
    return value;
  }

  /** User saw the "keys changed" notice and continues: trust the new keys (unverified). */
  async acceptKeyChange(uid) {
    const { bundle } = await this.peer(uid, { fresh: true });
    const pins = await this.#loadPins();
    pins[uid] = { version: bundle.version, signPub: bundle.signPub, verified: false };
    await this.#savePins();
    this.peers.delete(uid);
  }

  /** User compared safety numbers in person / on a call. */
  async setVerified(uid, verified = true) {
    const pins = await this.#loadPins();
    if (!pins[uid]) await this.peer(uid);
    pins[uid] = { ...pins[uid], verified };
    await this.#savePins();
    this.peers.delete(uid);
  }

  // ─── Conversations ───────────────────────────────────────────────────
  #myBundle() {
    const keys = C.currentKeys(this.#requireRing());
    return { uid: this.uid, version: keys.version, boxPub: b64(keys.boxPub), signPub: b64(keys.signPub) };
  }

  #envelopes(ck, at, bundles) {
    return bundles.map((b) => C.sealConversationKey(ck, at, b));
  }

  #remember(conv) {
    this.convs.set(conv.id, conv);
    return conv;
  }

  /**
   * Start (or reopen) a 1:1 conversation → { conversation, created }. This
   * device picks the id so the first epoch key can be sealed to it up front.
   */
  async start(peerId, { retried = false } = {}) {
    this.#requireRing();
    const peer = await this.peer(peerId, { fresh: retried });
    const id = C.messageId();
    const ck = C.newConversationKey();
    const envelopes = this.#envelopes(ck, { conversationId: id, epoch: 1 }, [this.#myBundle(), peer.bundle]);
    try {
      const res = await this.http.send("POST", "/dm/conversations", { id, peerId, envelopes });
      if (res.created) this.cks.set(`${id}:1`, ck);
      this.#remember(res.conversation);
      return res;
    } catch (e) {
      if (e.code === "KEYS_STALE" && !retried) return this.start(peerId, { retried: true });
      throw e;
    }
  }

  /** Fetches a conversation; re-keys it first if someone's keys changed. */
  async open(conversationId) {
    let conv = this.#remember(await this.http.get(`/dm/conversations/${conversationId}`));
    if (conv.needsNewEpoch) conv = await this.#rekey(conv);
    return conv;
  }

  /** New epoch sealed to everyone's current keys (after a rotation). Losing a race is fine. */
  async #rekey(conv) {
    const mine = conv.bundles[this.uid];
    const ring = this.#requireRing();
    if (!mine || !ring.versions[mine.version]) fail("Your keys changed on another device — restore them here", "NO_KEYS");
    const bundles = [];
    for (const uid of Object.keys(conv.bundles)) bundles.push(uid === this.uid ? mine : (await this.peer(uid, { fresh: true })).bundle);
    const epoch = conv.currentEpoch + 1;
    const ck = C.newConversationKey();
    try {
      await this.http.send("POST", `/dm/conversations/${conv.id}/epochs`, { epoch, envelopes: this.#envelopes(ck, { conversationId: conv.id, epoch }, bundles) });
      this.cks.set(`${conv.id}:${epoch}`, ck);
    } catch (e) {
      if (e.code !== "EPOCH_STALE" && e.code !== "KEYS_STALE") throw e;
    }
    return this.#remember(await this.http.get(`/dm/conversations/${conv.id}`));
  }

  /** Conversation key for an epoch (cached; opened from this user's envelope). */
  async #ck(conv, epoch) {
    const k = `${conv.id}:${epoch}`;
    if (this.cks.has(k)) return this.cks.get(k);
    let env = conv.envelopes.find((e) => e.epoch === epoch);
    if (!env) {
      conv = this.#remember(await this.http.get(`/dm/conversations/${conv.id}`));
      env = conv.envelopes.find((e) => e.epoch === epoch);
    }
    if (!env) fail("This message was sent before you joined the conversation", "NO_EPOCH_KEY");
    const ck = C.openConversationKey(this.#requireRing(), { conversationId: conv.id, epoch }, this.uid, env);
    this.cks.set(k, ck);
    return ck;
  }

  #conv(convOrId) {
    const conv = typeof convOrId === "string" ? this.convs.get(convOrId) : convOrId;
    if (!conv) fail("Open the conversation first", "NOT_OPEN");
    return conv;
  }

  // ─── Sending ─────────────────────────────────────────────────────────
  /** Encrypts and sends any payload. → { message (server row), payload } */
  async send(convOrId, payload, { retried = false } = {}) {
    let conv = this.#conv(convOrId);
    if (conv.needsNewEpoch) conv = await this.#rekey(conv);
    const ring = this.#requireRing();
    const body = { ...payload, sentAt: Date.now() };
    const id = C.messageId();
    const epoch = conv.currentEpoch;
    const ck = await this.#ck(conv, epoch);
    const wire = C.encryptMessage(ck, { conversationId: conv.id, epoch, senderId: this.uid, senderKeyVersion: ring.current, messageId: id }, body, C.currentKeys(ring).signPriv);
    try {
      const { message } = await this.http.send("POST", `/dm/conversations/${conv.id}/messages`, { id, epoch, senderKeyVersion: ring.current, ...wire });
      return { message, payload: { ...body, v: C.PROTOCOL_VERSION } };
    } catch (e) {
      if ((e.code === "EPOCH_STALE" || e.code === "KEYS_STALE") && !retried) return this.send(await this.open(conv.id), payload, { retried: true });
      throw e;
    }
  }

  sendText(conv, text, { replyTo = null, attachments } = {}) {
    const t = String(text ?? "").trim();
    if (!t && !attachments?.length) fail("Write a message first", "EMPTY");
    return this.send(conv, { kind: "text", text: t, replyTo, ...(attachments?.length ? { attachments } : {}) });
  }
  react(conv, target, emoji) {
    return this.send(conv, { kind: "reaction", target, emoji: emoji || null });
  }
  edit(conv, target, text) {
    return this.send(conv, { kind: "edit", target, text: String(text ?? "").trim() });
  }
  unsend(messageId) {
    return this.http.send("DELETE", `/dm/messages/${messageId}`);
  }

  // ─── Reading ─────────────────────────────────────────────────────────
  /**
   * Server row → { id, seq, senderId, createdAt, epoch, deleted, payload }
   * or, if it can't be opened or verified, { …, error: code }.
   */
  async decrypt(convOrId, m) {
    const conv = this.#conv(convOrId);
    const base = { id: m.id, seq: m.seq, senderId: m.senderId, createdAt: m.createdAt, epoch: m.epoch, mine: m.senderId === this.uid, deleted: m.deleted };
    if (m.deleted) return { ...base, payload: null };
    try {
      const ck = await this.#ck(conv, m.epoch);
      let signPub;
      if (m.senderId === this.uid) {
        const k = this.#requireRing().versions[m.senderKeyVersion];
        if (!k) fail("Missing your old signing key", "MISSING_KEY_VERSION");
        signPub = k.signPub;
      } else {
        let p = await this.peer(m.senderId);
        if (!p.bundles[m.senderKeyVersion]) p = await this.peer(m.senderId, { fresh: true });
        const b = p.bundles[m.senderKeyVersion];
        if (!b) fail("Unknown sender key", "UNKNOWN_SENDER_KEY");
        signPub = unb64(b.signPub);
      }
      const payload = C.decryptMessage(ck, { conversationId: conv.id, epoch: m.epoch, senderId: m.senderId, senderKeyVersion: m.senderKeyVersion, messageId: m.id }, m, signPub);
      return { ...base, payload };
    } catch (e) {
      return { ...base, payload: null, error: e.code ?? "DECRYPT" };
    }
  }

  /** A page of decrypted messages: { after } catches up, { before } goes back. Ascending. */
  async history(convOrId, { after, before, limit } = {}) {
    const conv = this.#conv(convOrId);
    const rows = await this.http.get(`/dm/conversations/${conv.id}/messages`, { after, before, limit });
    const out = [];
    for (const m of rows) out.push(await this.decrypt(conv, m));
    return out;
  }

  markRead(conversationId, seq) {
    return this.http.send("POST", `/dm/conversations/${conversationId}/read`, { seq });
  }
  typing(conversationId) {
    return this.http.send("POST", `/dm/conversations/${conversationId}/typing`);
  }

  // ─── People ──────────────────────────────────────────────────────────
  /** By username → { id, username, displayName, avatarUrl, canMessage }. */
  lookup(username) {
    return this.http.get(`/dm/users/${encodeURIComponent(String(username).replace(/^@/, ""))}`);
  }
  /** Public profiles for up to 50 uids → { [uid]: profile | null }. */
  profiles(uids) {
    return uids.length ? this.http.get("/dm/profiles", { ids: [...new Set(uids)].slice(0, 50).join(",") }) : Promise.resolve({});
  }

  // ─── Inbox & requests ────────────────────────────────────────────────
  list({ box = "inbox", before, limit } = {}) {
    return this.http.get("/dm/conversations", { box, before, limit });
  }
  async accept(conversationId) {
    return this.#remember(await this.http.send("POST", `/dm/conversations/${conversationId}/accept`));
  }
  reject(conversationId, { block = false } = {}) {
    return this.http.send("POST", `/dm/conversations/${conversationId}/reject`, { block });
  }
  setPrefs(conversationId, prefs) {
    return this.http.send("PATCH", `/dm/conversations/${conversationId}`, prefs);
  }
  hide(conversationId) {
    return this.http.send("DELETE", `/dm/conversations/${conversationId}`);
  }
  setSettings(settings) {
    return this.http.send("PUT", "/dm/settings", settings);
  }
  block(uid) {
    return this.http.send("PUT", `/dm/blocks/${encodeURIComponent(uid)}`);
  }
  unblock(uid) {
    return this.http.send("DELETE", `/dm/blocks/${encodeURIComponent(uid)}`);
  }
  blocks() {
    return this.http.get("/dm/blocks");
  }

  /**
   * Report messages (decrypted rows from history()). Discloses those epochs'
   * keys to moderators so they can verify the messages are genuine.
   */
  async report(convOrId, messages, reason, { note, block = false } = {}) {
    const conv = this.#conv(convOrId);
    const keys = {};
    for (const m of messages) keys[m.epoch] = b64(await this.#ck(conv, m.epoch));
    return this.http.send("POST", "/dm/reports", { conversationId: conv.id, messageIds: messages.map((m) => m.id), keys, reason, note, block });
  }

  // ─── Attachments ─────────────────────────────────────────────────────
  /** Encrypts + uploads; returns the descriptor to put in a message's `attachments`. */
  async uploadAttachment(convOrId, bytes, meta = {}) {
    const conv = this.#conv(convOrId);
    const { data, ref } = C.encryptAttachment(bytes);
    const res = await this.http.upload(`/dm/conversations/${conv.id}/attachments`, data);
    if (res.sha256 !== ref.sha256) fail("Upload was corrupted — try again", "UPLOAD_MISMATCH");
    return { id: res.id, ...ref, mime: meta.mime ?? "application/octet-stream", name: meta.name ?? null, width: meta.width ?? null, height: meta.height ?? null };
  }

  async downloadAttachment(att) {
    return C.decryptAttachment(await this.http.download(`/dm/attachments/${att.id}`), att);
  }

  // ─── Live events (from the realtime socket) ──────────────────────────
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  #emit(e) {
    for (const fn of this.listeners) fn(e);
  }

  /**
   * Feed every dm.* socket event here. Messages are decrypted before
   * listeners see them: { type: "message", conversationId, message, request }.
   */
  async handleEvent(ev) {
    if (!ev?.type?.startsWith("dm.")) return;
    if (ev.type === "dm.keys") {
      this.peers.delete(ev.userId);
      for (const k of this.convs.keys()) if (this.convs.get(k).bundles?.[ev.userId]) this.convs.get(k).needsNewEpoch = true;
      return this.#emit({ type: "keys", userId: ev.userId });
    }
    if (ev.type === "dm.message") {
      let conv = this.convs.get(ev.conversationId);
      if (!conv || ev.message.epoch > conv.currentEpoch) conv = this.#remember(await this.http.get(`/dm/conversations/${ev.conversationId}`));
      return this.#emit({ type: "message", conversationId: ev.conversationId, message: await this.decrypt(conv, ev.message), request: !!ev.request });
    }
    if (ev.type === "dm.conversation" && this.convs.has(ev.conversationId)) {
      this.#remember(await this.http.get(`/dm/conversations/${ev.conversationId}`));
    }
    this.#emit({ ...ev, type: ev.type.slice(3) });
  }
}
