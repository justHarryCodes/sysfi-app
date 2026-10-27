"use client";
// Explore → Bots: approved bots any tribe owner or moderator can add.
import { useState } from "react";
import Link from "next/link";
import { IoSearchOutline, IoHardwareChipOutline, IoChevronForward, IoCodeSlashOutline } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import { BotAvatar } from "@/components/bots/BotBits";
import { useBotDirectory } from "@/hooks/bots";
import { useDebounced } from "@/hooks/useDebounced";
import { isBotsMissing } from "@/lib/bots";

export default function BotsDirectory() {
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 300);
  const dir = useBotDirectory(q);
  const bots = dir.data ?? [];
  const missing = isBotsMissing(dir.error);

  return (
    <>
      <div className="px-4 pt-4 md:px-5">
        <p className="mb-3 text-sm text-text-secondary">Bots join your tribe&apos;s chat: slash commands, alerts, polls, games and moderation. You choose what each one can do.</p>
        <label className="mb-4 flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary">
          <IoSearchOutline size={16} className="text-text-tertiary" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bots" aria-label="Search bots" className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary" />
        </label>
      </div>
      <div className="px-4 pb-8 md:px-5">
        {dir.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} className="text-primary" />
          </div>
        ) : missing || (dir.isError && !bots.length) || !bots.length ? (
          <div className="flex flex-col items-center py-16 text-center">
            <IoHardwareChipOutline size={44} className="mb-3 text-text-tertiary" />
            <p className="mb-1 font-semibold text-text">{missing ? "Bots are coming soon" : dir.isError ? "Couldn't load bots" : q ? "Nothing matches" : "No bots yet"}</p>
            <p className="max-w-sm text-sm text-text-secondary">{dir.isError && !missing ? dir.error?.message : "Verified developers' bots will show up here."}</p>
          </div>
        ) : (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {bots.map((b) => (
              <Link key={b.id} href={`/explore/bots/${b.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-primary/40">
                <BotAvatar bot={b} size={56} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-text">{b.name}</span>
                  <span className="block font-mono text-[11px] text-text-tertiary">@{b.username}</span>
                  <span className="line-clamp-2 text-sm text-text-secondary">{b.description}</span>
                  {b.commands?.length > 0 && (
                    <span className="mt-1 block truncate font-mono text-[11px] text-text-tertiary">{b.commands.slice(0, 4).map((c) => `/${c.name}`).join("  ")}</span>
                  )}
                </span>
                <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-on-primary">ADD</span>
              </Link>
            ))}
          </div>
        )}

        <Link href="/developers?tab=bots" className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 hover:border-primary/40">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IoCodeSlashOutline size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-text">Build a bot</span>
            <span className="block text-sm text-text-secondary">Webhooks or polling, slash commands, cards and buttons — with @tribe/sdk/bot.</span>
          </span>
          <IoChevronForward size={16} className="text-text-tertiary" />
        </Link>
      </div>
    </>
  );
}
