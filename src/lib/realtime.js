// lib/realtime.js — one WebSocket per tab to the backend's /ws gateway
// (backend/src/realtime/gateway.js has the protocol).
//
//   • Opens when the first tribe is subscribed (or something calls hold() —
//     direct messages); closes 30 s after nothing needs it.
//   • Authenticates with the Firebase ID token and re-sends it as it rotates.
//   • Reconnects with backoff + jitter (immediately when the browser comes
//     back online or the tab becomes visible), then re-subscribes each tribe
//     with `since` = the newest message the page has, so gaps are filled.
//   • status: "idle" | "connecting" | "open" | "offline" — chat polls over
//     HTTP whenever it isn't "open".
import { useSyncExternalStore } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { APP_CONFIG } from "@/lib/config";

const REQUEST_TIMEOUT_MS = 10_000;
const IDLE_CLOSE_MS = 30_000;
const BACKOFF_MAX_MS = 30_000;

export function realtimeUrl() {
  if (process.env.NEXT_PUBLIC_REALTIME_URL) return process.env.NEXT_PUBLIC_REALTIME_URL;
  const u = new URL(APP_CONFIG.BACKEND_URL);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  u.search = "";
  return u.toString();
}

export class RealtimeError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status; // 0 = connection problem (safe to retry later)
  }
}

class Realtime {
  status = "idle";
  #ws = null;
  #listeners = new Set();
  #subs = new Map(); // tribeId → Set<{ onEvent, onSubscribed, getSince }>
  #pending = new Map(); // ref → { resolve, reject, timer }
  #ref = 0;
  #attempt = 0;
  #retryTimer = null;
  #idleTimer = null;
  #token = null;
  #unwatchToken = null;
  #holds = 0; // hold() callers that need the socket without a tribe (direct messages)
  #frameListeners = new Set(); // onEvent() — frames that aren't tribe events

