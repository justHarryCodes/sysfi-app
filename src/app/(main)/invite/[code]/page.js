"use client";
// Invite — port of TribeInviteScreen. /invite/<code> is the link the app
// shares (sysfi.network/invite/<code>); signed-out visitors are sent
// through sign-in and FlowGate brings them back here.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IoLockClosed, IoPeopleOutline, IoAlertCircleOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import TokenRequirements from "@/components/tribe/TokenRequirements";
import { JoinButton, useTribeGate } from "@/components/tribe/TribeHeader";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import { useTribeRole } from "@/hooks/tribes";
import { countLabel } from "@/lib/format";
import { getInviteByCode } from "@/lib/tribeApi";

function inviteProblem(inv) {
  if (!inv) return "This invite link is invalid or has been deactivated.";
  if (inv.expires_at && Date.parse(inv.expires_at) < Date.now()) return "This invite link has expired.";
  if (inv.max_uses && inv.uses >= inv.max_uses) return "This invite link has reached its usage limit.";
  return null;
}

export default function InvitePage() {
  const { code } = useParams();
  const q = useQuery({
    queryKey: ["public", "invite", code],
    queryFn: () => getInviteByCode(code),
    retry: false,
    staleTime: 30_000,
    meta: { persist: false },
  });

  const inv = q.data;
  const tribe = inv && {
    id: inv.guild_id,
    name: inv.guild_name,
    description: inv.guild_description,
    logo_url: inv.logo_url,
    banner_url: inv.banner_url,
    privacy: inv.privacy,
    member_count: inv.member_count,
    genre: inv.genre,
    token_gating: inv.token_gating,
    created_by: inv.created_by,
  };
  const role = useTribeRole(tribe);
  const { gate, check, address } = useTribeGate(tribe, role);
  const problem = q.isError ? inviteProblem(null) : inviteProblem(inv);

  return (
    <>
      <PageHeader title="Invitation" backHref="/tribes" />
      <div className="mx-auto max-w-[520px] px-4 py-8">
        {q.isPending ? (
          <div className="flex justify-center py-16">
            <Spinner size={28} />
          </div>
        ) : problem ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <IoAlertCircleOutline size={44} className="text-text-tertiary" />
            <p className="font-bold text-text">{problem}</p>
            <p className="text-sm text-text-secondary">Ask the person who invited you for a new link.</p>
            <Button as={Link} href="/tribes/search" title="Browse tribes" size="small" className="mt-2 rounded-full" />
          </div>
        ) : (
          <div className="glass-panel overflow-hidden rounded-[28px] text-center">
            <div className="h-28 bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {tribe.banner_url && <img src={tribe.banner_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="px-6 pb-6">
              <TribeAvatar tribe={tribe} size={84} rounded="rounded-[22px]" className="mx-auto -mt-10 border-4 border-background" />
              <p className="mt-3 text-sm text-text-secondary">You&apos;ve been invited to join</p>
              <h1 className="flex items-center justify-center gap-2 text-2xl font-extrabold text-text">
                {tribe.name} {tribe.privacy === "private" && <IoLockClosed size={16} className="text-primary" />}
              </h1>
              <p className="mb-3 mt-1 flex items-center justify-center gap-1 text-sm text-text-tertiary">
                <IoPeopleOutline size={15} /> {countLabel(tribe.member_count, "member")}
                {tribe.genre ? ` · ${tribe.genre}` : ""}
              </p>
              {tribe.description && <p className="mb-5 line-clamp-4 text-sm text-text-secondary">{tribe.description}</p>}
              {gate && !role.isMember && (
                <div className="mb-5 text-left">
                  <TokenRequirements gate={gate} check={check} address={address} />
                </div>
              )}
              {role.loading ? (
                <Spinner />
              ) : role.isMember ? (
                <Button as={Link} href={`/tribe/${tribe.id}`} title="Open tribe" fullWidth />
              ) : (
                <JoinButton tribe={tribe} role={role} inviteId={inv.id} className="w-full" />
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
