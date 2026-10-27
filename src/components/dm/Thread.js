"use client";
// components/dm/Thread.js — one conversation: request handling, decrypted
// timeline (replies, reactions, edits, unsends, images, read receipts),
// composer, and the safety tools (safety number, key-change notice, block,
// report).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  IoArrowBack,
  IoArrowUndoOutline,
  IoCheckmarkCircle,
  IoClose,
  IoCopyOutline,
  IoEllipsisHorizontal,
  IoHappyOutline,
  IoImageOutline,
  IoLockClosed,
  IoPencilOutline,
  IoSend,
  IoShieldCheckmarkOutline,
  IoTrashOutline,
  IoWarningOutline,
  IoNotificationsOffOutline,
  IoPinOutline,
  IoBanOutline,
  IoFlagOutline,
} from "react-icons/io5";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Popover, { PopoverItem } from "@/components/ui/Popover";
import Spinner from "@/components/ui/Spinner";
import { useFeedback } from "@/contexts/FeedbackContext";
import { formatDay, formatTime } from "@/lib/format";
import { useNow } from "@/hooks/useNow";
import { useDm, useProfiles, useThread } from "./DmProvider";
import { displayName } from "./ConversationList";

const QUICK = ["❤️", "😂", "👍", "🔥", "😮", "😢"];
const EDIT_WINDOW_MS = 15 * 60_000;
const MAX_FILE = 10 * 1024 * 1024;

// ─── Attachments ─────────────────────────────────────────────────────────────
const blobUrls = new Map(); // attachment id → object URL (decrypted once per session)

function AttachmentImage({ att }) {
  const { client } = useDm();
  const [url, setUrl] = useState(() => blobUrls.get(att.id) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url) return;
    let live = true;
    client
      .downloadAttachment(att)
      .then((bytes) => {
        const u = URL.createObjectURL(new Blob([bytes], { type: att.mime }));
        blobUrls.set(att.id, u);
        if (live) setUrl(u);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [att, client, url]);
  const ratio = att.width && att.height ? `${att.width} / ${att.height}` : "4 / 3";
  if (failed) return <div className="rounded-xl bg-hover px-3 py-6 text-center text-xs text-text-tertiary">Couldn’t open this file</div>;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={att.name ?? ""} className="max-h-[320px] w-full rounded-xl object-cover" style={{ aspectRatio: ratio }} />
  ) : (
    <div className="flex w-[240px] max-w-full animate-pulse items-center justify-center rounded-xl bg-hover" style={{ aspectRatio: ratio }}>
      <IoImageOutline size={22} className="text-text-tertiary" />
    </div>
  );
}

async function imageMeta(file) {
  try {
    const bmp = await createImageBitmap(file);
    const m = { width: bmp.width, height: bmp.height };
    bmp.close();
    return m;
  } catch {
    return {};
  }
}

// ─── Safety ──────────────────────────────────────────────────────────────────
function SafetyNumber({ open, onClose, peer, name, onAcceptChange, onVerify }) {
  if (!peer) return null;
  const groups = peer.safetyNumber?.split(" ") ?? [];
  return (
    <Modal open={open} onClose={onClose} labelledBy="dm-safety-title">
      <h2 id="dm-safety-title" className="text-xl font-extrabold text-text">Safety number</h2>
      {peer.keyChanged ? (
        <p className="mt-2 flex gap-2 rounded-xl bg-warning/10 p-3 text-sm text-text">
          <IoWarningOutline size={18} className="shrink-0 text-warning" />
          {name}’s security keys changed. This happens when they reset their keys — or if someone is trying to intercept. Compare the number below with them before continuing.
        </p>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">Compare these numbers with {name}, in person or on a call. If they match, your conversation is private.</p>
      )}
      <div className="mt-4 grid grid-cols-4 gap-x-4 gap-y-2 rounded-2xl bg-surface p-4 text-center font-mono text-lg font-semibold tracking-wider text-text">
        {groups.map((g, i) => <span key={i}>{g}</span>)}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {peer.keyChanged ? (
          <Button title="I’ve checked — continue" fullWidth onClick={onAcceptChange} />
        ) : (
          <Button title={peer.verified ? "Mark as not verified" : "Mark as verified"} variant={peer.verified ? "outline" : "primary"} fullWidth onClick={() => onVerify(!peer.verified)} />
        )}
        <Button title="Close" variant="ghost" fullWidth onClick={onClose} />
      </div>
    </Modal>
  );
}