  /** Someone needs the socket: a tribe subscription or a hold(). */
  #wanted() {
    return this.#subs.size > 0 || this.#holds > 0;
  }

  /** Close after a grace period once nothing needs the socket. */
  #release() {
    if (this.#wanted()) return;
    clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => !this.#wanted() && this.close(), IDLE_CLOSE_MS);
  }

  // ─── Status store (useSyncExternalStore) ──────────────────────────────────
  subscribeStatus = (fn) => {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  };
  getStatus = () => this.status;
  #setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    for (const fn of this.#listeners) fn();
  }

  // ─── Connection ───────────────────────────────────────────────────────────
  #ensure() {
    clearTimeout(this.#idleTimer);
    if (typeof window === "undefined" || !auth.currentUser) return;
    if (this.#ws && this.#ws.readyState <= WebSocket.OPEN) return;
    clearTimeout(this.#retryTimer);
    this.#watch();
    this.#connect();
  }

  #watch() {
    if (this.#unwatchToken) return;
    // Rotated tokens go to the open socket; signing out closes it.
    this.#unwatchToken = onIdTokenChanged(auth, async (user) => {
      if (!user) return this.close();
      this.#token = await user.getIdToken();
      if (this.status === "open") this.#raw({ type: "auth", token: this.#token });
    });
    window.addEventListener("online", this.#wake);
    document.addEventListener("visibilitychange", this.#wake);
  }

  #wake = () => {
    if (!this.#wanted() || this.status === "open" || this.status === "connecting") return;
    if (document.visibilityState === "hidden" && navigator.onLine === false) return;
    clearTimeout(this.#retryTimer);
    this.#attempt = 0;
    this.#connect();
  };

  async #connect() {
    this.#setStatus("connecting");
    let token;
    try {
      token = await auth.currentUser?.getIdToken();
    } catch {
      token = null;
    }
    if (!token) return this.#setStatus("offline");
    this.#token = token;
    const ws = new WebSocket(realtimeUrl());
    this.#ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token: this.#token }));
    ws.onmessage = (e) => {
      let f;
      try {
        f = JSON.parse(e.data);
      } catch {
        return;
      }
      this.#onFrame(f);
    };
    ws.onclose = (e) => {
      if (this.#ws !== ws) return;
      this.#ws = null;
      this.#failPending("Connection lost");
      this.#setStatus(this.#wanted() ? "offline" : "idle");
      if (!this.#wanted() || e.code === 4403) return;
      // 4401: token problem — the next attempt fetches a fresh one.
      if (e.code === 4401) auth.currentUser?.getIdToken(true).catch(() => {});
      const delay = Math.min(BACKOFF_MAX_MS, 1000 * 2 ** this.#attempt) * (0.5 + Math.random() / 2);
      this.#attempt += 1;
      this.#retryTimer = setTimeout(() => this.#connect(), delay);
    };
  }

  #onFrame(f) {
    if (f.type === "ready") {
      this.#attempt = 0;
      this.#setStatus("open");
      for (const tribeId of this.#subs.keys()) this.#sendSubscribe(tribeId);
      return;
    }
    if (f.ref && this.#pending.has(f.ref)) {
      const p = this.#pending.get(f.ref);
      this.#pending.delete(f.ref);
      clearTimeout(p.timer);
      if (f.type === "error") p.reject(new RealtimeError(f.error, f.status ?? 500));
      else p.resolve(f);
      if (f.type !== "subscribed") return;
    }
    if (f.type === "subscribed") {
      for (const h of this.#subs.get(f.tribeId) ?? []) h.onSubscribed?.(f);
      return;
    }
    if (f.tribeId) for (const h of this.#subs.get(f.tribeId) ?? []) h.onEvent?.(f);
    else for (const fn of this.#frameListeners) fn(f);
  }

  #raw(frame) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(frame));
      return true;
    }
    return false;
  }

  #request(frame) {
    return new Promise((resolve, reject) => {
      if (this.status !== "open") return reject(new RealtimeError("Not connected"));
      const ref = `r${++this.#ref}`;
      const timer = setTimeout(() => {
        this.#pending.delete(ref);
        reject(new RealtimeError("Timed out"));
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(ref, { resolve, reject, timer });
      this.#raw({ ...frame, ref });
    });
  }

  #failPending(message) {
    for (const p of this.#pending.values()) {
      clearTimeout(p.timer);
      p.reject(new RealtimeError(message));
    }
    this.#pending.clear();
  }

  #sendSubscribe(tribeId) {
    const handlers = [...(this.#subs.get(tribeId) ?? [])];
    const since = Math.max(0, ...handlers.map((h) => h.getSince?.() ?? 0));
    this.#raw({ type: "subscribe", tribeId, since: since || undefined });
  }

  // ─── API ──────────────────────────────────────────────────────────────────
  /** Live events for a tribe. Returns an unsubscribe function. */
  subscribe(tribeId, handler) {
    if (!this.#subs.has(tribeId)) this.#subs.set(tribeId, new Set());
    const set = this.#subs.get(tribeId);
    set.add(handler);
    // Subscribing again is harmless and gap-fills for the new handler.
    if (this.status === "open") this.#sendSubscribe(tribeId);
    this.#ensure();
    return () => {
      set.delete(handler);
      if (set.size) return;
      this.#subs.delete(tribeId);
      this.#raw({ type: "unsubscribe", tribeId });
      this.#release();
    };
  }

  /** Sends a chat message; resolves the stored message (or the original one for a repeated clientId). */
  async sendMessage(tribeId, { clientId, text, replyTo, profile }) {
    const f = await this.#request({ type: "send", tribeId, clientId, text, replyTo, profile });
    return f.message;
  }

  typing(tribeId, profile) {
    this.#raw({ type: "typing", tribeId, profile });
  }

  read(tribeId) {
    this.#raw({ type: "read", tribeId });
  }

  // ─── Non-tribe features (direct messages) ─────────────────────────────────
  /** Keeps the socket open (e.g. while the DM inbox is mounted). Returns release(). */
  hold() {
    this.#holds += 1;
    this.#ensure();
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.#holds -= 1;
      this.#release();
    };
  }

  /** Frames that aren't tribe events (dm.*). Returns an unsubscribe function. */
  onEvent(fn) {
    this.#frameListeners.add(fn);
    return () => this.#frameListeners.delete(fn);
  }

  /** True if sent (socket open); callers fall back to HTTP otherwise. */
  dmTyping(conversationId) {
    return this.#raw({ type: "dm.typing", conversationId });
  }

  dmRead(conversationId, seq) {
    return this.#raw({ type: "dm.read", conversationId, seq });
  }

  close() {
    clearTimeout(this.#retryTimer);
    clearTimeout(this.#idleTimer);
    const ws = this.#ws;
    this.#ws = null;
    ws?.close(1000);
    this.#failPending("Closed");
    this.#unwatchToken?.();
    this.#unwatchToken = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.#wake);
      document.removeEventListener("visibilitychange", this.#wake);
    }
    this.#setStatus("idle");
  }
}

export const realtime = new Realtime();

const serverStatus = () => "idle";
/** "idle" | "connecting" | "open" | "offline" */
export function useRealtimeStatus() {
  return useSyncExternalStore(realtime.subscribeStatus, realtime.getStatus, serverStatus);
}
