"use client";
// hooks/useTribeChat.js — tribe chat state.
//   • Cached history renders instantly (IndexedDB, last 150 messages).
//   • Live: a WebSocket subscription (lib/realtime.js) delivers new, edited,
//     deleted and pinned messages, settings and typing. Re-subscribing after
//     a drop sends `since`, so nothing is missed.
//   • Fallback: while the socket isn't open, poll /messages/poll every 3 s and
//     reconcile the newest page every 30 s (the app's original behaviour).
//   • Outbox: sends are optimistic and carry a clientId. If the connection is
//     down they wait (in IndexedDB, surviving reloads) and go out in order when
//     it's back; the server de-duplicates by clientId, so a retry never posts
//     twice. Only real rejections (locked, slow mode, …) show as failed.
import { useCallback, useEffect, useRef, useState } from "react";
import { kvGet, kvSet, userScope } from "@/lib/cache/idb";
import * as T from "@/lib/tribeApi";
import { realtime, useRealtimeStatus } from "@/lib/realtime";
import { useAuthor } from "@/hooks/tribes";

const POLL_MS = 3000;
const RECONCILE_EVERY = 10; // polls → 30s
const PAGE = 30;
const CACHE_MAX = 150;
const TYPING_TTL_MS = 5000;
const TYPING_SEND_MS = 2500;

const ts = (m) => (typeof m.timestamp === "number" ? m.timestamp : Date.parse(m.createdAt) || 0);
const newClientId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
// Retryable = the request may not have reached the server (offline, socket dropped, timeout, 5xx),
// or it's still in flight (409 — the server is finishing the same clientId).
const retryable = (e) => !e?.status || e.status >= 500 || e.status === 409;

function merge(list, incoming) {
  const map = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, { ...map.get(m.id), ...m, _pending: false, _failed: false, _queued: false });
  // An optimistic copy is replaced by the stored message with the same clientId.
  const confirmed = new Set(incoming.map((m) => m.clientId).filter(Boolean));
  return [...map.values()].filter((m) => !(m._clientId && confirmed.has(m._clientId) && m.id.startsWith("_tmp_"))).sort((a, b) => ts(a) - ts(b));
}

