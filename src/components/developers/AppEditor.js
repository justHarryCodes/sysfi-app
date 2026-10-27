"use client";
// Create / edit an Explore listing. Live validation uses the same manifest
// rules as the SDK and the backend (lib/miniapp/manifest.js, generated).
// Editing a live app sends it back to review.
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { IoPlay, IoOpenOutline, IoTrashOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { StatusPill } from "@/components/developers/AppsPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { devKeys, useDevApp, useDeveloperMe } from "@/hooks/developers";
import { CHAIN_LIST } from "@/lib/config";
import { CATEGORIES, validateManifest } from "@/lib/miniapp/manifest";
import { SCOPES } from "@/lib/miniapp/protocol";
import * as M from "@/lib/miniapp/api";

const MAINNETS = CHAIN_LIST.filter((c) => !c.testnet);
const FIELDS = ["kind", "name", "tagline", "description", "iconUrl", "bannerUrl", "category", "url", "requestedScopes", "chains", "defaultChainId", "websiteUrl", "supportUrl"];

const blank = { kind: "miniapp", name: "", tagline: "", description: "", iconUrl: "", bannerUrl: "", category: "tools", url: "", requestedScopes: ["wallet:read", "ui"], chains: [4663], defaultChainId: 4663, websiteUrl: "", supportUrl: "" };

function Editor({ app }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const [f, setF] = useState(() => (app ? Object.fromEntries(FIELDS.map((k) => [k, app[k] ?? blank[k]])) : blank));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target ? e.target.value : e }));
  const toggleIn = (k, v) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const isMini = f.kind === "miniapp";

  // Empty optional strings → absent, so validation matches what's submitted.
  const manifest = Object.fromEntries(
    Object.entries({ ...f, defaultChainId: f.chains.includes(f.defaultChainId) ? f.defaultChainId : f.chains[0] }).filter(([, v]) => v !== "" && v !== undefined),
  );
  if (!isMini) delete manifest.requestedScopes;
  const { valid, errors } = validateManifest(manifest);
  const errorFor = (k) => (touched ? errors.find((e) => e.startsWith(k)) : undefined);

  const save = async () => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    try {
      const saved = app ? await M.updateApp(app.id, manifest) : await M.submitApp(manifest);
      await qc.invalidateQueries({ queryKey: devKeys.apps(user?.uid) });
      qc.setQueryData(devKeys.app(user?.uid, saved.id), saved);
      showAlert(app ? "Sent for review" : "Submitted", "The Sysfi team reviews every listing. You'll see the status here.");
      if (!app) router.replace(`/developers/apps/${saved.id}`);
    } catch (e) {
      showAlert("Couldn't save", e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    showAlert(`Delete ${app.name}?`, "It's removed from Explore and every tribe that installed it.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await M.deleteApp(app.id).catch((e) => showAlert("Couldn't delete", e.message));
          await qc.invalidateQueries({ queryKey: devKeys.apps(user?.uid) });
          router.replace("/developers");
        },
      },
    ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 md:px-5">
      {app && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <StatusPill status={app.status} />
          <span className="text-sm text-text-secondary">
            {app.openCount ?? 0} opens · {app.installCount ?? 0} tribes
          </span>
          {app.status === "approved" && (
            <Link href={`/explore/${app.id}`} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View in Explore <IoOpenOutline size={14} />
            </Link>
          )}
          {app.reviewNotes && <p className="w-full text-sm text-text-secondary">Reviewer: {app.reviewNotes}</p>}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2">
        {[
          ["miniapp", "Mini-app", "Runs inside Sysfi with the SDK"],
          ["external", "Built on Sysfi", "Listed in Explore, opens your site"],
        ].map(([k, label, sub]) => (
          <button key={k} type="button" aria-pressed={f.kind === k} onClick={() => setF((p) => ({ ...p, kind: k }))} className={`rounded-2xl border p-3 text-left ${f.kind === k ? "border-primary bg-primary/[0.06]" : "border-border bg-surface"}`}>
            <span className={`block font-bold ${f.kind === k ? "text-primary" : "text-text"}`}>{label}</span>
            <span className="block text-xs text-text-secondary">{sub}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input label="Name" value={f.name} onChange={set("name")} error={errorFor("name")} maxLength={100} />
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-text-secondary">Category</span>
          <select value={f.category} onChange={set("category")} className="h-[52px] w-full rounded-md border-2 border-border bg-surface px-3 text-text">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Input label="Tagline" hint="One line, shown on cards" value={f.tagline} onChange={set("tagline")} maxLength={140} />
      <Input label="Description" multiline rows={5} value={f.description} onChange={set("description")} maxLength={2000} />
      <Input label={isMini ? "App URL (loaded inside Sysfi)" : "Website URL"} placeholder="https://" value={f.url} onChange={set("url")} error={errorFor("url") || errorFor("originWhitelist")} spellCheck={false} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input label="Icon URL (square, 256px+)" placeholder="https://" value={f.iconUrl} onChange={set("iconUrl")} error={errorFor("iconUrl")} spellCheck={false} />
        <Input label="Banner URL (optional)" placeholder="https://" value={f.bannerUrl} onChange={set("bannerUrl")} error={errorFor("bannerUrl")} spellCheck={false} />
        <Input label="Website (optional)" placeholder="https://" value={f.websiteUrl} onChange={set("websiteUrl")} error={errorFor("websiteUrl")} spellCheck={false} />
        <Input label="Support link (optional)" placeholder="https://" value={f.supportUrl} onChange={set("supportUrl")} error={errorFor("supportUrl")} spellCheck={false} />
      </div>

      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">Networks</p>
      <div className="mb-1 flex flex-wrap gap-1.5">
        {MAINNETS.map((c) => (
          <button key={c.id} type="button" aria-pressed={f.chains.includes(c.id)} onClick={() => toggleIn("chains", c.id)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${f.chains.includes(c.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}>
            <ChainIcon chain={c} size={14} /> {c.shortName}
          </button>
        ))}
      </div>
      {f.chains.length > 1 && (
        <label className="mb-4 mt-2 flex items-center gap-2 text-sm text-text-secondary">
          Opens on
          <select value={f.defaultChainId} onChange={(e) => setF((p) => ({ ...p, defaultChainId: Number(e.target.value) }))} className="rounded-md border border-border bg-surface px-2 py-1 text-text">
            {MAINNETS.filter((c) => f.chains.includes(c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {isMini && (
        <>
          <p className="mb-1 mt-4 text-xs font-bold uppercase tracking-wider text-text-tertiary">Access it needs (ask only for what you use)</p>
          <div className="mb-4 grid gap-1 sm:grid-cols-2">
            {Object.entries(SCOPES).map(([s, label]) => (
              <label key={s} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <input type="checkbox" checked={f.requestedScopes.includes(s)} onChange={() => toggleIn("requestedScopes", s)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span className="text-sm">
                  <span className="font-mono text-xs text-text">{s}</span>
                  <span className="block text-xs text-text-tertiary">{label}</span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      {touched && errors.length > 0 && (
        <ul className="mb-4 list-disc rounded-xl bg-down/[0.06] py-3 pl-8 pr-4 text-sm text-down">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {app?.status === "approved" && <p className="mb-3 text-xs text-neutral">Saving changes takes the live listing back into review until it&apos;s approved again.</p>}
      <div className="flex flex-wrap gap-2">
        <Button title={app ? "Save & send for review" : "Submit for review"} loading={busy} onClick={save} />
        {isMini && f.url && (
          <Link href={`/explore/dev?url=${encodeURIComponent(f.url)}&name=${encodeURIComponent(f.name)}`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text hover:bg-hover">
            <IoPlay size={14} /> Test in preview
          </Link>
        )}
        {app && (
          <button type="button" onClick={remove} className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-down">
            <IoTrashOutline size={15} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function AppEditorScreen() {
  const { id } = useParams();
  const isNew = id === "new";
  const me = useDeveloperMe();
  const app = useDevApp(isNew ? null : id);
  const verified = me.data?.developer?.status === "verified" || me.data?.isAdmin;

  if (me.isPending || (!isNew && app.isPending)) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size={28} />
      </div>
    );
  }
  if (!verified) {
    return (
      <>
        <PageHeader title="New app" backHref="/developers" />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">
          Publishing is for verified developers. <Link href="/developers" className="font-semibold text-primary">Apply in the developer portal</Link>.
        </p>
      </>
    );
  }
  if (!isNew && !app.data) {
    return (
      <>
        <PageHeader title="App" backHref="/developers" />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">This app isn&apos;t yours or doesn&apos;t exist.</p>
      </>
    );
  }
  return (
    <>
      <PageHeader title={isNew ? "New app" : app.data.name} subtitle="Developer portal" backHref="/developers" />
      <Editor app={isNew ? null : app.data} />
    </>
  );
}
