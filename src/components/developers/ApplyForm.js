"use client";
// Developer application — verified developers publish to Explore and get API
// keys. Reviewed by the Tribe team.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useWallet } from "@/contexts/WalletContext";
import { devKeys } from "@/hooks/developers";
import { applyAsDeveloper } from "@/lib/developers";

const httpsOk = (v) => {
  if (!v) return true;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
};

export default function ApplyForm({ existing, submitLabel = "Submit application" }) {
  const { user } = useAuth();
  const { address } = useWallet();
  const { showAlert } = useFeedback();
  const qc = useQueryClient();
  const [f, setF] = useState(() => ({
    displayName: existing?.displayName ?? user?.displayName ?? "",
    organization: existing?.organization ?? "",
    email: existing?.email ?? user?.email ?? "",
    websiteUrl: existing?.websiteUrl ?? "",
    githubUrl: existing?.githubUrl ?? "",
    xUrl: existing?.xUrl ?? "",
    walletAddress: existing?.walletAddress ?? address ?? "",
    building: existing?.building ?? "",
  }));
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const errors = {};
  if (f.displayName.trim().length < 2) errors.displayName = "At least 2 characters";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errors.email = "Enter a valid email";
  if (f.building.trim().length < 20) errors.building = "Tell us a little more (20+ characters)";
  for (const k of ["websiteUrl", "githubUrl", "xUrl"]) if (!httpsOk(f[k].trim())) errors[k] = "Use a full https:// link";
  if (f.walletAddress && !/^0x[0-9a-fA-F]{40}$/.test(f.walletAddress.trim())) errors.walletAddress = "Enter an EVM address";
  const show = (k) => (touched ? errors[k] : undefined);

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || undefined]));
      await applyAsDeveloper(body);
      await qc.invalidateQueries({ queryKey: devKeys.me(user?.uid) });
      showAlert("Application sent", "We'll review it and email you. You can keep testing in the developer preview meanwhile.");
    } catch (err) {
      showAlert("Couldn't submit", err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-border bg-surface p-4">
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Input label="Name shown on your apps" value={f.displayName} onChange={set("displayName")} error={show("displayName")} maxLength={100} />
        <Input label="Team or company (optional)" value={f.organization} onChange={set("organization")} maxLength={120} />
        <Input label="Contact email" type="email" value={f.email} onChange={set("email")} error={show("email")} autoComplete="email" />
        <Input label="Wallet (optional)" placeholder="0x…" value={f.walletAddress} onChange={set("walletAddress")} error={show("walletAddress")} spellCheck={false} />
        <Input label="Website (optional)" placeholder="https://" value={f.websiteUrl} onChange={set("websiteUrl")} error={show("websiteUrl")} />
        <Input label="GitHub (optional)" placeholder="https://github.com/…" value={f.githubUrl} onChange={set("githubUrl")} error={show("githubUrl")} />
        <Input label="X / Twitter (optional)" placeholder="https://x.com/…" value={f.xUrl} onChange={set("xUrl")} error={show("xUrl")} />
      </div>
      <Input
        label="What are you building?"
        hint="Mini-apps, bots, tools — what it does, who it's for, and which Sysfi features it uses."
        multiline
        rows={5}
        value={f.building}
        onChange={set("building")}
        error={show("building")}
        maxLength={2000}
      />
      <Button type="submit" title={submitLabel} loading={busy} />
    </form>
  );
}