export function useTribeChat(tribeId) {
  const author = useAuthor();
  const status = useRealtimeStatus();
  const live = status === "open";
  const cacheKey = `chat:${author.uid}:${tribeId}`;
  const outboxKey = `outbox:${author.uid}:${tribeId}`;
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(null);
  const [typing, setTyping] = useState([]); // [{ id, name, until }]
  const latest = useRef(0);
  const pollCount = useRef(0);
  const flushing = useRef(false);
  const lastTypingSent = useRef(0);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const apply = useCallback(
    (updater) =>
      setMessages((prev) => {
        const next = updater(prev);
        const confirmed = next.filter((m) => !m._pending && !m._failed && !m._queued);
        if (confirmed.length) latest.current = Math.max(latest.current, ts(confirmed[confirmed.length - 1]));
        kvSet(cacheKey, confirmed.slice(-CACHE_MAX), userScope(author.uid));
        // The outbox is whatever is still waiting to be delivered.
        kvSet(
          outboxKey,
          next.filter((m) => m._pending || m._queued).map(({ id, _clientId, text, replyTo, timestamp }) => ({ id, _clientId, text, replyTo, timestamp })),
          userScope(author.uid),
        );
        return next;
      }),
    [cacheKey, outboxKey, author.uid],
  );

  const refreshPinned = useCallback(() => T.getPinnedMessages(tribeId).then(setPinned).catch(() => {}), [tribeId]);
  const refreshSettings = useCallback(() => T.getChatSettings(tribeId).then(setSettings).catch(() => {}), [tribeId]);

  const reloadNewest = useCallback(async () => {
    const page = await T.getMessages(tribeId, PAGE);
    const ids = new Set(page.map((m) => m.id));
    const from = page.length ? ts(page[0]) : 0;
    apply((prev) => merge(prev.filter((m) => m._pending || m._failed || m._queued || ts(m) < from || ids.has(m.id)), page));
  }, [tribeId, apply]);

  // ─── Delivery ─────────────────────────────────────────────────────────────
  const profile = useCallback(() => ({ username: author.username, displayName: author.displayName, userAvatar: author.userAvatar }), [author]);

  const deliver = useCallback(
    async (m) => {
      const body = { clientId: m._clientId, text: m.text, replyTo: m.replyTo };
      try {
        const msg =
          realtime.status === "open"
            ? await realtime.sendMessage(tribeId, { ...body, profile: profile() })
            : await T.sendMessage(tribeId, { ...body, ...profile() });
        apply((prev) => merge(prev.filter((x) => x.id !== m.id), [msg]));
        return null;
      } catch (e) {
        if (retryable(e)) {
          // Not delivered (as far as we know) — keep it queued; the clientId makes the retry safe.
          apply((prev) => prev.map((x) => (x.id === m.id ? { ...x, _pending: false, _queued: true } : x)));
          return null;
        }
        apply((prev) => prev.map((x) => (x.id === m.id ? { ...x, _pending: false, _queued: false, _failed: true, _error: e.message } : x)));
        return e;
      }
    },
    [tribeId, apply, profile],
  );

  /** Sends queued messages one at a time, oldest first. */
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (;;) {
        const next = messagesRef.current.filter((m) => m._queued).sort((a, b) => ts(a) - ts(b))[0];
        if (!next) break;
        setMessages((prev) => prev.map((x) => (x.id === next.id ? { ...x, _queued: false, _pending: true } : x)));
        messagesRef.current = messagesRef.current.map((x) => (x.id === next.id ? { ...x, _queued: false, _pending: true } : x));
        await deliver(next);
        if (messagesRef.current.some((m) => m.id === next.id && m._queued)) break; // still offline
      }
    } finally {
      flushing.current = false;
    }
  }, [deliver]);

  // ─── Initial load: cache + outbox → newest page → pinned/settings ─────────
  useEffect(() => {
    if (!tribeId || !author.uid) return;
    let cancelled = false;
    Promise.all([kvGet(cacheKey), kvGet(outboxKey)]).then(([cached, outbox]) => {
      if (cancelled) return;
      const queued = (Array.isArray(outbox) ? outbox : []).map((m) => ({
        ...m,
        userId: author.uid,
        username: author.username,
        displayName: author.displayName,
        userAvatar: author.userAvatar,
        createdAt: new Date(m.timestamp).toISOString(),
        _queued: true,
      }));
      if ((Array.isArray(cached) && cached.length) || queued.length) {
        apply((prev) => [...merge(prev, Array.isArray(cached) ? cached : []), ...queued.filter((q) => !prev.some((p) => p.id === q.id))].sort((a, b) => ts(a) - ts(b)));
        setLoading(false);
      }
    });
    T.getMessages(tribeId, PAGE)
      .then((page) => {
        if (cancelled) return;
        apply((prev) => merge(prev, page));
        setHasMore(page.length === PAGE);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    refreshPinned();
    refreshSettings();
    T.resetUnread(tribeId).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tribeId, author.uid, author.username, author.displayName, author.userAvatar, cacheKey, outboxKey, apply, refreshPinned, refreshSettings]);

  // ─── Live ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tribeId || !author.uid) return;
    let readTimer = null;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(readTimer);
      readTimer = setTimeout(() => realtime.read(tribeId), 1500);
    };
    const off = realtime.subscribe(tribeId, {
      getSince: () => latest.current,
      onSubscribed: (f) => {
        if (f.resync) reloadNewest().catch(() => {});
        else if (f.backlog?.length) apply((prev) => merge(prev, f.backlog));
        refreshPinned();
        refreshSettings();
      },
      onEvent: (e) => {
        switch (e.type) {
          case "message.created":
            apply((prev) => merge(prev, [e.message]));
            setTyping((t) => t.filter((x) => x.id !== e.message.userId));
            markRead();
            break;
          case "message.updated":
            apply((prev) => (prev.some((m) => m.id === e.message.id) ? merge(prev, [e.message]) : prev));
            break;
          case "message.deleted":
            apply((prev) => prev.filter((m) => m.id !== e.messageId));
            setPinned((p) => p.filter((m) => m.id !== e.messageId));
            break;
          case "message.pinned":
          case "message.unpinned":
            apply((prev) => prev.map((m) => (m.id === e.messageId ? { ...m, isPinned: e.type === "message.pinned" } : m)));
            refreshPinned();
            break;
          case "messages.purged":
            apply((prev) => prev.filter((m) => m.userId !== e.userId));
            refreshPinned();
            break;
          case "settings.updated":
            setSettings(e.settings);
            break;
          case "typing":
            setTyping((t) => [...t.filter((x) => x.id !== e.user.id), { id: e.user.id, name: e.user.displayName || e.user.username || "Someone", until: Date.now() + TYPING_TTL_MS }]);
            break;
          case "unsubscribed":
            setError("You're no longer a member of this tribe.");
            break;
          default:
        }
      },
    });
    return () => {
      clearTimeout(readTimer);
      off();
    };
  }, [tribeId, author.uid, apply, reloadNewest, refreshPinned, refreshSettings]);

  // Typing indicators fade out.
  useEffect(() => {
    if (!typing.length) return;
    const id = setInterval(() => setTyping((t) => t.filter((x) => x.until > Date.now())), 1000);
    return () => clearInterval(id);
  }, [typing.length]);

  // Flush the outbox whenever we're (back) online.
  useEffect(() => {
    if (!tribeId || !author.uid) return;
    const go = () => flush();
    if (live) go();
    window.addEventListener("online", go);
    return () => window.removeEventListener("online", go);
  }, [tribeId, author.uid, live, flush, messages.length]);

  // ─── Polling fallback (only while the socket isn't open) ──────────────────
  useEffect(() => {
    if (!tribeId || !author.uid || live) return;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      pollCount.current += 1;
      try {
        if (pollCount.current % RECONCILE_EVERY === 0) {
          await reloadNewest();
          refreshPinned();
          refreshSettings();
        } else if (latest.current) {
          const fresh = await T.pollMessages(tribeId, latest.current);
          if (fresh.length) apply((prev) => merge(prev, fresh));
        }
        if (messagesRef.current.some((m) => m._queued) && navigator.onLine !== false) flush();
      } catch {
        // transient — next tick retries
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [tribeId, author.uid, live, apply, reloadNewest, refreshPinned, refreshSettings, flush]);

  // ─── Actions ──────────────────────────────────────────────────────────────
  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore) return;
    const oldest = messages.find((m) => !m._pending && !m._failed && !m._queued);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const page = await T.getMessages(tribeId, PAGE, ts(oldest));
      apply((prev) => merge(prev, page));
      setHasMore(page.length === PAGE);
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMore, messages, tribeId, apply]);

  const send = useCallback(
    (text, replyTo = null) => {
      const clean = text.trim();
      if (!clean) return Promise.resolve(null);
      const now = Date.now();
      const m = {
        id: `_tmp_${now}_${Math.random().toString(36).slice(2, 6)}`,
        _clientId: newClientId(),
        userId: author.uid,
        username: author.username,
        displayName: author.displayName,
        userAvatar: author.userAvatar,
        text: clean,
        replyTo,
        timestamp: now,
        createdAt: new Date(now).toISOString(),
        _pending: true,
      };
      apply((prev) => [...prev, m]);
      messagesRef.current = [...messagesRef.current, m];
      // Keep order: if older messages are still queued, this one waits behind them.
      if (messagesRef.current.some((x) => x._queued && x.id !== m.id)) {
        apply((prev) => prev.map((x) => (x.id === m.id ? { ...x, _pending: false, _queued: true } : x)));
        flush();
        return Promise.resolve(null);
      }
      return deliver(m);
    },
    [author, apply, deliver, flush],
  );

  const retry = useCallback(
    (tempId) => {
      const m = messages.find((x) => x.id === tempId);
      if (!m) return;
      apply((prev) => prev.map((x) => (x.id === tempId ? { ...x, _failed: false, _pending: true } : x)));
      deliver(m);
    },
    [messages, apply, deliver],
  );

  const discard = useCallback((tempId) => apply((prev) => prev.filter((m) => m.id !== tempId)), [apply]);

  /** Call on input; tells others you're typing (throttled). */
  const notifyTyping = useCallback(() => {
    if (!live || Date.now() - lastTypingSent.current < TYPING_SEND_MS) return;
    lastTypingSent.current = Date.now();
    realtime.typing(tribeId, profile());
  }, [live, tribeId, profile]);

  const remove = useCallback(
    async (messageId) => {
      apply((prev) => prev.filter((m) => m.id !== messageId));
      setPinned((p) => p.filter((m) => m.id !== messageId));
      await T.deleteMessage(tribeId, messageId);
    },
    [tribeId, apply],
  );

  const togglePin = useCallback(
    async (message) => {
      const pin = !message.isPinned;
      apply((prev) => prev.map((m) => (m.id === message.id ? { ...m, isPinned: pin } : m)));
      await (pin ? T.pinMessage(tribeId, message.id) : T.unpinMessage(tribeId, message.id));
      refreshPinned();
    },
    [tribeId, apply, refreshPinned],
  );

  const removeAllFrom = useCallback(
    async (userId) => {
      apply((prev) => prev.filter((m) => m.userId !== userId));
      await T.deleteAllUserMessages(tribeId, userId);
      refreshPinned();
    },
    [tribeId, apply, refreshPinned],
  );

  return {
    messages,
    pinned,
    settings,
    setSettings,
    loading,
    loadingOlder,
    hasMore,
    error,
    live,
    status,
    typing: typing.map((t) => t.name),
    loadOlder,
    send,
    retry,
    discard,
    notifyTyping,
    remove,
    togglePin,
    removeAllFrom,
  };
}
