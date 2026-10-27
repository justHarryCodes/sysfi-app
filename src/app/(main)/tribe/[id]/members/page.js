"use client";
// Tribe members — full member list (TribeTabContent members section +
// UserActionsModal's ban for owners).
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { IoSearchOutline, IoBanOutline } from "react-icons/io5";
import TribeScreen from "@/components/tribe/TribeScreen";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import { MessageButton, PersonLink } from "@/components/people/PersonCard";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { tribeKeys, useMembers } from "@/hooks/tribes";
import { invalidateEverywhere } from "@/lib/cache/queryClient";
import { banUser } from "@/lib/tribeApi";
import { formatAddress } from "@/lib/wallet";

const ORDER = { owner: 0, moderator: 1, member: 2, pending: 3 };

function Members({ tribe, role }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { showAlert } = useFeedback();
  const q = useMembers(tribe.id);
  const [filter, setFilter] = useState("");

  const list = useMemo(() => {
    const s = filter.trim().toLowerCase();
    return (q.data || [])
      .filter((m) => !s || [m.display_name, m.username, m.wallet_address].some((v) => v?.toLowerCase().includes(s)))
      .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  }, [q.data, filter]);

  const ban = (m) =>
    showAlert(`Ban ${m.display_name || m.username || "this member"}?`, "They'll be removed, their messages deleted, and they can't rejoin.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Ban",
        style: "destructive",
        onPress: () =>
          banUser(tribe.id, m.user_id, m.username)
            .then(() => {
              invalidateEverywhere(qc, tribeKeys.members(user?.uid, tribe.id));
              qc.invalidateQueries({ queryKey: tribeKeys.tribe(tribe.id) });
            })
            .catch((e) => showAlert("Couldn't ban", e.message)),
      },
    ]);

  return (
    <div className="p-4">
      <label className="mb-3 flex h-11 items-center gap-2 rounded-2xl bg-hover px-4 text-text-tertiary focus-within:shadow-[inset_0_0_0_1px_var(--primary)]">
        <IoSearchOutline size={18} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search members"
          aria-label="Search members"
          className="min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-tertiary"
        />
      </label>
      {q.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <ul className="divide-y divide-divider overflow-hidden rounded-2xl bg-surface">
          {list.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
              <PersonLink uid={m.user_id} className="flex min-w-0 flex-1 items-center gap-3 hover:no-underline" label={`View ${m.display_name || m.username || "member"}`}>
                <Avatar src={m.user_avatar} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text">
                    {m.display_name || m.username || (m.status === "owner" ? "Tribe owner" : "Member")}
                    {m.user_id === user?.uid && <span className="font-normal text-text-tertiary"> (you)</span>}
                  </span>
                  <span className="block truncate text-xs text-text-tertiary">
                    {m.username ? `@${m.username}` : ""}
                    {m.wallet_address ? `${m.username ? " · " : ""}${formatAddress(m.wallet_address, 4)}` : ""}
                  </span>
                </span>
              </PersonLink>
              {m.status !== "member" && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{m.status}</span>
              )}
              {m.user_id !== user?.uid && <MessageButton uid={m.user_id} name={m.display_name || m.username} />}
              {role.isOwner && m.status !== "owner" && m.user_id !== user?.uid && (
                <button type="button" onClick={() => ban(m)} aria-label={`Ban ${m.username || "member"}`} className="rounded-full p-1.5 text-text-tertiary hover:bg-hover hover:text-error">
                  <IoBanOutline size={17} />
                </button>
              )}
            </li>
          ))}
          {!list.length && <li className="px-4 py-8 text-center text-sm text-text-secondary">No members match.</li>}
        </ul>
      )}
    </div>
  );
}

export default function TribeMembersPage() {
  return <TribeScreen>{(p) => <Members {...p} />}</TribeScreen>;
}
