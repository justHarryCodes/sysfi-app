"use client";
// Tribe chat — port of TribeChatScreen (+ ChatMessage, ChatInput,
// PinnedMessageBanner, MessageActionsModal, UserActionsModal, AdminControlsModal).
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IoArrowBack,
  IoSend,
  IoPin,
  IoClose,
  IoEllipsisHorizontal,
  IoArrowUndoOutline,
  IoCopyOutline,
  IoTrashOutline,
  IoBanOutline,
  IoLockClosed,
  IoOptionsOutline,
  IoReload,
  IoTimeOutline,
  IoArrowDown,
} from "react-icons/io5";
import TribeScreen from "@/components/tribe/TribeScreen";
import { JoinButton } from "@/components/tribe/TribeHeader";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import Avatar from "@/components/ui/Avatar";
import { PersonLink } from "@/components/people/PersonCard";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Popover, { PopoverItem } from "@/components/ui/Popover";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useTribeChat } from "@/hooks/useTribeChat";
import { useTribeBots } from "@/hooks/bots";
import { BotAvatar, BotBadge, BotMessageExtras } from "@/components/bots/BotBits";
import { clickBotButton } from "@/lib/bots";
import { countLabel, formatDay, formatTime } from "@/lib/format";
import { banUser, tribeMembers, updateChatSettings } from "@/lib/tribeApi";

const GROUP_GAP_MS = 5 * 60_000;
const ts = (m) => (typeof m.timestamp === "number" ? m.timestamp : Date.parse(m.createdAt) || 0);
const MAX = 1000;

