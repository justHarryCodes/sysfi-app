"use client";
// Explore app page: what it is, who made it, what it can access, and Open
// (mini-app, inside Sysfi) or Visit (Built on Sysfi). Tribe owners can add a
// mini-app to their tribe with the scopes they choose.
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { IoOpenOutline, IoPlay, IoAddCircleOutline, IoShieldCheckmarkOutline, IoGlobeOutline, IoHelpBuoyOutline, IoCloseCircleOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import RunMiniApp from "@/components/explore/RunMiniApp";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { exploreKeys, useGrant, useMiniApp } from "@/hooks/explore";
import { useMyTribes } from "@/hooks/tribes";
import { getChainById } from "@/lib/config";
import { SCOPES } from "@/lib/miniapp/protocol";
import * as M from "@/lib/miniapp/api";
import { useSignInGate } from "@/hooks/useSignInGate";
import { tribeOwner } from "@/lib/tribeApi";

function InstallSheet({ app, onClose }) {
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const tribes = (useMyTribes().data ?? []).filter((t) => tribeOwner(t) === user?.uid);
  const [tribeId, setTribeId] = useState(null);
  const [scopes, setScopes] = useState(() => new Set(app.requestedScopes ?? []));
  const [busy, setBusy] = useState(false);
  const toggle = (s) => setScopes((p) => {
    const n = new Set(p);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });
  const install = async () => {
    setBusy(true);
    try {
      await M.installApp(tribeId, app.id, [...scopes]);
      showAlert("Added", `${app.name} is now in your tribe's Apps.`);
      onClose();
    } catch (e) {
      showAlert("Couldn't add the app", e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} labelledBy="install-title">
      <h2 id="install-title" className="mb-1 text-lg font-bold text-text">
        Add {app.name} to a tribe
      </h2>
      <p className="mb-4 text-sm text-text-secondary">Members can open it from the tribe. You decide what it can access there.</p>
      {tribes.length === 0 ? (
        <p className="mb-4 rounded-xl bg-surface p-4 text-sm text-text-secondary">You don&apos;t own a tribe yet.</p>
      ) : (
        <div className="mb-4 max-h-48 space-y-1 overflow-y-auto">
          {tribes.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tribeId === t.id}
              onClick={() => setTribeId(t.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${tribeId === t.id ? "bg-primary/10" : "hover:bg-hover"}`}
            >
              <TribeAvatar tribe={t} size={32} />
              <span className="truncate text-sm font-semibold text-text">{t.name}</span>
            </button>
          ))}
        </div>
      )}
      {(app.requestedScopes ?? []).length > 0 && (
        <>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">Allow it to</p>
          <ul className="mb-4">
            {app.requestedScopes.map((s) => (
              <li key={s}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-hover">
                  <input type="checkbox" checked={scopes.has(s)} onChange={() => toggle(s)} className="h-4 w-4 accent-[var(--primary)]" />
                  <span className="text-sm text-text">{SCOPES[s] ?? s}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <Button title="Add to tribe" fullWidth disabled={!tribeId} loading={busy} onClick={install} className="mb-2" />
      <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
    </Modal>
  );
}

export default function AppDetailScreen() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const { requireSignIn } = useSignInGate();
  const q = useMiniApp(id);
  const grant = useGrant(q.data?.kind === "miniapp" ? id : null);
  const [running, setRunning] = useState(false);
  const [installing, setInstalling] = useState(false);

  if (q.isPending) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} className="text-primary" />
      </div>
    );
  }
  const app = q.data;
  if (!app) {
    return (
      <>
        <PageHeader title="Explore" backHref="/explore" />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">This app isn&apos;t available.</p>
      </>
    );
  }
  const external = app.kind === "external";
  const chains = (app.chains ?? []).map(getChainById).filter(Boolean);

  if (running) {
    return (
      <div className="md:p-5">
        <RunMiniApp app={app} onClose={() => setRunning(false)} />
      </div>
    );
  }

  return (
    <>
      <PageHeader title={app.name} backHref={`/explore${external ? "?tab=external" : ""}`} />
      {app.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={app.bannerUrl} alt="" className="h-40 w-full object-cover md:h-52" />
      )}
      <div className="mx-auto max-w-3xl px-4 py-5 md:px-5">
        <div className="mb-5 flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={app.iconUrl || "/icon.png"} alt="" className="h-20 w-20 shrink-0 rounded-3xl bg-surface object-cover" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-[-0.3px] text-text">{app.name}</h1>
            {app.tagline && <p className="text-sm text-text-secondary">{app.tagline}</p>}
            <p className="mt-1 text-xs text-text-tertiary">
              {app.developerName ? `by ${app.developerName} · ` : ""}
              <span className="capitalize">{app.category}</span> · {new URL(app.url).host}
            </p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {external ? (
            <a href={app.url} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-on-primary hover:opacity-90">
              Visit <IoOpenOutline size={16} />
            </a>
          ) : (
            <button type="button" onClick={requireSignIn(() => setRunning(true))} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 font-bold text-on-primary hover:opacity-90">
              <IoPlay size={16} /> {app.category === "games" ? "Play" : "Open"}
            </button>
          )}
          {!external && user && (
            <button type="button" onClick={requireSignIn(() => setInstalling(true))} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 font-semibold text-text hover:bg-hover">
              <IoAddCircleOutline size={18} /> Add to a tribe
            </button>
          )}
          {app.websiteUrl && (
            <a href={app.websiteUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 font-semibold text-text hover:bg-hover">
              <IoGlobeOutline size={17} /> Website
            </a>
          )}
          {app.supportUrl && (
            <a href={app.supportUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 font-semibold text-text hover:bg-hover">
              <IoHelpBuoyOutline size={17} /> Support
            </a>
          )}
        </div>

        {app.description && <p className="mb-6 whitespace-pre-line text-[15px] leading-6 text-text">{app.description}</p>}

        {chains.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-bold text-text">Networks</h2>
            <div className="flex flex-wrap gap-2">
              {chains.map((c) => (
                <span key={c.id} className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary">
                  <ChainIcon chain={c} size={14} /> {c.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {!external && (
          <section className="rounded-2xl border border-border bg-surface p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-text">
              <IoShieldCheckmarkOutline size={17} className="text-primary" /> What it can access
            </h2>
            {(app.requestedScopes ?? []).length ? (
              <ul className="space-y-1.5 text-sm text-text-secondary">
                {app.requestedScopes.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${grant.data?.scopes?.includes(s) ? "bg-up" : "bg-border"}`} />
                    {SCOPES[s] ?? s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-secondary">Nothing — it doesn&apos;t use your wallet or profile.</p>
            )}
            <p className="mt-3 text-xs text-text-tertiary">Signatures, transactions and payments always need your confirmation in Sysfi.</p>
            {grant.data && (
              <button
                type="button"
                onClick={async () => {
                  await M.revokeGrant(app.id).catch((e) => showAlert("Couldn't revoke", e.message));
                  qc.setQueryData(exploreKeys.grant(user?.uid, app.id), null);
                }}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-down"
              >
                <IoCloseCircleOutline size={16} /> Revoke access
              </button>
            )}
          </section>
        )}
      </div>
      {installing && <InstallSheet app={app} onClose={() => setInstalling(false)} />}
    </>
  );
}