const REASONS = [
  ["spam", "Spam"],
  ["scam", "Scam or fraud"],
  ["harassment", "Harassment"],
  ["impersonation", "Impersonation"],
  ["other", "Something else"],
];

function Report({ open, onClose, name, theirMessages, onSubmit }) {
  const [reason, setReason] = useState("spam");
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const recent = theirMessages.slice(-10);
  return (
    <Modal open={open} onClose={onClose} labelledBy="dm-report-title">
      <h2 id="dm-report-title" className="text-xl font-extrabold text-text">Report {name}</h2>
      <p className="mt-2 text-sm text-text-secondary">
        Your report includes their last {recent.length} {recent.length === 1 ? "message" : "messages"}, decryptable only by our safety team. Nothing else in this chat is shared.
      </p>
      <div className="mt-4 space-y-1" role="radiogroup">
        {REASONS.map(([id, label]) => (
          <label key={id} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-hover">
            <input type="radio" name="reason" checked={reason === id} onChange={() => setReason(id)} className="accent-[var(--primary)]" />
            <span className="text-md text-text">{label}</span>
          </label>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-center gap-3 px-3 text-sm text-text">
        <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="accent-[var(--primary)]" /> Also block {name}
      </label>
      <Button
        title="Send report"
        variant="danger"
        fullWidth
        className="mt-5"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit(recent, reason, block);
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      />
    </Modal>
  );
}

// ─── Messages ────────────────────────────────────────────────────────────────
function Bubble({ m, now, quoted, quotedName, seen, onReply, onReact, onEdit, onUnsend, active, setActive }) {
  const mine = m.mine;
  const p = m.payload;
  const reactions = Object.values(m.reactions ?? {});
  const counts = reactions.reduce((o, e) => ((o[e] = (o[e] ?? 0) + 1), o), {});
  const editable = mine && !m.deleted && p?.kind === "text" && p.text && now - Date.parse(m.createdAt) < EDIT_WINDOW_MS;

  let body;
  if (m.deleted) body = <span className="italic text-text-tertiary">Message deleted</span>;
  else if (m.error)
    body = (
      <span className="flex items-center gap-1.5 text-text-tertiary">
        <IoWarningOutline size={14} /> This message couldn’t be verified
      </span>
    );
  else
    body = (
      <>
        {p?.attachments?.map((a) => <AttachmentImage key={a.id} att={a} />)}
        {m.text && <span className="whitespace-pre-wrap break-words">{m.text}</span>}
      </>
    );

  return (
    <div className={`group flex flex-col ${mine ? "items-end" : "items-start"}`} onClick={() => setActive(active ? null : m.id)}>
      {quoted !== undefined && (
        <div className={`mb-0.5 max-w-[75%] truncate rounded-xl border-l-2 border-primary/60 bg-hover px-3 py-1 text-xs text-text-secondary ${mine ? "mr-1" : "ml-1"}`}>
          <span className="font-semibold">{quotedName}</span> · {quoted ?? "Original message unavailable"}
        </div>
      )}
      <div className={`flex max-w-[78%] items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
        <div
          className={`flex flex-col gap-1.5 rounded-[20px] px-3.5 py-2 text-md ${
            mine ? "rounded-br-md bg-primary text-on-primary" : "rounded-bl-md bg-surface text-text"
          } ${p?.attachments?.length ? "p-1.5" : ""}`}
        >
          {body}
        </div>
        {!m.deleted && !m.error && (
          <div className={`flex items-center gap-0.5 transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} onClick={(e) => e.stopPropagation()}>
            <ReactPicker onPick={(e) => onReact(m.id, e === m.reactions?.[m.senderId] ? null : e)} />
            <IconBtn label="Reply" Icon={IoArrowUndoOutline} onClick={() => onReply(m)} />
            {m.text && <IconBtn label="Copy" Icon={IoCopyOutline} onClick={() => navigator.clipboard?.writeText(m.text)} />}
            {editable && <IconBtn label="Edit" Icon={IoPencilOutline} onClick={() => onEdit(m)} />}
            {mine && <IconBtn label="Unsend" Icon={IoTrashOutline} onClick={() => onUnsend(m)} />}
          </div>
        )}
      </div>
      {reactions.length > 0 && (
        <div className={`-mt-1.5 flex gap-1 ${mine ? "mr-2" : "ml-2"}`}>
          {Object.entries(counts).map(([e, n]) => (
            <span key={e} className="rounded-full border border-panel-border bg-[var(--panel-bg-strong)] px-1.5 py-0.5 text-xs">
              {e}
              {n > 1 && <span className="ml-0.5 text-text-tertiary">{n}</span>}
            </span>
          ))}
        </div>
      )}
      <span className="mt-0.5 px-1 text-[11px] text-text-tertiary">
        {formatTime(Date.parse(m.createdAt))}
        {m.editedAt && " · Edited"}
        {seen && " · Seen"}
      </span>
    </div>
  );
}

function IconBtn({ label, Icon, onClick }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary hover:bg-hover hover:text-text">
      <Icon size={15} />
    </button>
  );
}

function ReactPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <button ref={ref} type="button" aria-label="React" title="React" onClick={() => setOpen((v) => !v)} className="flex h-7 w-7 items-center justify-center rounded-full text-text-tertiary hover:bg-hover hover:text-text">
        <IoHappyOutline size={16} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} placement="bottom-start" className="!min-w-0 !py-1.5">
        <div className="flex gap-1 px-2">
          {QUICK.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                onPick(e);
                setOpen(false);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-hover"
            >
              {e}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────
// Keyed by the message being edited, so entering edit mode starts from its text.
function Composer({ disabled, placeholder, replyTo, replyName, editing, onCancel, onSend, onTyping, onUpload }) {
  const [text, setText] = useState(editing?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ta = useRef(null);
  const file = useRef(null);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(t);
      setText("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      ta.current?.focus();
    }
  };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Only images for now.");
    if (f.size > MAX_FILE) return setError("Images can be at most 10 MB.");
    setBusy(true);
    setError(null);
    try {
      await onUpload(f, text.trim());
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-panel-border px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2 md:pb-3">
      {(replyTo || editing) && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-hover px-3 py-2 text-xs text-text-secondary">
          {editing ? <IoPencilOutline size={14} /> : <IoArrowUndoOutline size={14} />}
          <span className="min-w-0 flex-1 truncate">
            {editing ? "Editing message" : <>Replying to <span className="font-semibold">{replyName}</span> · {replyTo.text ?? "message"}</>}
          </span>
          <button type="button" aria-label="Cancel" onClick={() => (onCancel(), setText(""))} className="text-text-tertiary hover:text-text">
            <IoClose size={16} />
          </button>
        </div>
      )}
      {error && <p className="mb-2 px-1 text-xs text-error">{error}</p>}
      <div className="flex items-end gap-2">
        {!editing && (
          <>
            <input ref={file} type="file" accept="image/*" className="sr-only" onChange={pick} disabled={disabled} />
            <button type="button" aria-label="Add image" title="Add image" disabled={disabled || busy} onClick={() => file.current?.click()} className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary hover:bg-primary/10 disabled:opacity-40">
              <IoImageOutline size={20} />
            </button>
          </>
        )}
        <div className="flex min-h-[44px] flex-1 items-center rounded-[22px] bg-surface px-4 focus-within:shadow-[inset_0_0_0_1px_var(--primary)]">
          <textarea
            ref={ta}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              onTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape" && (replyTo || editing)) onCancel();
            }}
            placeholder={placeholder}
            aria-label="Message"
            maxLength={10_000}
            className="max-h-40 w-full resize-none bg-transparent py-2.5 text-md text-text outline-none placeholder:text-text-tertiary disabled:opacity-50"
          />
        </div>
        <button type="button" aria-label="Send" disabled={disabled || busy || !text.trim()} onClick={submit} className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary transition-opacity disabled:opacity-40">
          {busy ? <Spinner size={16} className="text-on-primary" /> : <IoSend size={17} />}
        </button>
      </div>
    </div>
  );
}