function MessageMenu({ message, mine, isOwner, onReply, onDelete, onPin, onPurge, onBan }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  const act = (fn) => () => {
    close();
    fn();
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label="Message actions"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-full p-1 text-text-tertiary opacity-0 transition-opacity hover:bg-hover hover:text-text group-hover:opacity-100 focus:opacity-100 ${open ? "opacity-100" : ""}`}
      >
        <IoEllipsisHorizontal size={16} />
      </button>
      <Popover open={open} onClose={close} anchorRef={btn} placement="bottom-end" className="min-w-[200px] py-1">
        <PopoverItem Icon={IoArrowUndoOutline} onClick={act(onReply)}>
          Reply
        </PopoverItem>
        <PopoverItem Icon={IoCopyOutline} onClick={act(() => navigator.clipboard.writeText(message.text))}>
          Copy text
        </PopoverItem>
        {isOwner && (
          <PopoverItem Icon={IoPin} onClick={act(onPin)}>
            {message.isPinned ? "Unpin" : "Pin message"}
          </PopoverItem>
        )}
        {(mine || isOwner) && (
          <PopoverItem Icon={IoTrashOutline} className="text-error" onClick={act(onDelete)}>
            Delete
          </PopoverItem>
        )}
        {isOwner && !mine && (
          <>
            <PopoverItem Icon={IoTrashOutline} className="text-error" onClick={act(onPurge)}>
              Delete all from {message.displayName || message.username}
            </PopoverItem>
            <PopoverItem Icon={IoBanOutline} className="text-error" onClick={act(onBan)}>
              Ban {message.displayName || message.username}
            </PopoverItem>
          </>
        )}
      </Popover>
    </>
  );
}

// @mentions stand out; everything else is plain text.
function MessageText({ text, mine }) {
  const parts = text.split(/(@[a-zA-Z0-9_]{2,30})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-[21px]">
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className={`font-semibold ${mine ? "" : "text-primary"}`}>
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </p>
  );
}

function Bubble({ m, mine, first, isOwner, chat, onReply, confirm, onButton }) {
  const name = m.displayName || m.username || "Member";
  const failed = m._failed;
  return (
    <div className={`group flex gap-2 px-4 ${first ? "mt-3" : "mt-0.5"} ${mine ? "flex-row-reverse" : ""}`}>
      <div className="w-8 shrink-0">
        {first && !mine && (m.isBot ? <BotAvatar src={m.userAvatar} size={32} /> : <PersonLink uid={m.userId} label={`View ${name}`}><Avatar src={m.userAvatar} size={32} /></PersonLink>)}
      </div>
      <div className={`flex min-w-0 max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
        {first && (
          <p className={`mb-0.5 flex items-center gap-1.5 px-1 text-xs ${mine ? "text-text-tertiary" : "font-semibold text-text-secondary"}`}>
            {mine ? "You" : m.isBot ? name : <PersonLink uid={m.userId}>{name}</PersonLink>}
            {m.isBot && <BotBadge />}
          </p>
        )}
        <div className={`flex items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
          <div
            className={`rounded-2xl px-3.5 py-2 ${mine ? "rounded-br-md bg-primary text-on-primary" : "rounded-bl-md bg-surface text-text"} ${
              m.isPinned ? "ring-1 ring-primary/50" : ""
            } ${failed ? "ring-2 ring-error/60" : ""} ${m._pending || m._queued ? "opacity-60" : ""}`}
          >
            {m.replyTo && (
              <div className={`mb-1.5 border-l-2 pl-2 text-xs ${mine ? "border-on-primary/40 text-on-primary/75" : "border-primary/60 text-text-tertiary"}`}>
                <span className="font-semibold">{m.replyTo.username}</span>
                <span className="line-clamp-2">{m.replyTo.text}</span>
              </div>
            )}
            {m.text && <MessageText text={m.text} mine={mine} />}
            {m.isBot && <BotMessageExtras card={m.card} buttons={m.buttons} onClick={(b) => onButton(m, b)} />}
            <p className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-on-primary/60" : "text-text-tertiary"}`}>
              {m.isEdited && m.isBot && <span>edited ·</span>}
              {m.isPinned && <IoPin size={10} />}
              {m._queued ? (
                <span className="flex items-center gap-0.5" title="Sends when you are back online">
                  <IoTimeOutline size={10} /> waiting
                </span>
              ) : m._pending ? (
                <IoTimeOutline size={10} />
              ) : (
                formatTime(ts(m))
              )}
            </p>
          </div>
          {!m._pending && !m._queued && !failed && (
            <MessageMenu
              message={m}
              mine={mine}
              isOwner={isOwner}
              onReply={() => onReply(m)}
              onPin={() => chat.togglePin(m).catch((e) => confirm.error(e))}
              onDelete={() => confirm.ask("Delete message?", "It will be removed for everyone.", () => chat.remove(m.id))}
              onPurge={() => confirm.ask(`Delete all messages from ${name}?`, "This removes their entire chat history in this tribe.", () => chat.removeAllFrom(m.userId))}
              onBan={() =>
                confirm.ask(`Ban ${name}?`, "They'll be removed, their messages deleted, and they can't rejoin.", async () => {
                  await banUser(m.guildId, m.userId, m.username);
                  await chat.removeAllFrom(m.userId);
                })
              }
            />
          )}
        </div>
        {failed && (
          <p className="mt-1 flex items-center gap-2 text-xs text-error">
            Failed to send{m._error ? ` · ${m._error}` : ""}
            <button type="button" onClick={() => chat.retry(m.id)} className="flex items-center gap-0.5 font-semibold underline">
              <IoReload size={11} /> Retry
            </button>
            <button type="button" onClick={() => chat.discard(m.id)} className="font-semibold underline">
              Discard
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

function ChatControls({ tribeId, settings, onSaved, onClose }) {
  const { showAlert } = useFeedback();
  const [locked, setLocked] = useState(!!settings?.is_locked);
  const [delay, setDelay] = useState(settings?.message_delay ?? 0);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      onSaved(await updateChatSettings(tribeId, { isLocked: locked, messageDelay: delay }));
      onClose();
    } catch (e) {
      showAlert("Couldn't save", e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} labelledBy="chatctl-title">
      <h2 id="chatctl-title" className="mb-4 text-lg font-bold text-text">
        Chat controls
      </h2>
      <button type="button" role="switch" aria-checked={locked} onClick={() => setLocked((v) => !v)} className="mb-4 flex w-full items-center gap-3 rounded-xl bg-surface p-4 text-left">
        <IoLockClosed size={20} className={locked ? "text-primary" : "text-text-tertiary"} />
        <span className="flex-1">
          <span className="block font-semibold text-text">Lock chat</span>
          <span className="block text-xs text-text-secondary">Only you can send messages while locked.</span>
        </span>
        <span className={`relative h-[26px] w-[46px] rounded-full ${locked ? "bg-primary" : "bg-border"}`}>
          <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-background transition-all ${locked ? "left-[23px]" : "left-[3px]"}`} />
        </span>
      </button>
      <p className="mb-2 text-sm font-medium text-text-secondary">Slow mode</p>
      <div className="mb-6 grid grid-cols-5 gap-2">
        {[0, 5, 10, 30, 60].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={delay === s}
            onClick={() => setDelay(s)}
            className={`rounded-xl py-2 text-sm font-bold ${delay === s ? "bg-primary text-on-primary" : "bg-hover text-text-secondary"}`}
          >
            {s ? `${s}s` : "Off"}
          </button>
        ))}
      </div>
      <Button title="Save" fullWidth loading={saving} onClick={save} className="mb-2" />
      <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
    </Modal>
  );
}

function Chat({ tribe, role }) {
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const chat = useTribeChat(role.isMember && !role.isPending ? tribe.id : null);
  const bots = useTribeBots(tribe.id, role.isMember && !role.isPending);
  const [toast, setToast] = useState(null);
  const [menuIdx, setMenuIdx] = useState(0);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [pinIdx, setPinIdx] = useState(0);
  const [controls, setControls] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scroller = useRef(null);
  const input = useRef(null);
  const prev = useRef({ first: null, last: null, height: 0 });

  const confirm = {
    ask: (title, body, fn) =>
      showAlert(title, body, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: "destructive", onPress: () => Promise.resolve(fn()).catch((e) => showAlert("Something went wrong", e.message)) },
      ]),
    error: (e) => showAlert("Something went wrong", e.message),
  };

  // Scroll anchoring: first load → bottom; new messages at the end → follow
  // if already at the bottom (or it's mine); older messages prepended → keep
  // the reader's place.
  useLayoutEffect(() => {
    const el = scroller.current;
    const msgs = chat.messages;
    if (!el || !msgs.length) return;
    const first = msgs[0].id;
    const last = msgs[msgs.length - 1];
    const p = prev.current;
    if (!p.last) el.scrollTop = el.scrollHeight;
    else if (first !== p.first && last.id === p.last) el.scrollTop += el.scrollHeight - p.height;
    else if (last.id !== p.last && (atBottom || last.userId === user?.uid)) el.scrollTop = el.scrollHeight;
    prev.current = { first, last: last.id, height: el.scrollHeight };
  }, [chat.messages, atBottom, user?.uid]);

  const onScroll = () => {
    const el = scroller.current;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
    if (el.scrollTop < 40 && chat.hasMore && !chat.loadingOlder) chat.loadOlder();
  };

  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // "/" menu: installed bots' commands matching what's typed so far.
  const commands = (bots.data?.bots ?? []).flatMap((b) => (b.commands ?? []).map((c) => ({ ...c, bot: b })));
  const slash = /^\/([a-z0-9_-]*)$/i.exec(text);
  const matches = slash ? commands.filter((c) => c.name.startsWith(slash[1].toLowerCase())).slice(0, 8) : [];
  const exact = matches.length === 1 && text === `/${matches[0].name}`;
  const menuOpen = matches.length > 0 && !exact;
  const highlighted = menuOpen ? matches[menuIdx % matches.length] : null;
  const pickCommand = (c) => {
    setText(`/${c.name}${c.options?.length ? " " : ""}`);
    setMenuIdx(0);
    input.current?.focus();
  };

  const onButton = async (m, b) => {
    try {
      const r = await clickBotButton(tribe.id, m.id, b.id);
      if (r?.toast) setToast({ text: r.toast, from: m.displayName || m.username });
      else if (r && !r.delivered) setToast({ text: "The bot didn't answer. Try again in a moment.", from: m.displayName || m.username });
    } catch (e) {
      showAlert("Couldn't reach the bot", e.message);
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    const reply = replyTo ? { id: replyTo.id, username: replyTo.displayName || replyTo.username, text: replyTo.text.slice(0, 140) } : null;
    setText("");
    setReplyTo(null);
    const err = await chat.send(text, reply);
    if (err?.status === 429 || err?.status === 403) showAlert(err.status === 429 ? "Slow mode" : "Chat locked", err.message);
  };

  const scrollToBottom = () => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });

  const locked = chat.settings?.is_locked && !role.isOwner;
  const slow = chat.settings?.message_delay > 0 && !role.isOwner ? chat.settings.message_delay : 0;
  const pinned = chat.pinned[pinIdx % Math.max(1, chat.pinned.length)];

  const days = chat.messages.map((m) => formatDay(ts(m)));

  return (
    <div className="relative flex h-[calc(100dvh-57px-80px-env(safe-area-inset-bottom))] flex-col md:h-[calc(100dvh-2rem)]">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-divider px-3 py-2.5 md:rounded-t-[28px] md:bg-[var(--panel-bg-strong)]">
        <Link href={`/tribe/${tribe.id}`} aria-label="Back to tribe" className="rounded-xl p-2 text-text hover:bg-hover">
          <IoArrowBack size={20} />
        </Link>
        <Link href={`/tribe/${tribe.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <TribeAvatar tribe={tribe} size={38} />
          <span className="min-w-0">
            <span className="block truncate font-bold text-text">{tribe.name}</span>
            <span className="block text-xs text-text-tertiary">
              {countLabel(tribeMembers(tribe), "member")}
              {chat.settings?.is_locked ? " · locked" : slow ? ` · slow mode ${slow}s` : ""}
            </span>
          </span>
        </Link>
        {role.isOwner && (
          <button type="button" onClick={() => setControls(true)} aria-label="Chat controls" className="rounded-xl p-2 text-text-secondary hover:bg-hover hover:text-text">
            <IoOptionsOutline size={20} />
          </button>
        )}
      </header>

      {!role.isMember || role.isPending ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="font-bold text-text">{role.isPending ? "Your membership is pending" : "Members only"}</p>
          <p className="text-sm text-text-secondary">{role.isPending ? "You'll get access once approved." : `Join ${tribe.name} to chat with members.`}</p>
          {!role.isMember && <JoinButton tribe={tribe} role={role} />}
        </div>
      ) : (
        <>
          {pinned && (
            <button
              type="button"
              onClick={() => setPinIdx((i) => i + 1)}
              className="flex items-center gap-2 border-b border-divider bg-primary/5 px-4 py-2 text-left"
              title={chat.pinned.length > 1 ? "Next pinned message" : undefined}
            >
              <IoPin size={14} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-primary">
                  Pinned{chat.pinned.length > 1 ? ` ${(pinIdx % chat.pinned.length) + 1}/${chat.pinned.length}` : ""}
                </span>
                <span className="block truncate text-sm text-text">{pinned.text}</span>
              </span>
            </button>
          )}

          <div ref={scroller} onScroll={onScroll} className="panel-scroll relative flex-1 overflow-y-auto pb-3" role="log" aria-live="polite">
            {chat.loadingOlder && (
              <div className="flex justify-center py-3">
                <Spinner size={16} />
              </div>
            )}
            {chat.loading && !chat.messages.length ? (
              <div className="flex h-full items-center justify-center">
                <Spinner />
              </div>
            ) : chat.messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="font-bold text-text">Say hello 👋</p>
                <p className="text-sm text-text-secondary">This is the start of {tribe.name}&apos;s chat.</p>
              </div>
            ) : (
              chat.messages.map((m, i) => {
                const prev = chat.messages[i - 1];
                const newDay = days[i] !== days[i - 1];
                const first = newDay || !prev || prev.userId !== m.userId || ts(m) - ts(prev) > GROUP_GAP_MS;
                return (
                  <Fragment key={m.id}>
                    {newDay && (
                      <p className="my-3 flex justify-center">
                        <span className="rounded-full bg-hover px-3 py-1 text-[11px] font-semibold text-text-secondary">{days[i]}</span>
                      </p>
                    )}
                    <Bubble m={m} mine={m.userId === user?.uid} first={first} isOwner={role.isOwner} chat={chat} onReply={setReplyTo} confirm={confirm} onButton={onButton} />
                  </Fragment>
                );
              })
            )}
          </div>

          {!atBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="Jump to latest"
              className="glass-strong absolute bottom-24 right-6 z-10 rounded-full p-2.5 text-text"
            >
              <IoArrowDown size={18} />
            </button>
          )}

          {(chat.typing.length > 0 || chat.status === "offline") && (
            <p className="px-4 pb-1 text-xs text-text-tertiary" aria-live="polite">
              {chat.typing.length > 0
                ? `${chat.typing.slice(0, 2).join(" and ")}${chat.typing.length > 2 ? ` and ${chat.typing.length - 2} more` : ""} ${chat.typing.length === 1 ? "is" : "are"} typing…`
                : "Reconnecting… messages you send will go out when you're back."}
            </p>
          )}

          {locked ? (
            <p className="flex items-center justify-center gap-2 border-t border-divider px-4 py-4 text-sm text-text-secondary">
              <IoLockClosed size={16} /> Chat is locked by the tribe owner
            </p>
          ) : (
            <form onSubmit={send} className="relative border-t border-divider px-3 py-2.5">
              {toast && (
                <p role="status" className="glass-strong absolute -top-12 left-1/2 z-20 max-w-[90%] -translate-x-1/2 truncate rounded-full px-4 py-2 text-sm text-text">
                  <span className="font-semibold">{toast.from}:</span> {toast.text}
                </p>
              )}
              {menuOpen && (
                <ul role="listbox" aria-label="Bot commands" className="glass-strong absolute bottom-full left-3 right-3 z-20 mb-2 max-h-72 overflow-y-auto rounded-2xl p-1.5">
                  {matches.map((c) => (
                    <li key={`${c.bot.id}:${c.name}`} role="option" aria-selected={highlighted === c}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickCommand(c)}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ${highlighted === c ? "bg-hover" : "hover:bg-hover"}`}
                      >
                        <BotAvatar bot={c.bot} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-sm font-semibold text-text">
                            /{c.name}
                            {(c.options ?? []).map((o) => (
                              <span key={o.name} className="font-normal text-text-tertiary">
                                {" "}
                                {o.required ? `<${o.name}>` : `[${o.name}]`}
                              </span>
                            ))}
                          </span>
                          <span className="block truncate text-xs text-text-secondary">{c.description}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-text-tertiary">@{c.bot.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {replyTo && (
                <div className="mb-2 flex items-center gap-2 rounded-xl bg-hover px-3 py-2 text-sm">
                  <IoArrowUndoOutline size={15} className="shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-text">{replyTo.displayName || replyTo.username}</span>{" "}
                    <span className="text-text-secondary">{replyTo.text}</span>
                  </span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="text-text-tertiary hover:text-text">
                    <IoClose size={16} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={input}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value.slice(0, MAX));
                    if (e.target.value && !e.target.value.startsWith("/")) chat.notifyTyping();
                  }}
                  onKeyDown={(e) => {
                    if (menuOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                      e.preventDefault();
                      setMenuIdx((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
                      return;
                    }
                    if (menuOpen && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
                      e.preventDefault();
                      pickCommand(highlighted);
                      return;
                    }
                    if (e.key === "Enter" && !e.shiftKey) send(e);
                    if (e.key === "Escape") setReplyTo(null);
                  }}
                  aria-autocomplete="list"
                  rows={1}
                  placeholder={slow ? `Message (slow mode: ${slow}s)` : "Message"}
                  aria-label="Message"
                  className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl bg-hover px-4 py-2.5 text-[15px] text-text outline-none placeholder:text-text-tertiary focus:shadow-[inset_0_0_0_1px_var(--primary)] [field-sizing:content]"
                />
                <button
                  type="submit"
                  disabled={!text.trim()}
                  aria-label="Send"
                  className="glow-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-40 disabled:shadow-none"
                >
                  <IoSend size={17} />
                </button>
              </div>
            </form>
          )}
        </>
      )}

      {controls && (
        <ChatControls tribeId={tribe.id} settings={chat.settings} onSaved={(s) => chat.setSettings(s)} onClose={() => setControls(false)} />
      )}
    </div>
  );
}

export default function TribeChatPage() {
  return <TribeScreen header={false}>{(p) => <Chat {...p} />}</TribeScreen>;
}
