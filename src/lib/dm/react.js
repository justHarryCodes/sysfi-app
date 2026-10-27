"use client";
// lib/dm/react.js — React state for direct messages, shared by the web app and
// the mobile app (metro maps @/lib → web/src/lib). The platform supplies:
//   <DmProvider uid makeHttp={(uid) => http} makeStore={(uid) => store}
//               realtime={{ hold(), onEvent(fn), dmTyping(id), dmRead(id, seq) }}>
// (makeHttp / makeStore / realtime must be stable — module-level values.)
// Hooks:
//   useDm()               { client, uid, status, refreshStatus }
//   useConversations(box) { items, loading, error, loadMore, reload }
//   useThread(id)         { conversation, rows, … , sendText, react, edit, unsend, loadOlder }
//   useProfiles(uids)     { [uid]: profile }
// Everything decrypts on this device; the server only relays ciphertext.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DmClient, foldMessages } from "./client.js";

const DmContext = createContext(null);

export function DmProvider({ uid, makeHttp, makeStore, realtime, children }) {
  const client = useMemo(() => (uid ? new DmClient({ uid, http: makeHttp(uid), store: makeStore(uid) }) : null), [uid, makeHttp, makeStore]);
  const [status, setStatus] = useState({ state: "loading" });
  const [profileCache] = useState(() => new Map());

  const refreshStatus = useCallback(async () => {
    if (!client) return;
    try {
      await client.loadRing();
      setStatus(await client.status());
    } catch (e) {
      setStatus({ state: "error", error: e.message });
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let live = true;
    (async () => {
      try {
        await client.loadRing();
        const s = await client.status();
        if (live) setStatus(s);
      } catch (e) {
        if (live) setStatus({ state: "error", error: e.message });
      }
    })();
    return () => {
      live = false;
    };
  }, [client]);

  // Live feed: keep the socket open while DMs are mounted; decrypt dm.* events.
  useEffect(() => {
    if (!client) return;
    const release = realtime.hold();
    const off = realtime.onEvent((f) => {
      if (f.type?.startsWith("dm.")) client.handleEvent(f).catch(() => {});
    });
    return () => {
      off();
      release();
    };
  }, [client, realtime]);

  const value = useMemo(() => ({ client, uid, status, refreshStatus, profileCache, realtime }), [client, uid, status, refreshStatus, profileCache, realtime]);
  return <DmContext.Provider value={value}>{children}</DmContext.Provider>;
}

export function useDm() {
  const v = useContext(DmContext);
  if (!v) throw new Error("useDm must be used inside <DmProvider>");
  return v;
}

/** Subscribes to decrypted client events. */
function useDmEvents(handler) {
  const { client } = useDm();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => client?.on((e) => ref.current(e)), [client]);
}

