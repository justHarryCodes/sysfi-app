"use client";
// The developer's apps: review state, usage, and where to edit.
import Link from "next/link";
import { IoAdd, IoChevronForward, IoEyeOutline, IoPeopleOutline } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import { useMyApps } from "@/hooks/developers";

export const STATUS = {
  draft: { label: "Draft", cls: "bg-hover text-text-secondary" },
  pending_review: { label: "In review", cls: "bg-neutral/15 text-neutral" },
  pending: { label: "In review", cls: "bg-neutral/15 text-neutral" },
  approved: { label: "Live", cls: "bg-up/15 text-up" },
  rejected: { label: "Changes needed", cls: "bg-down/15 text-down" },
  suspended: { label: "Suspended", cls: "bg-down/15 text-down" },
};

export function StatusPill({ status }) {
  const s = STATUS[status] ?? STATUS.draft;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</span>;
}

export default function AppsPanel() {
  const apps = useMyApps();
  const list = apps.data ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-text-secondary">Mini-apps and &quot;Built on Sysfi&quot; listings. New submissions and edits go to review.</p>
        <Link href="/developers/apps/new" className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:opacity-90">
          <IoAdd size={16} /> New app
        </Link>
      </div>
      {apps.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : !list.length ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
          No apps yet. Test one in the <Link href="/explore/dev" className="font-semibold text-primary">developer preview</Link>, then submit it here.
        </p>
      ) : (
        <ul className="divide-y divide-divider rounded-2xl border border-border bg-surface">
          {list.map((a) => (
            <li key={a.id}>
              <Link href={`/developers/apps/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.iconUrl || "/icon.png"} alt="" className="h-11 w-11 shrink-0 rounded-xl bg-background object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-semibold text-text">{a.name}</span>
                    <StatusPill status={a.status} />
                  </p>
                  <p className="flex items-center gap-3 text-xs text-text-tertiary">
                    <span>{a.kind === "external" ? "Built on Sysfi" : "Mini-app"}</span>
                    <span className="flex items-center gap-1">
                      <IoEyeOutline size={12} /> {a.openCount ?? 0} opens
                    </span>
                    <span className="flex items-center gap-1">
                      <IoPeopleOutline size={12} /> {a.installCount ?? 0} tribes
                    </span>
                  </p>
                  {a.status === "rejected" && a.reviewNotes && <p className="mt-1 line-clamp-2 text-xs text-down">Reviewer: {a.reviewNotes}</p>}
                </div>
                <IoChevronForward size={15} className="shrink-0 text-text-tertiary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
