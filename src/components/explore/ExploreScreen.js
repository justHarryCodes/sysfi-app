"use client";
// Explore — the web's App Store (AppSCreen), in three groups:
//   Mini-apps        run inside Sysfi (wallet, tribe and payment access, with consent)
//   Built on Sysfi   external apps, tools and projects using the Tribe API — open in a new tab
//   Bots             added to a tribe's chat by its owner or moderators
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { IoSearchOutline, IoCodeSlashOutline, IoOpenOutline, IoChevronForward, IoAppsOutline, IoConstructOutline, IoShieldCheckmark } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import BotsDirectory from "@/components/bots/BotsDirectory";
import { useDirectory } from "@/hooks/explore";
import { useDebounced } from "@/hooks/useDebounced";
import { getChainById } from "@/lib/config";
import { isPlatformMissing } from "@/lib/miniapp/api";

const TABS = [
  { id: "miniapp", label: "Mini-apps" },
  { id: "external", label: "Built on Sysfi" },
  { id: "bots", label: "Bots" },
];
const CATEGORIES = [
  ["all", "All"],
  ["games", "Games"],
  ["defi", "DeFi"],
  ["social", "Social"],
  ["tools", "Tools"],
  ["nft", "NFT"],
  ["payments", "Payments"],
  ["governance", "Governance"],
  ["other", "Other"],
];

function AppCard({ app }) {
  const external = app.kind === "external";
  const chains = (app.chains ?? []).map(getChainById).filter(Boolean);
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={app.iconUrl || "/icon.png"} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-background object-cover" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-bold text-text">{app.name}</span>
          {app.featured && <IoShieldCheckmark size={14} className="shrink-0 text-primary" title="Featured" />}
        </span>
        <span className="line-clamp-2 text-sm text-text-secondary">{app.tagline || app.description}</span>
        <span className="mt-1 flex items-center gap-2 text-[11px] text-text-tertiary">
          <span className="capitalize">{app.category}</span>
          {chains.length > 0 && (
            <span className="flex -space-x-1">
              {chains.slice(0, 5).map((c) => (
                <ChainIcon key={c.id} chain={c} size={13} className="ring-2 ring-surface" />
              ))}
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-extrabold text-on-primary">
        {external ? (
          <span className="flex items-center gap-1">
            VISIT <IoOpenOutline size={12} />
          </span>
        ) : app.category === "games" ? (
          "PLAY"
        ) : (
          "OPEN"
        )}
      </span>
    </>
  );
  const cls = "flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-primary/40";
  return (
    <Link href={`/explore/${app.id}`} className={cls}>
      {body}
    </Link>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const search = useSearchParams();
  const kind = search.get("tab") === "external" ? "external" : "miniapp";
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim(), 300);
  const dir = useDirectory({ kind, category, q });
  const apps = dir.data ?? [];
  const missing = isPlatformMissing(dir.error);
  const onTab = (id) => router.replace(`/explore?tab=${id}`, { scroll: false });

  if (search.get("tab") === "bots") {
    return (
      <>
        <PageHeader title="Explore" tabs={TABS} activeTab="bots" onTabChange={onTab} />
        <BotsDirectory />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Explore" tabs={TABS} activeTab={kind} onTabChange={onTab} />
      <div className="px-4 pt-4 md:px-5">
        <p className="mb-3 text-sm text-text-secondary">
          {kind === "miniapp"
            ? "Apps and games that run inside Sysfi — using your wallet on any network, with your permission."
            : "Apps, tools and projects built on the Sysfi API. They open on their own site."}
        </p>
        <label className="mb-3 flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary">
          <IoSearchOutline size={16} className="text-text-tertiary" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={kind === "miniapp" ? "Search mini-apps" : "Search projects"} aria-label="Search" className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary" />
        </label>
        <div className="no-scrollbar -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 md:-mx-5 md:px-5">
          {CATEGORIES.map(([c, label]) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`h-8 shrink-0 rounded-full border px-3.5 text-xs font-semibold ${category === c ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-text-secondary hover:text-text"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-8 md:px-5">
        {dir.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} className="text-primary" />
          </div>
        ) : missing || (dir.isError && !apps.length) ? (
          <div className="flex flex-col items-center py-16 text-center">
            <IoAppsOutline size={44} className="mb-3 text-text-tertiary" />
            <p className="mb-1 font-semibold text-text">{missing ? "Explore is opening soon" : "Couldn't load Explore"}</p>
            <p className="mb-5 max-w-sm text-sm text-text-secondary">{missing ? "The first verified apps are on their way." : dir.error?.message}</p>
          </div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <IoAppsOutline size={44} className="mb-3 text-text-tertiary" />
            <p className="mb-1 font-semibold text-text">{q || category !== "all" ? "Nothing matches" : "No apps here yet"}</p>
            <p className="text-sm text-text-secondary">{q || category !== "all" ? "Try another search or category." : "Verified developers' apps will show up here."}</p>
          </div>
        ) : (
          <div className="grid gap-2.5 lg:grid-cols-2">
            {apps.map((a) => (
              <AppCard key={a.id} app={a} />
            ))}
          </div>
        )}

        <Link href="/explore/dev" className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 hover:border-primary/40">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {kind === "miniapp" ? <IoCodeSlashOutline size={20} /> : <IoConstructOutline size={20} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold text-text">Build on Sysfi</span>
            <span className="block text-sm text-text-secondary">Test your mini-app in Sysfi with the SDK — any wagmi, viem or ethers dApp works.</span>
          </span>
          <IoChevronForward size={16} className="text-text-tertiary" />
        </Link>
      </div>
    </>
  );
}
