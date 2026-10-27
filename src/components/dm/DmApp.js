"use client";
// components/dm/DmApp.js — the Messages screen. Desktop: conversation list +
// thread side by side; phones: one pane at a time. URL holds the open
// conversation (?c=<id>) or the settings view (?view=settings);
// ?to=<uid> (the profile card's Message button) opens or requests a
// conversation with that person, after setup if this browser needs it.
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IoChatbubblesOutline, IoLockClosed } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import { DmProvider, useDm } from "./DmProvider";
import Onboarding from "./Onboarding";
import ConversationList from "./ConversationList";
import Thread from "./Thread";
import DmSettings from "./DmSettings";
import { canStartMessage, getPerson, messageBlockedReason } from "@/lib/people";

/** ?to=<uid>: start (or reopen) the conversation, then show it. */
function StartWith({ uid, onOpen, onCancel }) {
  const { client } = useDm();
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const person = await getPerson(uid);
        if (!canStartMessage(person.canMessage)) throw new Error(messageBlockedReason(person.canMessage) ?? "You can’t message this person.");
        const { conversation } = await client.start(uid);
        if (live) onOpen(conversation.id);
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => {
      live = false;
    };
  }, [client, uid, onOpen]);
  return (
    <div className="flex h-[60dvh] flex-col items-center justify-center gap-3 p-8 text-center">
      {error ? (
        <>
          <p className="font-bold text-text">Couldn’t start this conversation</p>
          <p className="text-sm text-text-tertiary">{error}</p>
          <Button title="Back to messages" size="small" variant="secondary" onClick={onCancel} />
        </>
      ) : (
        <>
          <Spinner />
          <p className="text-sm text-text-tertiary">Opening conversation…</p>
        </>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-10 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <IoChatbubblesOutline size={26} />
      </span>
      <p className="text-lg font-extrabold text-text">Select a conversation</p>
      <p className="mt-1 flex items-center gap-1 text-sm text-text-tertiary">
        <IoLockClosed size={12} /> Private and end-to-end encrypted
      </p>
    </div>
  );
}

function Messages() {
  const { status, refreshStatus } = useDm();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("c");
  const view = params.get("view");
  const to = params.get("to");

  const go = useCallback((q) => router.push(q ? `${pathname}?${q}` : pathname, { scroll: false }), [router, pathname]);
  const openFresh = useCallback((id) => router.replace(`${pathname}?c=${id}`, { scroll: false }), [router, pathname]);
  const cancelTo = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);
  const open = useCallback((id) => go(`c=${id}`), [go]);
  const home = useCallback(() => go(""), [go]);

  if (status.state === "loading") return <div className="flex h-[60dvh] items-center justify-center"><Spinner /></div>;
  if (status.state === "error") {
    return (
      <div className="flex h-[60dvh] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="font-bold text-text">Messages aren’t available right now</p>
        <p className="text-sm text-text-tertiary">{status.error}</p>
        <Button title="Try again" size="small" onClick={refreshStatus} />
      </div>
    );
  }
  if (status.state !== "ready") return <Onboarding />;
  if (to && !active) return <StartWith key={to} uid={to} onOpen={openFresh} onCancel={cancelTo} />;

  const side = view === "settings" ? <DmSettings onBack={home} /> : <ConversationList activeId={active} onOpen={open} onSettings={() => go("view=settings")} />;
  const main = active ? <Thread key={active} conversationId={active} onBack={home} onClosed={home} /> : <Empty />;

  return (
    // Fills the content panel: viewport − top bar (64) − panel padding (40) − main's bottom padding (32).
    <div className="flex h-[calc(100dvh-140px)] min-h-[480px] md:h-[calc(100dvh-136px)]">
      <div className={`w-full shrink-0 border-panel-border md:block md:w-[360px] md:border-r ${active ? "hidden" : "block"}`}>{side}</div>
      <div className={`min-w-0 flex-1 ${active ? "block" : "hidden md:block"}`}>{main}</div>
    </div>
  );
}

export default function DmApp() {
  return (
    <DmProvider>
      <Messages />
    </DmProvider>
  );
}
