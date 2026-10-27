"use client";
// The developer's bots: status, delivery mode, installs.
import Link from "next/link";
import { IoAdd, IoChevronForward, IoPeopleOutline, IoFlashOutline, IoRepeatOutline } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import { StatusPill } from "@/components/developers/AppsPanel";
import { BotAvatar } from "@/components/bots/BotBits";
import { useMyBots } from "@/hooks/bots";

export default function BotsPanel() {
  const bots = useMyBots();
  const list = bots.data ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          Bots answer /commands and @mentions, post cards with buttons, and — with a tribe&apos;s permission — moderate. Test them in your own tribes before review.
        </p>
        <Link href="/developers/bots/new" className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:opacity-90">
          <IoAdd size={16} /> New bot
        </Link>
      </div>
      {bots.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : !list.length ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          No bots yet. Create one, add it to a tribe you own, and talk to it. See the{" "}
          <Link href="/developers/docs?api=bot" className="font-semibold text-primary">
            Bot API guide
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-divider rounded-2xl border border-border bg-surface">
          {list.map((b) => (
            <li key={b.id}>
              <Link href={`/developers/bots/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                <BotAvatar bot={b} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-semibold text-text">{b.name}</span>
                    <StatusPill status={b.status} />
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 text-xs text-text-tertiary">
                    <span className="font-mono">@{b.username}</span>
                    <span className="flex items-center gap-1">
                      {b.delivery === "webhook" ? <IoFlashOutline size={12} /> : <IoRepeatOutline size={12} />} {b.delivery}
                    </span>
                    <span className="flex items-center gap-1">
                      <IoPeopleOutline size={12} /> {b.installCount ?? 0} tribes
                    </span>
                  </p>
                </div>
                <IoChevronForward size={16} className="shrink-0 text-text-tertiary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