// ─── Thread ──────────────────────────────────────────────────────────────────
export default function Thread({ conversationId, onBack, onClosed }) {
  const { client, uid } = useDm();
  const { showAlert } = useFeedback();
  const t = useThread(conversationId);
  const c = t.conversation;
  const otherId = c ? Object.keys(c.bundles).find((u) => u !== uid) : null;
  const profiles = useProfiles(otherId ? [otherId, uid] : []);
  const name = displayName(profiles[otherId], otherId);
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [active, setActive] = useState(null);
  const [safety, setSafety] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const scroller = useRef(null);
  const atBottom = useRef(true);
  const now = useNow(30_000);

  const rows = t.rows;
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const peerRead = c?.participants?.[0]?.lastReadSeq ?? null;
  const lastMine = [...rows].reverse().find((r) => r.mine && !r.deleted);

  // Stick to the bottom as messages arrive (unless the user scrolled up).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [rows.length, t.typing]);

  if (t.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="font-bold text-text">Couldn’t open this conversation</p>
        <p className="mt-1 text-sm text-text-tertiary">{t.error.message}</p>
        {onBack && <Button title="Back" variant="ghost" className="mt-4" onClick={onBack} />}
      </div>
    );
  }
  if (!c) return <div className="flex h-full items-center justify-center"><Spinner /></div>;

  const muted = c.me.mutedUntil && Date.parse(c.me.mutedUntil) > now;
  const iRequested = c.status === "request" && !c.isRequest;
  const rejectedMe = c.status === "rejected" && c.requestedBy === uid;
  const act = async (fn, after) => {
    try {
      await fn();
      after?.();
    } catch (e) {
      showAlert("Something went wrong", e.message);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-panel-border px-3 py-2.5 md:px-4">
        {onBack && (
          <button type="button" aria-label="Back" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-hover md:hidden">
            <IoArrowBack size={20} />
          </button>
        )}
        <Avatar src={profiles[otherId]?.avatarUrl} size={40} />
        <button type="button" onClick={() => setSafety(true)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1 truncate font-bold text-text">
            {name}
            {t.peer?.verified && <IoCheckmarkCircle size={15} className="shrink-0 text-primary" aria-label="Verified" />}
          </span>
          <span className="flex items-center gap-1 text-xs text-text-tertiary">
            <IoLockClosed size={10} /> {t.typing ? <span className="text-primary">typing…</span> : `@${profiles[otherId]?.username ?? "…"} · Encrypted`}
          </span>
        </button>
        <button ref={menuRef} type="button" aria-label="Conversation options" onClick={() => setMenu((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-hover hover:text-text">
          <IoEllipsisHorizontal size={20} />
        </button>
        <Popover open={menu} onClose={() => setMenu(false)} anchorRef={menuRef} placement="bottom-end">
          <PopoverItem Icon={IoShieldCheckmarkOutline} onClick={() => (setMenu(false), setSafety(true))}>Safety number</PopoverItem>
          <PopoverItem Icon={IoNotificationsOffOutline} onClick={() => (setMenu(false), act(() => client.setPrefs(c.id, { mutedUntil: muted ? null : new Date(Date.now() + 8 * 3_600_000).toISOString() }), t.refresh))}>
            {muted ? "Unmute" : "Mute for 8 hours"}
          </PopoverItem>
          <PopoverItem Icon={IoPinOutline} onClick={() => (setMenu(false), act(() => client.setPrefs(c.id, { pinned: !c.me.pinnedAt }), t.refresh))}>
            {c.me.pinnedAt ? "Unpin" : "Pin conversation"}
          </PopoverItem>
          <PopoverItem Icon={IoBanOutline} onClick={() => (setMenu(false), act(() => client.block(otherId), () => showAlert("Blocked", `${name} can’t message you. Unblock in Settings.`)))}>
            Block {name}
          </PopoverItem>
          <PopoverItem Icon={IoFlagOutline} onClick={() => (setMenu(false), setReporting(true))}>Report</PopoverItem>
          <PopoverItem Icon={IoTrashOutline} className="text-error" onClick={() => (setMenu(false), act(() => client.hide(c.id), onClosed))}>
            Delete for me
          </PopoverItem>
        </Popover>
      </div>

      {t.peer?.keyChanged && (
        <button type="button" onClick={() => setSafety(true)} className="flex items-center gap-2 bg-warning/10 px-4 py-2.5 text-left text-sm text-text">
          <IoWarningOutline size={18} className="shrink-0 text-warning" />
          <span className="flex-1">{name}’s security keys changed. Tap to review.</span>
        </button>
      )}

      {/* Timeline */}
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 60 && t.hasOlder) t.loadOlder();
        }}
        className="panel-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 md:px-5"
      >
        <div className="mx-auto mb-4 max-w-[320px] rounded-2xl bg-hover px-4 py-3 text-center text-xs text-text-tertiary">
          <IoLockClosed size={12} className="mr-1 inline" />
          Messages are end-to-end encrypted. No one outside this chat — not even Sysfi — can read them.
        </div>
        {t.hasOlder && <div className="flex justify-center py-2"><Spinner size={18} /></div>}
        {rows.map((m, i) => {
          const day = formatDay(Date.parse(m.createdAt));
          const newDay = i === 0 || formatDay(Date.parse(rows[i - 1].createdAt)) !== day;
          const sep = newDay ? <p className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{day}</p> : null;
          const replyId = m.payload?.replyTo;
          const q = replyId ? byId.get(replyId) : null;
          return (
            <div key={m.id}>
              {sep}
              <Bubble
                m={m}
                now={now}
                quoted={replyId ? (q && !q.deleted ? q.text ?? "Photo" : null) : undefined}
                quotedName={q ? (q.mine ? "You" : name) : ""}
                seen={peerRead != null && lastMine?.id === m.id && peerRead >= m.seq}
                active={active === m.id}
                setActive={setActive}
                onReply={(x) => (setEditing(null), setReplyTo(x))}
                onEdit={(x) => (setReplyTo(null), setEditing(x))}
                onReact={(id, e) => act(() => t.react(id, e))}
                onUnsend={(x) => act(() => t.unsend(x.id))}
              />
            </div>
          );
        })}
        {t.typing && <div className="ml-1 w-fit rounded-[20px] bg-surface px-4 py-2.5 text-text-tertiary"><span className="animate-pulse">•••</span></div>}
      </div>

      {/* Request states + composer */}
      {c.isRequest ? (
        <div className="border-t border-panel-border p-4 text-center">
          <p className="font-bold text-text">{name} wants to message you</p>
          <p className="mt-1 text-sm text-text-tertiary">They won’t know you’ve seen their message until you accept. Deleting is silent.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button title="Block" variant="ghost" size="small" onClick={() => act(() => client.reject(c.id, { block: true }), onClosed)} />
            <Button title="Delete" variant="outline" size="small" onClick={() => act(() => client.reject(c.id), onClosed)} />
            <Button title="Accept" size="small" onClick={() => act(() => client.accept(c.id), t.refresh)} />
          </div>
        </div>
      ) : rejectedMe ? (
        <p className="border-t border-panel-border p-4 text-center text-sm text-text-tertiary">You can’t send messages in this conversation.</p>
      ) : (
        <>
          {iRequested && <p className="px-4 pt-2 text-center text-xs text-text-tertiary">Message request sent. You can send up to 5 messages until {name} accepts.</p>}
          <Composer
            key={editing?.id ?? "new"}
            placeholder="Start a message"
            replyTo={replyTo}
            replyName={replyTo?.mine ? "yourself" : name}
            editing={editing}
            onCancel={() => (setReplyTo(null), setEditing(null))}
            onTyping={t.notifyTyping}
            onSend={async (text) => {
              if (editing) {
                await t.edit(editing.id, text);
                setEditing(null);
              } else {
                await t.sendText(text, { replyTo: replyTo?.id ?? null });
                setReplyTo(null);
              }
              atBottom.current = true;
            }}
            onUpload={async (f, caption) => {
              const meta = await imageMeta(f);
              const att = await t.upload(new Uint8Array(await f.arrayBuffer()), { mime: f.type, name: f.name, ...meta });
              await t.sendText(caption, { attachments: [att], replyTo: replyTo?.id ?? null });
              setReplyTo(null);
              atBottom.current = true;
            }}
          />
        </>
      )}

      <SafetyNumber
        open={safety}
        onClose={() => setSafety(false)}
        peer={t.peer}
        name={name}
        onAcceptChange={() => act(() => client.acceptKeyChange(otherId), () => (setSafety(false), t.refresh()))}
        onVerify={(v) => act(() => client.setVerified(otherId, v), t.refresh)}
      />
      <Report
        open={reporting}
        onClose={() => setReporting(false)}
        name={name}
        theirMessages={t.messages.filter((m) => !m.mine && !m.deleted && !m.error)}
        onSubmit={(msgs, reason, block) => act(() => client.report(c.id, msgs, reason, { block }), () => showAlert("Thanks for reporting", "Our safety team will review it."))}
      />
    </div>
  );
}
