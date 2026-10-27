"use client";
// components/people/PersonCard.js — the profile card for any user, opened by
// tapping a name or avatar (posts, comments, tribe chat, member lists):
// picture, name, @username, the tribes you share, and a Message button that
// opens (or requests) an encrypted conversation on /messages?to=<uid>.
//
//   <PersonCardProvider> once, around the app (AppShell)
//   <PersonLink uid={…}>name or avatar</PersonLink>   anywhere inside
//   usePersonCard().openPerson(uid)                     to open it directly
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { IoChatbubbleEllipsesOutline, IoLockClosed, IoPeopleOutline } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useSignInGate } from "@/hooks/useSignInGate";
import { canStartMessage, getPerson, messageBlockedReason } from "@/lib/people";

const PersonCardContext = createContext({ openPerson: () => {} });
export const usePersonCard = () => useContext(PersonCardContext);

/** Where the Message button goes: the Messages screen opens or requests the conversation. */
export const messagePath = (uid) => `/messages?to=${encodeURIComponent(uid)}`;

function Card({ uid, onClose }) {
  const { user } = useAuth();
  const router = useRouter();
  const person = useQuery({ queryKey: ["user", user?.uid, "person", uid], queryFn: () => getPerson(uid), staleTime: 30_000, meta: { persist: false } });
  const p = person.data;

  if (person.isPending) return <div className="flex h-56 items-center justify-center"><Spinner /></div>;
  if (!p) return <p className="py-10 text-center text-sm text-text-secondary">{person.error?.status === 404 ? "This account doesn’t exist anymore." : "Couldn’t load this profile."}</p>;

  const name = p.displayName || p.username || "Sysfi user";
  const self = p.canMessage === "self";
  const reason = messageBlockedReason(p.canMessage);

  return (
    <div className="text-center">
      <div className="mx-auto w-fit">
        <Avatar src={p.avatarUrl} size={84} />
      </div>
      <h2 id="person-card-title" className="mt-3 text-xl font-extrabold tracking-[-0.3px] text-text">{name}</h2>
      {p.username && <p className="text-sm text-text-tertiary">@{p.username}</p>}

      <div className="mt-5 text-left">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[1.2px] text-text-tertiary">
          <IoPeopleOutline size={13} />
          {self ? "Your tribes" : p.sharedTribes.length ? `${p.sharedTribes.length} tribe${p.sharedTribes.length === 1 ? "" : "s"} in common` : "Tribes in common"}
        </p>
        {p.sharedTribes.length ? (
          <div className="flex flex-wrap gap-2">
            {p.sharedTribes.slice(0, 6).map((t) => (
              <Link key={t.id} href={`/tribe/${t.id}`} onClick={onClose} className="flex max-w-full items-center gap-2 rounded-full border border-panel-border bg-surface py-1 pl-1 pr-3 text-sm font-semibold text-text hover:border-primary/40">
                <TribeAvatar tribe={t} size={24} />
                <span className="truncate">{t.name}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">None yet.</p>
        )}
      </div>

      {self ? (
        <Button as={Link} href="/profile" title="View your profile" variant="secondary" fullWidth className="mt-6" onClick={onClose} />
      ) : p.canMessage === "off" ? null : (
        <>
          <Button
            title={p.canMessage === "request" ? "Send message request" : "Message"}
            icon={<IoChatbubbleEllipsesOutline size={18} />}
            fullWidth
            className="mt-6"
            disabled={!canStartMessage(p.canMessage)}
            onClick={() => {
              onClose();
              router.push(messagePath(uid));
            }}
          />
          <p className="mt-2 flex items-center justify-center gap-1 text-xs text-text-tertiary">
            {reason ?? (
              <>
                <IoLockClosed size={11} /> End-to-end encrypted
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

export function PersonCardProvider({ children }) {
  const [uid, setUid] = useState(null);
  const close = useCallback(() => setUid(null), []);
  const value = useMemo(() => ({ openPerson: (id) => id && setUid(id) }), []);
  return (
    <PersonCardContext.Provider value={value}>
      {children}
      <Modal open={!!uid} onClose={close} labelledBy="person-card-title">
        {uid && <Card key={uid} uid={uid} onClose={close} />}
      </Modal>
    </PersonCardContext.Provider>
  );
}

/** Round "Message" icon for lists (members): straight to the conversation. Hidden when messaging is off. */
export function MessageButton({ uid, name }) {
  const router = useRouter();
  const { requireSignIn } = useSignInGate();
  if (!uid || process.env.NEXT_PUBLIC_FEATURE_DMS !== "1") return null;
  return (
    <button
      type="button"
      aria-label={`Message ${name || "this member"}`}
      title="Message"
      onClick={requireSignIn(() => router.push(messagePath(uid)))}
      className="rounded-full p-2 text-text-tertiary transition-colors hover:bg-primary/10 hover:text-primary"
    >
      <IoChatbubbleEllipsesOutline size={18} />
    </button>
  );
}

/**
 * A name or avatar that opens the card. Signed-out visitors are asked to sign
 * in first. Renders plain children when there's no user to show (bots,
 * missing ids).
 */
export function PersonLink({ uid, children, className = "", label }) {
  const { openPerson } = usePersonCard();
  const { requireSignIn } = useSignInGate();
  if (!uid) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      aria-label={label}
      className={`cursor-pointer text-left hover:underline focus-visible:underline ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        requireSignIn(() => openPerson(uid))();
      }}
    >
      {children}
    </button>
  );
}