// ─── Profiles ────────────────────────────────────────────────────────────────
export function useProfiles(uids) {
  const { client, profileCache } = useDm();
  const key = [...new Set(uids)].filter(Boolean).sort().join(",");
  const [, bump] = useState(0);
  useEffect(() => {
    const missing = key ? key.split(",").filter((u) => !profileCache.has(u)) : [];
    if (!client || !missing.length) return;
    let live = true;
    client.profiles(missing).then((p) => {
      for (const u of missing) profileCache.set(u, p[u] ?? null);
      if (live) bump((n) => n + 1);
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [client, key, profileCache]);
  return Object.fromEntries((key ? key.split(",") : []).map((u) => [u, profileCache.get(u)]));
}

// ─── Inbox / requests ────────────────────────────────────────────────────────
export function useConversations(box = "inbox") {
  const { client, status } = useDm();
  const [state, setState] = useState({ items: [], next: null, loading: true, error: null });
  const ready = status.state === "ready";

  const decorate = useCallback(
    async (rows) =>
      Promise.all(
        rows.map(async (r) => ({ ...r, preview: r.lastMessage ? await client.decrypt(r, r.lastMessage) : null })),
      ),
    [client],
  );

  const load = useCallback(
    async (before) => {
      if (!client || !ready) return;
      try {
        const page = await client.list({ box, before });
        const items = await decorate(page.conversations);
        setState((s) => ({ items: before ? [...s.items, ...items] : items, next: page.next, loading: false, error: null }));
      } catch (e) {
        setState((s) => ({ ...s, loading: false, error: e.message }));
      }
    },
    [client, ready, box, decorate],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Any message / conversation change → refresh the first page (cheap; ≤ 30 rows).
  const timer = useRef(null);
  useDmEvents((e) => {
    if (!["message", "conversation", "message.deleted", "read"].includes(e.type)) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(), 150);
  });

  return { ...state, reload: () => load(), loadMore: () => state.next && load(state.next) };
}

// ─── One conversation ────────────────────────────────────────────────────────
// Mount once per conversation (key the component by id): state starts fresh.
const PAGE = 50;

export function useThread(conversationId) {
  const { client, uid, status, realtime } = useDm();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]); // decrypted, ascending, incl. reactions/edits
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState(null);
  const [typing, setTyping] = useState(false);
  const [peer, setPeer] = useState(null);
  const typingTimer = useRef(null);
  const ready = status.state === "ready" && !!conversationId;

  const merge = useCallback((incoming) => {
    setMessages((cur) => {
      const byId = new Map(cur.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.seq - b.seq);
    });
  }, []);

  const refreshConversation = useCallback(async () => {
    const c = await client.open(conversationId);
    setConversation(c);
    const other = Object.keys(c.bundles).find((u) => u !== uid);
    if (other) setPeer(await client.peer(other).catch(() => null));
    return c;
  }, [client, conversationId, uid]);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    (async () => {
      try {
        const c = await refreshConversation();
        const page = await client.history(c, { limit: PAGE });
        if (!live) return;
        setMessages(page);
        setHasOlder(page.length === PAGE);
      } catch (e) {
        if (live) setError(e);
      }
    })();
    return () => {
      live = false;
    };
  }, [ready, client, refreshConversation]);

  // Mark read when new messages from the other side arrive (socket, else HTTP).
  const lastSeq = messages.at(-1)?.seq ?? 0;
  useEffect(() => {
    if (!conversation || !lastSeq || conversation.isRequest) return;
    if (!realtime.dmRead(conversation.id, lastSeq)) client.markRead(conversation.id, lastSeq).catch(() => {});
  }, [client, conversation, lastSeq, realtime]);

  useDmEvents((e) => {
    if (e.conversationId !== conversationId) return;
    if (e.type === "message") {
      merge([e.message]);
      if (e.message.senderId !== uid) setTyping(false);
    } else if (e.type === "message.deleted") {
      setMessages((cur) => cur.map((m) => (m.id === e.messageId ? { ...m, deleted: true, payload: null } : m)));
    } else if (e.type === "typing" && e.userId !== uid) {
      setTyping(true);
      clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 5000);
    } else if (e.type === "read" && e.userId !== uid) {
      setConversation((c) => (c ? { ...c, participants: c.participants.map((p) => (p.userId === e.userId ? { ...p, lastReadSeq: e.seq } : p)) } : c));
    } else if (e.type === "conversation") {
      refreshConversation().catch(() => {});
    }
  });

  const loadOlder = useCallback(async () => {
    const first = messages[0]?.seq;
    if (!first || !conversation) return;
    const page = await client.history(conversation, { before: first, limit: PAGE });
    merge(page);
    setHasOlder(page.length === PAGE);
  }, [client, conversation, messages, merge]);

  // Sends append optimistically from the server's echo (the socket also delivers it; merge dedupes).
  const wrap = (fn) => async (...args) => {
    const { message, payload } = await fn(...args);
    merge([{ id: message.id, seq: message.seq, senderId: uid, createdAt: message.createdAt, epoch: message.epoch, mine: true, deleted: false, payload }]);
    return message;
  };

  const lastTyped = useRef(0);
  const notifyTyping = useCallback(() => {
    if (!conversation || conversation.status !== "active" || Date.now() - lastTyped.current < 3000) return;
    lastTyped.current = Date.now();
    if (!realtime.dmTyping(conversation.id)) client.typing(conversation.id).catch(() => {});
  }, [client, conversation, realtime]);

  return {
    conversation,
    peer,
    rows: useMemo(() => foldMessages(messages), [messages]),
    messages,
    hasOlder,
    error,
    typing,
    loadOlder,
    notifyTyping,
    refresh: refreshConversation,
    sendText: wrap((text, opts) => client.sendText(conversationId, text, opts)),
    react: wrap((target, emoji) => client.react(conversationId, target, emoji)),
    edit: wrap((target, text) => client.edit(conversationId, target, text)),
    unsend: async (id) => {
      await client.unsend(id);
      setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, deleted: true, payload: null } : m)));
    },
    upload: (bytes, meta) => client.uploadAttachment(conversationId, bytes, meta),
  };
}
