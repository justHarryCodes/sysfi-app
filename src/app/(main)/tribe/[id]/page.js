"use client";
// Tribe overview — port of TribeTabContent's Overview tab.
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  IoPeople,
  IoCalendar,
  IoLockOpen,
  IoLockClosed,
  IoLinkOutline,
  IoCopyOutline,
  IoCheckmark,
  IoShareSocialOutline,
  IoGlobeOutline,
  IoLogoTwitter,
  IoLogoDiscord,
  IoPaperPlaneOutline,
  IoChevronForward,
  IoExitOutline,
} from "react-icons/io5";
import TribeScreen from "@/components/tribe/TribeScreen";
import TokenRequirements from "@/components/tribe/TokenRequirements";
import { useTribeGate } from "@/components/tribe/TribeHeader";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { tribeKeys, useLeaveTribe, useMembers } from "@/hooks/tribes";
import { formatCount } from "@/lib/format";
import { getExternalLinks, getInvites, inviteUrl, isLiveInvite, tribeMembers } from "@/lib/tribeApi";

const LINKS = [
  { key: "website", Icon: IoGlobeOutline, label: "Website" },
  { key: "twitter", Icon: IoLogoTwitter, label: "X / Twitter" },
  { key: "discord", Icon: IoLogoDiscord, label: "Discord" },
  { key: "telegram", Icon: IoPaperPlaneOutline, label: "Telegram" },
];

const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);

function Stat({ Icon, value, label }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 py-4">
      <Icon size={22} className="text-primary" />
      <span className="text-lg font-extrabold text-text">{value}</span>
      <span className="text-xs text-text-tertiary">{label}</span>
    </div>
  );
}

function Overview({ tribe, role }) {
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const { gate, check, address } = useTribeGate(tribe, role);
  const members = useMembers(tribe.id);
  const leave = useLeaveTribe(tribe.id);
  const [copied, setCopied] = useState(false);

  const links = useQuery({
    queryKey: tribeKeys.links(user?.uid, tribe.id),
    queryFn: () => getExternalLinks(tribe.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const invites = useQuery({
    queryKey: tribeKeys.invites(user?.uid, tribe.id),
    queryFn: () => getInvites(tribe.id),
    enabled: !!user && role.isMember,
    staleTime: 60_000,
  });
  const invite = invites.data?.find(isLiveInvite);

  const founded = tribe.createdAt || tribe.created_at;
  const shownLinks = LINKS.filter((l) => links.data?.[l.key]);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl(invite.code));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const shareInvite = async () => {
    const url = inviteUrl(invite.code);
    if (navigator.share) return navigator.share({ title: tribe.name, text: `Join ${tribe.name} on Sysfi`, url }).catch(() => {});
    copyInvite();
  };
  const confirmLeave = () =>
    showAlert("Leave tribe?", `You'll lose access to ${tribe.name}'s chat and member-only posts.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => leave.mutateAsync().catch((e) => showAlert("Couldn't leave", e.message)),
      },
    ]);

  return (
    <div className="space-y-6 p-4">
      <div className="flex divide-x divide-divider rounded-2xl bg-surface">
        <Stat Icon={IoPeople} value={formatCount(tribeMembers(tribe))} label="Members" />
        <Stat Icon={IoCalendar} value={founded ? new Date(founded).getFullYear() : "—"} label="Founded" />
        <Stat Icon={tribe.privacy === "private" ? IoLockClosed : IoLockOpen} value={tribe.privacy === "private" ? "Private" : "Public"} label="Privacy" />
      </div>

      {gate && !role.isMember && <TokenRequirements gate={gate} check={check} address={address} />}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-[1px] text-primary">About This Tribe</h2>
        <p className="whitespace-pre-line text-md leading-6 text-text-secondary">{tribe.description || "No description provided for this tribe."}</p>
      </section>

      {role.isMember && invite && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-[1px] text-primary">
            <IoLinkOutline size={16} /> Invite Friends
          </h2>
          <div className="flex items-center gap-3 rounded-2xl bg-surface p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-text-tertiary">Invite Code</p>
              <p className="font-mono text-lg font-bold tracking-wider text-primary">{invite.code}</p>
              {invite.uses > 0 && (
                <p className="text-xs text-text-tertiary">
                  Used {invite.uses} time{invite.uses !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <button type="button" onClick={copyInvite} aria-label="Copy invite link" className="rounded-xl bg-hover p-2.5 text-text hover:text-primary">
              {copied ? <IoCheckmark size={18} className="text-primary" /> : <IoCopyOutline size={18} />}
            </button>
            <button type="button" onClick={shareInvite} aria-label="Share invite link" className="rounded-xl bg-primary p-2.5 text-on-primary">
              <IoShareSocialOutline size={18} />
            </button>
          </div>
        </section>
      )}

      {shownLinks.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-[1px] text-primary">Links</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {shownLinks.map(({ key, Icon, label }) => (
              <a
                key={key}
                href={safeUrl(links.data[key])}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-3 rounded-xl bg-surface p-3 hover:bg-hover"
              >
                <Icon size={20} className="shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-xs text-text-tertiary">{label}</span>
                  <span className="block truncate text-sm text-text">{links.data[key].replace(/^https?:\/\//, "")}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-[1px] text-primary">Members</h2>
          <Link href={`/tribe/${tribe.id}/members`} className="flex items-center gap-0.5 text-sm font-semibold text-primary">
            View all <IoChevronForward size={14} />
          </Link>
        </div>
        <div className="divide-y divide-divider rounded-2xl bg-surface">
          {(members.data || []).slice(0, 5).map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar src={m.user_avatar} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text">{m.display_name || m.username || (m.status === "owner" ? "Owner" : "Member")}</span>
                {m.username && <span className="block truncate text-xs text-text-tertiary">@{m.username}</span>}
              </span>
              {m.status !== "member" && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{m.status}</span>}
            </div>
          ))}
          {members.isPending && <p className="px-4 py-3 text-sm text-text-tertiary">Loading…</p>}
        </div>
      </section>

      {role.isMember && !role.isOwner && (
        <button
          type="button"
          onClick={confirmLeave}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-error/20 py-3 text-sm font-semibold text-error hover:bg-error/5"
        >
          <IoExitOutline size={18} /> Leave tribe
        </button>
      )}
    </div>
  );
}

export default function TribeOverviewPage() {
  return <TribeScreen>{(p) => <Overview {...p} />}</TribeScreen>;
}
