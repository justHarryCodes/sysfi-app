"use client";
// API keys — server-side credentials for the public API. Only a hash is
// stored; the secret is shown once.
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { IoKeyOutline, IoCopyOutline, IoCheckmark, IoTrashOutline, IoWarningOutline } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { devKeys, useApiKeys } from "@/hooks/developers";
import { createKey, revokeKey } from "@/lib/developers";
import { timeAgo } from "@/lib/format";

function CreateKey({ apiScopes, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(() => new Set(["tribes:read", "assets:read"]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (s) => setScopes((p) => {
    const n = new Set(p);
    n.has(s) ? n.delete(s) : n.add(s);
    return n;
  });
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setErr("Name your key (e.g. \"production server\")");
    setBusy(true);
    try {
      onCreated(await createKey(name.trim(), [...scopes]));
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} labelledBy="key-title">
      <form onSubmit={submit} noValidate>
        <h2 id="key-title" className="mb-1 text-lg font-bold text-text">
          New API key
        </h2>
        <p className="mb-4 text-sm text-text-secondary">Use it from your server only — never in a browser or app bundle.</p>
        <Input label="Name" placeholder="production server" value={name} onChange={(e) => setName(e.target.value)} error={err} maxLength={80} />
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">Access</p>
        <ul className="mb-4">
          {Object.entries(apiScopes ?? {}).map(([s, label]) => (
            <li key={s}>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <input type="checkbox" checked={scopes.has(s)} onChange={() => toggle(s)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span className="text-sm">
                  <span className="font-mono text-xs text-text">{s}</span>
                  <span className="block text-xs text-text-tertiary">{label}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button type="submit" title="Create key" fullWidth loading={busy} disabled={!scopes.size} className="mb-2" />
        <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
      </form>
    </Modal>
  );
}

function ShowSecret({ created, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal open onClose={onClose} labelledBy="secret-title" dismissible={false}>
      <h2 id="secret-title" className="mb-1 text-lg font-bold text-text">
        Copy your key now
      </h2>
      <p className="mb-3 flex gap-2 text-sm text-neutral">
        <IoWarningOutline size={17} className="mt-0.5 shrink-0" /> This is the only time it&apos;s shown. Store it in your server&apos;s secrets.
      </p>
      <div className="mb-4 flex items-center gap-2 rounded-xl bg-background p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-text">{created.secret}</code>
        <button
          type="button"
          aria-label="Copy key"
          onClick={async () => {
            await navigator.clipboard.writeText(created.secret);
            setCopied(true);
          }}
          className="shrink-0 rounded-lg p-2 text-text-secondary hover:bg-hover"
        >
          {copied ? <IoCheckmark size={16} className="text-up" /> : <IoCopyOutline size={16} />}
        </button>
      </div>
      <p className="mb-4 font-mono text-[11px] text-text-tertiary">curl -H &quot;Authorization: Bearer {created.prefix}…&quot; https://api.sysfi.network/api/public/v1/…</p>
      <Button title={copied ? "Done" : "I've stored it"} fullWidth onClick={onClose} />
    </Modal>
  );
}

export default function KeysPanel({ apiScopes }) {
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const qc = useQueryClient();
  const keys = useApiKeys();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: devKeys.keys(user?.uid) });
  const active = (keys.data ?? []).filter((k) => !k.revokedAt);
  const revoked = (keys.data ?? []).filter((k) => k.revokedAt);

  const revoke = (k) =>
    showAlert(`Revoke "${k.name}"?`, "Requests using it stop working within 30 seconds. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke", style: "destructive", onPress: () => revokeKey(k.id).then(refresh).catch((e) => showAlert("Couldn't revoke", e.message)) },
    ]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          Keys for the public API: read tribes, posts, DAOs and assets. Server-side only.{" "}
          <Link href="/developers/docs" className="font-semibold text-primary">
            API reference
          </Link>
        </p>
        <Button title="New key" size="small" icon={<IoKeyOutline size={15} />} onClick={() => setCreating(true)} />
      </div>
      {keys.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : !active.length ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">No keys yet.</p>
      ) : (
        <ul className="divide-y divide-divider rounded-2xl border border-border bg-surface">
          {active.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-3">
              <IoKeyOutline size={18} className="shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text">{k.name}</p>
                <p className="truncate font-mono text-[11px] text-text-tertiary">
                  {k.prefix}… · {k.scopes.join(", ")} · {k.lastUsedAt ? `used ${timeAgo(Date.parse(k.lastUsedAt))}` : "never used"}
                  {k.usage && ` · ${k.usage.today.toLocaleString()} today · ${k.usage.last7Days.toLocaleString()} this week`}
                </p>
              </div>
              <button type="button" aria-label={`Revoke ${k.name}`} onClick={() => revoke(k)} className="rounded-lg p-2 text-text-tertiary hover:bg-hover hover:text-down">
                <IoTrashOutline size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {revoked.length > 0 && <p className="mt-2 text-xs text-text-tertiary">{revoked.length} revoked key{revoked.length === 1 ? "" : "s"} hidden.</p>}
      {creating && (
        <CreateKey
          apiScopes={apiScopes}
          onClose={() => setCreating(false)}
          onCreated={(k) => {
            setCreating(false);
            setCreated(k);
            refresh();
          }}
        />
      )}
      {created && <ShowSecret created={created} onClose={() => setCreated(null)} />}
    </div>
  );
}
