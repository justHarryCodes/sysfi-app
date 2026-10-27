"use client";
// Tribe hub header — port of TribeDetailsScreen.renderHeader: banner, logo,
// join / member / pending state, name + privacy, stats, and the tab pills
// (Overview · Posts · Chat · Members · Governance · Settings).
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IoAppsOutline,
  IoArrowBack,
  IoImageOutline,
  IoCheckmarkCircle,
  IoTimeOutline,
  IoLockClosed,
  IoPeopleOutline,
  IoInformationCircleOutline,
  IoNewspaperOutline,
  IoChatbubblesOutline,
  IoShieldHalfOutline,
  IoSettingsOutline,
} from "react-icons/io5";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import Spinner from "@/components/ui/Spinner";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useWallet } from "@/contexts/WalletContext";
import { useJoinTribe, useTokenGate, useTribeRole } from "@/hooks/tribes";
import { countLabel } from "@/lib/format";
import { useSignInGate } from "@/hooks/useSignInGate";
import { tribeBanner, tribeDao, tribeGating, tribeMembers } from "@/lib/tribeApi";

export function useTribeGate(tribe, role) {
  const { address } = useWallet();
  const gate = tribe?.privacy === "private" ? tribeGating(tribe) : null;
  const check = useTokenGate(gate, address, !!gate && !role.isMember);
  return { gate, check, address };
}

export function JoinButton({ tribe, role, inviteId, className = "" }) {
  const { showAlert } = useFeedback();
  const join = useJoinTribe(tribe);
  const { gate, check } = useTribeGate(tribe, role);
  const { requireSignIn } = useSignInGate();

  const onJoin = requireSignIn(async () => {
    if (gate) {
      const res = check.data ?? (await check.refetch()).data;
      if (!res?.hasToken) {
        const need = gate.tokenType === "NFT" ? "at least 1 NFT" : `at least ${gate.minTokenAmount} ${gate.symbol || "tokens"}`;
        return showAlert("Access Denied", `You need to hold ${need} from the required collection.`);
      }
    }
    try {
      const res = await join.mutateAsync(inviteId);
      showAlert(res.alreadyMember ? "Already a Member" : "Welcome!", res.alreadyMember ? "You are already a member of this tribe." : `You joined ${tribe.name}.`);
    } catch (e) {
      showAlert("Couldn't join", e.message || "Failed to join. Try again.");
    }
  });

  const busy = join.isPending || check.isFetching;
  return (
    <button
      type="button"
      onClick={onJoin}
      disabled={busy}
      className={`glow-primary flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-on-primary disabled:opacity-70 ${className}`}
    >
      {busy ? <Spinner size={16} className="text-on-primary" /> : "Join Tribe"}
    </button>
  );
}

export default function TribeHeader({ tribe }) {
  const pathname = usePathname();
  const role = useTribeRole(tribe);
  const dao = tribeDao(tribe);
  const base = `/tribe/${tribe.id}`;

  const tabs = [
    { href: base, label: "Overview", Icon: IoInformationCircleOutline, show: true, exact: true },
    { href: `${base}/posts`, label: "Posts", Icon: IoNewspaperOutline, show: true },
    { href: `${base}/chat`, label: "Chat", Icon: IoChatbubblesOutline, show: role.isMember && !role.isPending },
    { href: `${base}/members`, label: "Members", Icon: IoPeopleOutline, show: true },
    { href: `${base}/apps`, label: "Apps", Icon: IoAppsOutline, show: role.isMember || role.isOwner },
    { href: `/daos/${dao.chainId}/${dao.address}`, label: "Governance", Icon: IoShieldHalfOutline, show: role.isMember && !!dao.address },
    { href: `${base}/settings`, label: "Settings", Icon: IoSettingsOutline, show: role.isOwner },
  ].filter((t) => t.show);

  const members = tribeMembers(tribe);
  const banner = tribeBanner(tribe);

  return (
    <header>
      <div className="relative aspect-[3/1] max-h-[240px] w-full overflow-hidden bg-surface md:rounded-t-[28px]">
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-text-tertiary">
            <IoImageOutline size={40} />
          </span>
        )}
        <Link
          href="/tribes"
          aria-label="Back to tribes"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md hover:bg-black/60"
        >
          <IoArrowBack size={20} />
        </Link>
      </div>

      <div className="flex items-end justify-between px-4">
        <TribeAvatar tribe={tribe} size={88} rounded="rounded-[22px]" className="-mt-11 border-4 border-background" />
        <div className="pt-3">
          {role.loading ? null : !role.isMember ? (
            <JoinButton tribe={tribe} role={role} />
          ) : role.isPending ? (
            <span className="flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1.5 text-sm font-bold text-warning">
              <IoTimeOutline size={16} /> Pending
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1.5 text-sm font-bold text-primary">
              <IoCheckmarkCircle size={16} /> {role.isOwner ? "Owner" : "Member"}
            </span>
          )}
        </div>
      </div>

      <div className="px-4 pb-3 pt-2">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-xl font-extrabold tracking-[-0.3px] text-text">{tribe.name}</h1>
          {tribe.privacy === "private" && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary-light px-2 py-0.5 text-[11px] font-bold text-on-primary-light">
              <IoLockClosed size={11} /> Private
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span className="flex items-center gap-1">
            <IoPeopleOutline size={15} /> {countLabel(members, "member")}
          </span>
          {tribe.genre && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-on-primary">{tribe.genre}</span>}
        </div>
      </div>

      <nav aria-label="Tribe sections" className="no-scrollbar flex gap-2 overflow-x-auto border-b border-divider px-4 pb-3">
        {tabs.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                active ? "bg-primary text-on-primary" : "bg-hover text-text-secondary hover:text-text"
              }`}
            >
              <Icon size={16} /> {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
