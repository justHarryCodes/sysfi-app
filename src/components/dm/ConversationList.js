"use client";
// components/dm/ConversationList.js — Inbox / Requests with decrypted
// previews, unread counts and a "New message" dialog (look up by username).
import { useState } from "react";
import { IoCreateOutline, IoSettingsOutline, IoNotificationsOffOutline, IoPin, IoSearchOutline, IoLockClosed } from "react-icons/io5";
import Avatar from "@/components/ui/Avatar";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { timeAgo } from "@/lib/format";
import { useNow } from "@/hooks/useNow";
import { useConversations, useDm, useProfiles } from "./DmProvider";

export const displayName = (p, uid) => p?.displayName || p?.username || (uid ? `${uid.slice(0, 6)}…` : "Someone");

export function previewText(preview, uid) {
  if (!preview) return "No messages yet";
  if (preview.deleted) return "Message deleted";
  if (preview.error) return "Encrypted message";
  const p = preview.payload;
  const who = preview.senderId === uid ? "You: " : "";
  if (p?.kind === "reaction") return `${who}reacted ${p.emoji ?? ""}`.trim();
  if (p?.kind === "edit") return `${who}${p.text}`;
  if (p?.attachments?.length && !p.text) return `${who}📷 Photo`;
  return `${who}${p?.text ?? ""}`;
}

const CAN = {
  self: "That’s you.",
  no_keys: "They haven’t turned on encrypted messages yet.",
  not_accepting: "They aren’t accepting message requests.",
  blocked: "You can’t message this person.",
};

function NewMessage({ open, onClose, onOpen }) {
  const { client } = useDm();
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const search = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      setFound(await client.lookup(q.trim()));
    } catch (err) {
      setError(err.code === "NOT_FOUND" ? "No one by that username." : err.message);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    try {
      const { conversation } = await client.start(found.id);
      onOpen(conversation.id);
      onClose();
      setQ("");
      setFound(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="dm-new-title">
      <h2 id="dm-new-title" className="mb-4 text-xl font-extrabold text-text">New message</h2>
      <form onSubmit={search} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary">
        <IoSearchOutline size={18} className="text-text-tertiary" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Username" aria-label="Username" className="h-11 min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-tertiary" />
        {busy && !found && <Spinner size={16} />}
      </form>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      {found && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-panel-border p-3">
          <Avatar src={found.avatarUrl} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-text">{displayName(found)}</span>
            <span className="block truncate text-sm text-text-tertiary">@{found.username}</span>
          </span>
          {found.canMessage === "yes" || found.canMessage === "request" ? (
            <Button title={found.canMessage === "yes" ? "Open chat" : "Message"} size="small" loading={busy} onClick={start} />
          ) : null}
        </div>
      )}
      {found && CAN[found.canMessage] && <p className="mt-3 text-sm text-text-secondary">{CAN[found.canMessage]}</p>}
      {found?.canMessage === "request" && <p className="mt-3 text-xs text-text-tertiary">They’ll get a message request and can accept or delete it.</p>}
    </Modal>
  );
}

function Row({ c, active, onOpen, profile, uid }) {
  const now = useNow(60_000);
  const other = c.otherUserIds[0];
  const mine = c.preview?.senderId === uid;
  const seen = mine && c.othersReadSeq != null && c.othersReadSeq >= c.lastSeq;
  const muted = c.me.mutedUntil && Date.parse(c.me.mutedUntil) > now;
  return (
    <button
      type="button"
      onClick={() => onOpen(c.id)}
      aria-current={active ? "true" : undefined}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${active ? "bg-primary/10" : "hover:bg-hover"}`}
    >
      <Avatar src={profile?.avatarUrl} size={48} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={`truncate text-md ${c.unread ? "font-extrabold text-text" : "font-semibold text-text"}`}>{displayName(profile, other)}</span>
          {c.me.pinnedAt && <IoPin size={12} className="shrink-0 text-text-tertiary" aria-label="Pinned" />}
          {muted && <IoNotificationsOffOutline size={12} className="shrink-0 text-text-tertiary" aria-label="Muted" />}
          <span className="ml-auto shrink-0 text-xs text-text-tertiary">{timeAgo(Date.parse(c.lastMessageAt ?? c.createdAt))}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`truncate text-sm ${c.unread ? "font-semibold text-text" : "text-text-tertiary"}`}>
            {c.status === "request" && !c.isRequest ? "Request sent · " : ""}
            {previewText(c.preview, uid)}
          </span>
          {seen && <span className="shrink-0 text-[11px] font-semibold text-primary">✓✓</span>}
          {c.unread > 0 && (
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-on-primary">{c.unread > 99 ? "99+" : c.unread}</span>
          )}
        </span>
      </span>
    </button>
  );
}

export default function ConversationList({ activeId, onOpen, onSettings }) {
  const { uid } = useDm();
  const [box, setBox] = useState("inbox");
  const [composing, setComposing] = useState(false);
  const list = useConversations(box);
  const requests = useConversations("requests");
  const profiles = useProfiles([...list.items, ...requests.items].flatMap((c) => c.otherUserIds));
  const sorted = [...list.items].sort((a, b) => Number(!!b.me.pinnedAt) - Number(!!a.me.pinnedAt));
  const reqCount = requests.items.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h1 className="flex-1 text-xl font-extrabold tracking-[-0.3px] text-text">Messages</h1>
        <button type="button" onClick={onSettings} aria-label="Message settings" title="Settings" className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-hover hover:text-text">
          <IoSettingsOutline size={19} />
        </button>
        <button type="button" onClick={() => setComposing(true)} aria-label="New message" title="New message" className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-hover hover:text-text">
          <IoCreateOutline size={20} />
        </button>
      </div>
      <div role="tablist" className="mx-4 mb-2 flex gap-1 rounded-2xl bg-hover p-1">
        {[
          ["inbox", "Inbox"],
          ["requests", `Requests${reqCount ? ` (${reqCount})` : ""}`],
        ].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={box === id} onClick={() => setBox(id)} className={`h-8 flex-1 rounded-xl text-sm font-semibold transition-colors ${box === id ? "bg-primary text-on-primary" : "text-text-secondary hover:text-text"}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-text-tertiary">
        <IoLockClosed size={10} /> End-to-end encrypted
      </p>

      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto">
        {(box === "inbox" ? list : requests).loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : (box === "inbox" ? sorted : requests.items).length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-bold text-text">{box === "inbox" ? "No messages yet" : "No message requests"}</p>
            <p className="mt-1 text-sm text-text-tertiary">
              {box === "inbox" ? "Start a private, encrypted conversation." : "Messages from people you haven’t talked to show up here."}
            </p>
            {box === "inbox" && <Button title="New message" size="small" className="mt-4 rounded-full" onClick={() => setComposing(true)} />}
          </div>
        ) : (
          (box === "inbox" ? sorted : requests.items).map((c) => <Row key={c.id} c={c} uid={uid} active={c.id === activeId} onOpen={onOpen} profile={profiles[c.otherUserIds[0]]} />)
        )}
        {box === "inbox" && list.next && (
          <button type="button" onClick={list.loadMore} className="w-full py-3 text-sm font-semibold text-primary hover:bg-hover">Load more</button>
        )}
      </div>
      <NewMessage open={composing} onClose={() => setComposing(false)} onOpen={onOpen} />
    </div>
  );
}
