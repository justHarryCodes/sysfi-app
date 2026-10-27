"use client";
// components/shell/RightRail.js — desktop side column (xl+): the most
// active public tribes, then the user's latest messages, and the footer.
// Tribes come from the cached query hooks so they render instantly from
// IndexedDB and refresh quietly. Search lives in the top bar's ⌘K palette.
import Link from "next/link";
import { IoLockClosed, IoArrowForward } from "react-icons/io5";
import { useTopTribes } from "@/hooks/queries";
import { countLabel } from "@/lib/format";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import { RailCard } from "./LeftRail";
import RailMessages from "./RailMessages";

function SkeletonRows({ n = 4 }) {
  return Array.from({ length: n }, (_, i) => (
    <div key={i} className="flex items-center gap-3 px-4 py-2.5" aria-hidden>
      <span className="h-8 w-8 animate-pulse rounded-full bg-hover" />
      <span className="flex-1 space-y-2">
        <span className="block h-3 w-1/2 animate-pulse rounded bg-hover" />
        <span className="block h-3 w-1/4 animate-pulse rounded bg-hover" />
      </span>
    </div>
  ));
}

function TopTribes() {
  const tribes = useTopTribes(5);
  return (
    <RailCard title="Top tribes">
      {tribes.isPending ? (
        <SkeletonRows n={3} />
      ) : tribes.isError && !tribes.data ? (
        <p className="px-4 pb-3 text-sm text-text-tertiary">Couldn&apos;t load tribes.</p>
      ) : (
        <div className="px-1.5 pb-1.5">
          {tribes.data?.map((t) => (
            <Link key={t.id} href={`/tribe/${t.id}`} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-hover">
              <TribeAvatar tribe={t} size={36} rounded="rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 truncate text-sm font-bold text-text">
                  {t.name}
                  {t.tokenGating && <IoLockClosed size={11} className="shrink-0 text-primary" aria-label="Token-gated" />}
                </span>
                <span className="block truncate text-xs text-text-tertiary">
                  {t.genre || "Community"} · {countLabel(t.memberCount, "member")}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
      <Link href="/tribes" className="flex items-center justify-between border-t border-panel-border px-4 py-3 text-sm font-semibold text-primary hover:bg-hover">
        Explore tribes
        <IoArrowForward size={15} />
      </Link>
    </RailCard>
  );
}

export default function RightRail() {
  return (
    <aside className="panel-scroll hidden w-[312px] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain pb-6 xl:flex">
      <TopTribes />
      <RailMessages />
      <p className="px-2 text-xs text-text-tertiary">© {new Date().getFullYear()} Sysfi · Built on Robinhood Chain</p>
    </aside>
  );
}
