"use client";
// components/dm/DmSettings.js — who can message me, read receipts, linking
// a new device (scan its QR), the wallet backup, key rotation and blocked people.
import { useEffect, useState } from "react";
import { IoArrowBack, IoQrCodeOutline, IoRefreshOutline, IoWalletOutline } from "react-icons/io5";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import QRScanner, { isQRScanSupported } from "@/components/wallet/QRScanner";
import { useFeedback } from "@/contexts/FeedbackContext";
import { parseLinkQr } from "@/lib/dm/crypto";
import { formatAddress } from "@/lib/wallet";
import { useBackupWallet, useDm, useProfiles } from "./DmProvider";
import { displayName } from "./ConversationList";

const asLinkCode = (text) => {
  try {
    parseLinkQr(text);
    return text;
  } catch {
    return null;
  }
};

function Section({ title, children }) {
  return (
    <section className="border-b border-panel-border px-5 py-5">
      <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[1.3px] text-text-tertiary">{title}</h2>
      {children}
    </section>
  );
}

function Choice({ checked, onChange, title, body }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${checked ? "bg-primary/10" : "hover:bg-hover"}`}>
      <input type="radio" checked={checked} onChange={onChange} className="mt-1 accent-[var(--primary)]" />
      <span>
        <span className="block font-semibold text-text">{title}</span>
        <span className="block text-sm text-text-tertiary">{body}</span>
      </span>
    </label>
  );
}

function LinkDevice({ open, onClose }) {
  const { client } = useDm();
  const [scan, setScan] = useState(false);
  const [paste, setPaste] = useState("");
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);
  const approve = async (text) => {
    setScan(false);
    setError(null);
    try {
      setDone(await client.approveLink(text));
    } catch (e) {
      setError(e.message);
    }
  };
  const close = () => {
    setDone(null);
    setError(null);
    setPaste("");
    onClose();
  };
  return (
    <>
      <Modal open={open && !scan} onClose={close} labelledBy="dm-link-title">
        <h2 id="dm-link-title" className="text-xl font-extrabold text-text">Link a device</h2>
        {done ? (
          <>
            <p className="mt-3 text-sm text-text-secondary">Keys sent. Make sure the other screen shows this code:</p>
            <p className="my-4 text-center font-mono text-3xl font-bold tracking-[0.3em] text-text">{done.code}</p>
            <p className="text-xs text-text-tertiary">If it doesn’t match, someone may be interfering — rotate your keys.</p>
            <Button title="Done" fullWidth className="mt-5" onClick={close} />
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-text-secondary">On the new device, open Messages and choose “Link from another device”. Then scan the code it shows.</p>
            {isQRScanSupported() ? (
              <Button title="Scan code" icon={<IoQrCodeOutline size={18} />} fullWidth className="mt-5" onClick={() => setScan(true)} />
            ) : (
              <p className="mt-4 text-xs text-text-tertiary">This browser can’t scan. Copy the code text from the other device instead.</p>
            )}
            <div className="mt-4">
              <Input label="Or paste the code" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="sysfi-dm-link:1:…" inputClassName="font-mono text-xs" />
              <Button title="Link" variant="secondary" size="small" disabled={!paste.trim()} onClick={() => approve(paste.trim())} />
            </div>
            {error && <p className="mt-3 text-sm text-error">{error}</p>}
          </>
        )}
      </Modal>
      <QRScanner open={scan} onClose={() => setScan(false)} onResult={approve} parse={asLinkCode} hint="Scan the code on your new device." invalidMessage="That isn’t a Sysfi device-link code." />
    </>
  );
}

export default function DmSettings({ onBack }) {
  const { client, status, refreshStatus } = useDm();
  const { showAlert } = useFeedback();
  const [settings, setSettings] = useState(status.settings ?? { allowRequests: "everyone", readReceipts: true });
  const [blocks, setBlocks] = useState([]);
  const [linking, setLinking] = useState(false);
  const wallet = useBackupWallet();
  const [busy, setBusy] = useState(null); // "backup" | "rotate"
  const profiles = useProfiles(blocks.map((b) => b.userId));

  useEffect(() => {
    client.blocks().then(setBlocks).catch(() => {});
  }, [client]);

  const save = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await client.setSettings(next);
      refreshStatus();
    } catch (e) {
      showAlert("Couldn’t save", e.message);
    }
  };

  // Both ask the wallet to sign; a dismissed prompt just ends quietly.
  const withWallet = async (kind, fn, done) => {
    setBusy(kind);
    try {
      await fn();
      await refreshStatus();
      showAlert(...done);
    } catch (e) {
      if (!/cancel|reject|denied|closed/i.test(e?.message ?? "")) showAlert("Couldn’t save", e.message);
    } finally {
      setBusy(null);
    }
  };
  const backUp = () => withWallet("backup", () => client.backup(wallet), ["Backed up with your wallet", "Restore your wallet on a new device to get your messages back."]);
  const rotate = () =>
    showAlert("Rotate keys?", "New keys for future messages — do this if you lost a device. Your old messages stay readable here.", [
      { text: "Cancel", style: "cancel" },
      { text: "Rotate", onPress: () => withWallet("rotate", () => client.rotate(wallet), ["Keys rotated", "New messages use your new keys."]) },
    ]);
  const onWallet = status.backupKind === "wallet";

  return (
    <div className="panel-scroll h-full overflow-y-auto">
      <div className="flex items-center gap-2 border-b border-panel-border px-3 py-3">
        <button type="button" aria-label="Back" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-hover">
          <IoArrowBack size={20} />
        </button>
        <h1 className="text-lg font-extrabold text-text">Message settings</h1>
      </div>

      <Section title="Who can send you message requests">
        <div className="space-y-1">
          <Choice checked={settings.allowRequests === "everyone"} onChange={() => save({ allowRequests: "everyone" })} title="Everyone" body="Anyone on Sysfi can send you a request." />
          <Choice checked={settings.allowRequests === "tribes"} onChange={() => save({ allowRequests: "tribes" })} title="People in my tribes" body="Only members of tribes you’re in." />
          <Choice checked={settings.allowRequests === "none"} onChange={() => save({ allowRequests: "none" })} title="No one" body="People you already talk to can still message you." />
        </div>
      </Section>

      <Section title="Privacy">
        <label className="flex cursor-pointer items-center justify-between gap-4 px-3">
          <span>
            <span className="block font-semibold text-text">Read receipts</span>
            <span className="block text-sm text-text-tertiary">Let people see when you’ve read their messages. Turning this off hides theirs from you too.</span>
          </span>
          <input type="checkbox" role="switch" checked={settings.readReceipts} onChange={(e) => save({ readReceipts: e.target.checked })} className="h-5 w-5 accent-[var(--primary)]" />
        </label>
      </Section>

      <Section title="Devices & keys">
        <div className="flex flex-col gap-2">
          <Button title="Link a device" variant="secondary" icon={<IoQrCodeOutline size={18} />} fullWidth onClick={() => setLinking(true)} />
          {!onWallet && <Button title="Back up with my wallet" variant="secondary" icon={<IoWalletOutline size={18} />} fullWidth loading={busy === "backup"} disabled={!wallet || !!busy} onClick={backUp} />}
          <Button title="Rotate keys" variant="ghost" icon={<IoRefreshOutline size={18} />} fullWidth loading={busy === "rotate"} disabled={!wallet || !!busy} onClick={rotate} />
        </div>
        <p className="mt-3 px-1 text-xs text-text-tertiary">
          {onWallet
            ? `Backed up with wallet ${formatAddress(status.backupAddress ?? "")} — restoring it on a new device brings your messages back.`
            : status.backup
              ? "Backed up with a messaging PIN. Switch to your wallet so there’s no PIN to remember."
              : "Not backed up — back up with your wallet so a new device can get your messages."}{" "}
          Key version {status.latestVersion}. Messages are encrypted on this device before they’re sent.
        </p>
      </Section>

      <Section title={`Blocked (${blocks.length})`}>
        {blocks.length === 0 ? (
          <p className="px-1 text-sm text-text-tertiary">You haven’t blocked anyone.</p>
        ) : (
          blocks.map((b) => (
            <div key={b.userId} className="flex items-center gap-3 py-2">
              <Avatar src={profiles[b.userId]?.avatarUrl} size={36} />
              <span className="min-w-0 flex-1 truncate font-semibold text-text">{displayName(profiles[b.userId], b.userId)}</span>
              <Button
                title="Unblock"
                size="small"
                variant="outline"
                onClick={async () => {
                  await client.unblock(b.userId);
                  setBlocks((l) => l.filter((x) => x.userId !== b.userId));
                }}
              />
            </div>
          ))
        )}
      </Section>

      <LinkDevice open={linking} onClose={() => setLinking(false)} />
    </div>
  );
}
