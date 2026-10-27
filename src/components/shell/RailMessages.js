"use client";
// components/shell/RailMessages.js — the right rail's Messages card: the
// latest conversations (decrypted on this device, like the inbox), unread
// counts, and a way in. Only when messaging is switched on and signed in;
// until this browser has its keys it just points to /messages.
import Link from "next/link";
import { IoArrowForward, IoLockClosed } from "react-icons/io5";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { timeAgo } from "@/lib/format";
import { DmProvider, useConversations, useDm, useProfiles } from "@/components/dm/DmProvider";
import { displayName, previewText } from "@/components/dm/ConversationList";
import { RailCard } from "./LeftRail";

const SHOW = 5;

function Rows() {
  const { uid } = useDm();
  const { items, loading, error } = useConversations("inbox");
  const list = items.slice(0, SHOW);
  const profiles = useProfiles(list.map((c) => c.otherUserIds[0]));

  if (loading) {
    return Array.from({ length: 3 }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-2.5" aria-hidden>
        <span className="h-9 w-9 animate-pulse rounded-full bg-hover" />
        <span className="flex-1 space-y-2">
          <span className="block h-3 w-1/2 animate-pulse rounded bg-hover" />
          <span className="block h-3 w-3/4 animate-pulse rounded bg-hover" />
        </span>
      </div>
    ));
  }
  if (error) return <p className="px-4 pb-3 text-sm text-text-tertiary">Couldn&apos;t load messages.</p>;
  if (!list.length) return <p className="px-4 pb-3 text-sm text-text-tertiary">No conversations yet. Start one from Messages.</p>;

  return (
    <div className="px-1.5 pb-1.5">
      {list.map((c) => {
        const other = c.otherUserIds[0];
        return (
          <Link key={c.id} href={`/messages?c=${c.id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-hover">
            <Avatar src={profiles[other]?.avatarUrl} size={36} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={`truncate text-sm ${c.unread ? "font-extrabold" : "font-bold"} text-text`}>{displayName(profiles[other], other)}</span>
                <span className="ml-auto shrink-0 text-[11px] text-text-tertiary">{timeAgo(Date.parse(c.lastMessageAt ?? c.createdAt))}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={`truncate text-xs ${c.unread ? "font-semibold text-text" : "text-text-tertiary"}`}>{previewText(c.preview, uid)}</span>
                {c.unread > 0 && (
                  <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary">{c.unread > 99 ? "99+" : c.unread}</span>
                )}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function Body() {
  const { status } = useDm();
  if (status.state === "ready") return <Rows />;
  if (status.state === "loading") return <div className="mx-4 mb-3 h-10 animate-pulse rounded-xl bg-hover" aria-hidden />;
  return (
    <p className="px-4 pb-3 text-sm text-text-tertiary">
      {status.state === "error" ? "Messages aren’t available right now." : status.state === "restore" ? "Unlock your messages on this browser with your wallet." : "Private, end-to-end encrypted messages — turn them on in one tap."}
    </p>
  );
}

export default function RailMessages() {
  const { user } = useAuth();
  if (process.env.NEXT_PUBLIC_FEATURE_DMS !== "1" || !user) return null;
  return (
    <DmProvider>
      <RailCard title="Messages" action={<IoLockClosed size={12} className="text-text-tertiary" aria-label="End-to-end encrypted" />}>
        <Body />
        <Link href="/messages" className="flex items-center justify-between border-t border-panel-border px-4 py-3 text-sm font-semibold text-primary hover:bg-hover">
          Explore more
          <IoArrowForward size={15} />
        </Link>
      </RailCard>
    </DmProvider>
  );
}
