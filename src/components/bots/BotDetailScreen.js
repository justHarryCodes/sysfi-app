"use client";
// /explore/bots/[id] — what a bot does and asks for, and adding it to a
// tribe you own or moderate.
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { IoOpenOutline, IoCheckmarkCircle, IoChatbubblesOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import { BotAvatar, BotBadge, PermissionList } from "@/components/bots/BotBits";
import { StatusPill } from "@/components/developers/AppsPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useSignInGate } from "@/hooks/useSignInGate";
import { useFeedback } from "@/contexts/FeedbackContext";
import { botKeys, useBot, useInstallTargets } from "@/hooks/bots";
import { installBot, BOT_PERMISSIONS } from "@/lib/bots";

function AddToTribe({ bot, onClose }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const targets = useInstallTargets(bot.id, true);
  const [tribeId, setTribeId] = useState(null);
  const [perms, setPerms] = useState(() => bot.permissions);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const list = targets.data ?? [];
  const picked = list.find((t) => t.id === tribeId);
  const isMod = picked?.role === "moderator";
  const grant = isMod ? perms.filter((p) => !BOT_PERMISSIONS[p]?.sensitive) : perms;

  const add = async () => {
    setBusy(true);
    try {
      const r = await installBot(picked.id, bot.id, grant);
      qc.invalidateQueries({ queryKey: botKeys.targets(user?.uid, bot.id) });
      qc.invalidateQueries({ queryKey: botKeys.tribe(user?.uid, picked.id) });
      setDone({ tribe: picked, granted: r.granted });
    } catch (e) {
      showAlert("Couldn't add the bot", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} labelledBy="addbot-title">
      {done ? (
        <div className="text-center">
          <IoCheckmarkCircle size={44} className="mx-auto mb-2 text-up" />
          <h2 id="addbot-title" className="mb-1 text-lg font-bold text-text">
            @{bot.username} joined {done.tribe.name}
          </h2>
          <p className="mb-5 text-sm text-text-secondary">
            {bot.commands?.length ? `Try /${bot.commands[0].name} in the chat.` : `Mention @${bot.username} in the chat.`}
          </p>
          <Link href={`/tribe/${done.tribe.id}/chat`} className="mb-2 flex h-11 items-center justify-center gap-2 rounded-md bg-primary font-bold text-on-primary">
            <IoChatbubblesOutline size={17} /> Open chat
          </Link>
          <Button title="Done" variant="outline" fullWidth onClick={onClose} />
        </div>
      ) : (
        <>
          <h2 id="addbot-title" className="mb-1 text-lg font-bold text-text">
            Add @{bot.username}
          </h2>
          <p className="mb-4 text-sm text-text-secondary">Pick a tribe you own or moderate.</p>
          {targets.isPending ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : !list.length ? (
            <p className="mb-4 rounded-xl bg-hover p-4 text-sm text-text-secondary">You don&apos;t own or moderate any tribes yet.</p>
          ) : (
            <ul className="mb-4 max-h-56 space-y-1 overflow-y-auto">
              {list.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={t.installed}
                    aria-pressed={tribeId === t.id}
                    onClick={() => setTribeId(t.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left disabled:opacity-50 ${tribeId === t.id ? "border-primary bg-primary/[0.06]" : "border-border hover:bg-hover"}`}
                  >
                    <TribeAvatar tribe={{ ...t, logo_url: t.logoUrl }} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text">{t.name}</span>
                      <span className="block text-xs capitalize text-text-tertiary">{t.installed ? "Already added" : t.role}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picked && (
            <>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">It will be able to</p>
              <PermissionList requested={bot.permissions} value={grant} onChange={setPerms} lockedSensitive={isMod} info={bot.permissionInfo ?? BOT_PERMISSIONS} />
              <p className="mb-4 mt-2 text-xs text-text-tertiary">It always hears /commands, @mentions, button clicks and new members. You can change this later in tribe settings.</p>
            </>
          )}
          <Button title="Add to tribe" fullWidth loading={busy} disabled={!picked} onClick={add} className="mb-2" />
          <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
        </>
      )}
    </Modal>
  );
}

export default function BotDetailScreen() {
  const { id } = useParams();
  const bot = useBot(id);
  const { requireSignIn } = useSignInGate();
  const [adding, setAdding] = useState(false);
  const b = bot.data;

  return (
    <>
      <PageHeader title={b?.name ?? "Bot"} subtitle="Explore · Bots" backHref="/explore?tab=bots" />
      {bot.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner size={26} />
        </div>
      ) : bot.isError || !b ? (
        <p className="px-4 py-10 text-center text-sm text-text-secondary">{bot.error?.message ?? "Bot not found."}</p>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 md:px-5">
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface p-4">
            <BotAvatar bot={b} size={72} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="truncate text-xl font-extrabold text-text">{b.name}</span>
                <BotBadge />
                {b.status !== "approved" && <StatusPill status={b.status} />}
              </p>
              <p className="font-mono text-xs text-text-tertiary">@{b.username}</p>
              <p className="text-xs text-text-secondary">
                by {b.developerName} · in {b.installCount ?? 0} tribe{b.installCount === 1 ? "" : "s"}
              </p>
            </div>
            <Button title="Add to a tribe" onClick={requireSignIn(() => setAdding(true))} />
          </div>
          {b.status !== "approved" && b.isMine && (
            <p className="rounded-xl bg-neutral/10 px-4 py-3 text-sm text-neutral">Not reviewed yet — only you can add it, to tribes you own or moderate, for testing.</p>
          )}
          {b.description && <p className="whitespace-pre-wrap text-sm text-text">{b.description}</p>}

          {b.commands?.length > 0 && (
            <section className="rounded-2xl border border-border bg-surface p-4">
              <h2 className="mb-2 font-bold text-text">Commands</h2>
              <ul className="space-y-1.5">
                {b.commands.map((c) => (
                  <li key={c.name} className="text-sm">
                    <span className="font-mono font-semibold text-text">
                      /{c.name}
                      {(c.options ?? []).map((o) => (
                        <span key={o.name} className="font-normal text-text-tertiary">
                          {" "}
                          {o.required ? `<${o.name}>` : `[${o.name}]`}
                        </span>
                      ))}
                    </span>
                    <span className="text-text-secondary"> — {c.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-2 font-bold text-text">It asks to</h2>
            <ul className="space-y-1 text-sm">
              {b.permissions.map((p) => (
                <li key={p} className={b.permissionInfo?.[p]?.sensitive ? "text-neutral" : "text-text"}>
                  • {b.permissionInfo?.[p]?.label ?? BOT_PERMISSIONS[p]?.label ?? p}
                  {b.permissionInfo?.[p]?.sensitive ? " (owner approval)" : ""}
                </li>
              ))}
            </ul>
          </section>

          {b.websiteUrl && (
            <a href={b.websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
              Website <IoOpenOutline size={13} />
            </a>
          )}
          {adding && <AddToTribe bot={b} onClose={() => setAdding(false)} />}
        </div>
      )}
    </>
  );
}
