"use client";
// Developer portal (/developers): apply → (team review) → verified dashboard
// with apps, API keys and profile. Admins also get the review queue.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { IoCodeSlashOutline, IoTimeOutline, IoCloseCircleOutline, IoBanOutline, IoPlay, IoShieldCheckmark, IoBookOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import ApplyForm from "@/components/developers/ApplyForm";
import AppsPanel from "@/components/developers/AppsPanel";
import BotsPanel from "@/components/developers/BotsPanel";
import KeysPanel from "@/components/developers/KeysPanel";
import ReviewPanel from "@/components/developers/ReviewPanel";
import { useDeveloperMe } from "@/hooks/developers";
import { isNotDeployed } from "@/lib/developers";

const PERKS = [
  ["Publish to Explore", "Mini-apps that run inside Sysfi, and listings for what you've built on Sysfi."],
  ["Any dApp, any chain", "The SDK makes Sysfi a standard wallet on eight networks — wagmi, viem and ethers just work."],
  ["Payments built in", "tribe.pay() takes any token on any network, bridged for the user."],
  ["Bots for every tribe", "Slash commands, cards with buttons and moderation — installed per tribe, with the owner’s permission."],
  ["Public API keys", "Read tribes, posts, DAOs and the asset registry from your servers."],
];

function Intro() {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      {PERKS.map(([t, d]) => (
        <div key={t} className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-bold text-text">{t}</p>
          <p className="text-sm text-text-secondary">{d}</p>
        </div>
      ))}
    </div>
  );
}

function Notice({ Icon, tone, title, children }) {
  return (
    <div className={`mb-5 flex gap-3 rounded-2xl border p-4 ${tone}`}>
      <Icon size={22} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-bold">{title}</p>
        <div className="text-sm opacity-90">{children}</div>
      </div>
    </div>
  );
}

export default function DeveloperPortal() {
  const me = useDeveloperMe();
  const router = useRouter();
  const search = useSearchParams();
  const d = me.data?.developer;
  const isAdmin = !!me.data?.isAdmin;
  const verified = d?.status === "verified";

  const tabs = [
    ...(verified || isAdmin ? [{ id: "apps", label: "Apps" }] : []),
    ...(verified ? [{ id: "bots", label: "Bots" }] : []),
    ...(verified ? [{ id: "keys", label: "API keys" }] : []),
    { id: "profile", label: "Profile" },
    ...(isAdmin ? [{ id: "review", label: "Review" }] : []),
  ];
  const tab = tabs.some((t) => t.id === search.get("tab")) ? search.get("tab") : tabs[0].id;

  if (me.isPending) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} />
      </div>
    );
  }

  const header = (
    <PageHeader
      title="Developers"
      subtitle={verified ? "Verified developer" : "Build on Sysfi"}
      tabs={d || isAdmin ? tabs : undefined}
      activeTab={tab}
      onTabChange={(id) => router.replace(`/developers?tab=${id}`, { scroll: false })}
    />
  );

  return (
    <>
      {header}
      <div className="mx-auto max-w-3xl px-4 py-5 md:px-5">
        <div className="mb-5 flex flex-wrap gap-2">
          <Link href="/explore/dev" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-hover">
            <IoPlay size={13} /> Mini-app SDK &amp; developer preview
          </Link>
          <Link href="/developers/docs" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-hover">
            <IoBookOutline size={13} /> API reference &amp; @tribe/sdk
          </Link>
        </div>

        {me.isError && isNotDeployed(me.error) ? (
          <Notice Icon={IoTimeOutline} tone="border-border bg-surface text-text" title="The developer program is opening soon">
            You can already build and test with the SDK in the <Link href="/explore/dev" className="font-semibold text-primary">developer preview</Link>.
          </Notice>
        ) : me.isError ? (
          <Notice Icon={IoCloseCircleOutline} tone="border-down/30 bg-down/[0.05] text-text" title="Couldn't load your developer profile">
            {me.error?.message}
          </Notice>
        ) : !d ? (
          tab === "review" && isAdmin ? (
            <ReviewPanel />
          ) : tab === "apps" && isAdmin ? (
            <AppsPanel />
          ) : (
            <>
              <h2 className="mb-1 flex items-center gap-2 text-xl font-extrabold text-text">
                <IoCodeSlashOutline size={22} className="text-primary" /> Become a verified developer
              </h2>
              <p className="mb-5 text-sm text-text-secondary">Publishing to Explore and API keys are for verified developers. Tell us who you are and what you&apos;re building — the Sysfi team reviews every application.</p>
              <Intro />
              <ApplyForm />
            </>
          )
        ) : (
          <>
            {d.status === "applied" && tab === "profile" && (
              <Notice Icon={IoTimeOutline} tone="border-neutral/30 bg-neutral/[0.06] text-text" title="Application under review">
                We&apos;ll email {d.email} when it&apos;s decided. Meanwhile, keep building with the developer preview.
              </Notice>
            )}
            {d.status === "rejected" && tab === "profile" && (
              <Notice Icon={IoCloseCircleOutline} tone="border-down/30 bg-down/[0.05] text-text" title="Application not approved">
                {d.reviewNotes || "No reason given."} Update your details below to apply again.
              </Notice>
            )}
            {d.status === "suspended" && (
              <Notice Icon={IoBanOutline} tone="border-down/30 bg-down/[0.05] text-text" title="Developer access suspended">
                {d.reviewNotes || "Your apps are hidden from Explore and your API keys are revoked."} Contact support to appeal.
              </Notice>
            )}
            {verified && tab === "profile" && (
              <Notice Icon={IoShieldCheckmark} tone="border-up/30 bg-up/[0.05] text-text" title="Verified">
                Your apps show &quot;{d.displayName}&quot; as the developer.
              </Notice>
            )}

            {tab === "apps" && <AppsPanel />}
            {tab === "bots" && verified && <BotsPanel />}
            {tab === "keys" && verified && <KeysPanel apiScopes={me.data.apiScopes} />}
            {tab === "review" && isAdmin && <ReviewPanel />}
            {tab === "profile" && d.status !== "suspended" && <ApplyForm existing={d} submitLabel={d.status === "rejected" ? "Apply again" : "Save details"} />}
          </>
        )}
      </div>
    </>
  );
}
