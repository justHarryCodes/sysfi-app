// Telegram-style tribe row — port of TribeListScreen's TribeRow.
import Link from "next/link";
import { IoLockClosed, IoStar, IoStarOutline } from "react-icons/io5";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import { countLabel } from "@/lib/format";
import { tribeMembers } from "@/lib/tribeApi";

export default function TribeRow({ tribe, isOwner, pinned, onTogglePin, unread }) {
  return (
    <div className="group flex items-center gap-3.5 pl-4 transition-colors hover:bg-hover">
      <Link href={`/tribe/${tribe.id}`} className="flex min-w-0 flex-1 items-center gap-3.5 py-3">
        <TribeAvatar tribe={tribe} size={52} />
        <span className="min-w-0 flex-1 border-b-[0.5px] border-divider pb-3 pt-0.5 group-last:border-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-base font-semibold text-text">{tribe.name}</span>
            {tribe.privacy === "private" && <IoLockClosed size={12} className="shrink-0 text-text-tertiary" aria-label="Private" />}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className="truncate text-sm text-text-secondary">
              {[tribe.genre, countLabel(tribeMembers(tribe), "member")].filter(Boolean).join(" · ")}
            </span>
            {isOwner && <span className="shrink-0 rounded-lg bg-primary/15 px-1.5 py-px text-[10px] font-bold text-primary">Owner</span>}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-2 pr-4">
        {unread > 0 && (
          <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-bold leading-5 text-on-primary">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? "Unpin tribe" : "Pin tribe"}
            aria-pressed={pinned}
            className={`rounded-full p-1.5 transition-colors hover:bg-hover ${pinned ? "text-primary" : "text-text-tertiary"}`}
          >
            {pinned ? <IoStar size={16} /> : <IoStarOutline size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

export function TribeRowSkeleton() {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3" aria-hidden>
      <span className="h-[52px] w-[52px] animate-pulse rounded-full bg-hover" />
      <span className="flex-1 space-y-2.5">
        <span className="block h-3 w-1/2 animate-pulse rounded bg-hover" />
        <span className="block h-3 w-1/3 animate-pulse rounded bg-hover" />
      </span>
    </div>
  );
}
