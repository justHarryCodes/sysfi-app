"use client";
// components/dm/Onboarding.js — getting this device's message keys:
//   state "new"      → one tap: keys, backed up with the user's wallet (no PIN)
//   state "restore"  → unlock with the wallet (or the PIN, for older PIN
//                      backups), link from a device that has the keys, or
//                      (last resort) start fresh
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { IoLockClosed, IoKeyOutline, IoQrCodeOutline, IoWarningOutline, IoShieldCheckmark, IoWalletOutline } from "react-icons/io5";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Spinner from "@/components/ui/Spinner";
import { formatAddress } from "@/lib/wallet";
import { useBackupWallet, useDm } from "./DmProvider";

/** Runs a wallet-backed action with busy/error state; a dismissed prompt isn't an error. */
function useWalletAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (!/cancel|reject|denied|closed/i.test(e?.message ?? "")) setError(e.message);
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Shell({ Icon = IoLockClosed, title, children }) {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col items-center px-5 py-12 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--primary)_30%,transparent)]">
        <Icon size={28} />
      </span>
      <h1 className="text-xxl font-extrabold tracking-[-0.4px] text-text">{title}</h1>
      <div className="mt-3 w-full">{children}</div>
    </div>
  );
}

function Setup() {
  const { client, refreshStatus } = useDm();
  const wallet = useBackupWallet();
  const { busy, error, run } = useWalletAction();
  return (
    <Shell Icon={IoShieldCheckmark} title="Private messages">
      <p className="text-md text-text-secondary">
        Messages on Sysfi are end-to-end encrypted. Only you and the people you talk to can read them — not Sysfi, not anyone else.
      </p>
      <ul className="mt-5 space-y-2 rounded-2xl border border-panel-border bg-surface p-4 text-left text-sm text-text-secondary">
        <li>• Your wallet is the key: on a new device, restore your wallet and your messages come back.</li>
        <li>• No extra PIN to remember. Keep your wallet backed up — lose it and your old messages go with it.</li>
      </ul>
      {error && <p className="mt-4 text-sm text-error">{error}</p>}
      <Button
        title="Turn on encrypted messages"
        fullWidth
        className="mt-6"
        loading={busy}
        disabled={!wallet}
        icon={<IoWalletOutline size={18} />}
        onClick={() => run(async () => (await client.setup(wallet), await refreshStatus()))}
      />
      {wallet && <p className="mt-3 text-xs text-text-tertiary">Uses wallet {formatAddress(wallet.wallet.address)}. Signing is free — nothing goes on-chain.</p>}
    </Shell>
  );
}

function LinkThisDevice({ onBack }) {
  const { client, refreshStatus } = useDm();
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);

  const [attempt, setAttempt] = useState(0);

  // Shows a code, then waits for an existing device to hand over the keys.
  // Each attempt (incl. "Try again") gets a fresh code.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const l = await client.startLink();
        if (ctrl.signal.aborted) return;
        setLink(l);
        await l.wait({ signal: ctrl.signal });
        await refreshStatus();
      } catch (e) {
        if (e.code !== "CANCELLED" && !ctrl.signal.aborted) setError(e.message);
      }
    })();
    return () => ctrl.abort();
  }, [client, refreshStatus, attempt]);

  return (
    <Shell Icon={IoQrCodeOutline} title="Link this device">
      <p className="text-md text-text-secondary">On a phone or browser where your messages already work, open Messages → Settings → Link a device, and scan this code.</p>
      <div className="mx-auto mt-6 w-fit rounded-2xl bg-white p-4">
        {link ? <QRCodeSVG value={link.qr} size={208} level="M" /> : <div className="flex h-[208px] w-[208px] items-center justify-center"><Spinner /></div>}
      </div>
      {link && (
        <>
          <p className="mt-4 text-sm text-text-secondary">
            Check that the other device shows <span className="font-mono text-lg font-bold tracking-[0.2em] text-text">{link.code}</span>
          </p>
          <button type="button" onClick={() => navigator.clipboard?.writeText(link.qr)} className="mt-2 text-xs font-semibold text-primary">
            Can’t scan? Copy the code instead
          </button>
        </>
      )}
      {error && (
        <div className="mt-4 text-sm text-error">
          {error}{" "}
          <button type="button" className="font-semibold text-primary" onClick={() => (setError(null), setLink(null), setAttempt((n) => n + 1))}>
            Try again
          </button>
        </div>
      )}
      <Button title="Back" variant="ghost" className="mt-6" onClick={onBack} />
    </Shell>
  );
}

function StartFresh({ onBack }) {
  const { client, refreshStatus } = useDm();
  const wallet = useBackupWallet();
  const { busy, error, run } = useWalletAction();
  return (
    <Shell Icon={IoWarningOutline} title="Start fresh?">
      <p className="text-md text-text-secondary">
        Only if your backup can’t be opened and no device has your messages. You’ll get new keys: <strong className="text-text">messages from before can’t be read again</strong>, and people you talk to will see that your keys changed.
      </p>
      {error && <p className="mt-4 text-sm text-error">{error}</p>}
      <Button title="Create new keys" fullWidth className="mt-6" loading={busy} disabled={!wallet} onClick={() => run(async () => (await client.reset(wallet), await refreshStatus()))} />
      <Button title="Back" variant="ghost" className="mt-2" onClick={onBack} />
    </Shell>
  );
}

function Restore() {
  const { status } = useDm();
  const [mode, setMode] = useState("unlock");
  if (mode === "link") return <LinkThisDevice onBack={() => setMode("unlock")} />;
  if (mode === "fresh") return <StartFresh onBack={() => setMode("unlock")} />;
  return status.backupKind === "pin" ? <RestoreWithPin setMode={setMode} /> : <RestoreWithWallet setMode={setMode} />;
}

function RestoreWithWallet({ setMode }) {
  const { client, refreshStatus, status } = useDm();
  const wallet = useBackupWallet();
  const { busy, error, run } = useWalletAction();
  const other = !!(status.backupAddress && wallet && status.backupAddress !== wallet.wallet.address.toLowerCase());
  return (
    <Shell Icon={IoWalletOutline} title="Unlock your messages">
      <p className="text-md text-text-secondary">Your messages are backed up with your wallet. Confirm with it to bring them to this device.</p>
      {status.backup ? (
        <>
          {other && (
            <p className="mt-4 rounded-2xl border border-panel-border bg-surface p-4 text-sm text-text-secondary">
              They’re backed up with wallet {formatAddress(status.backupAddress)}, but this account’s wallet is {formatAddress(wallet.wallet.address)}. Restore that wallet, or link a device.
            </p>
          )}
          {error && <p className="mt-4 text-sm text-error">{error}</p>}
          <Button title="Unlock with wallet" fullWidth className="mt-6" loading={busy} disabled={!wallet || other} icon={<IoWalletOutline size={18} />} onClick={() => run(async () => (await client.restore(wallet), await refreshStatus()))} />
        </>
      ) : (
        <p className="mt-6 rounded-2xl border border-panel-border bg-surface p-4 text-sm text-text-secondary">There’s no backup for this account. Link from a device that has your messages.</p>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <Button title="Link from another device" variant="secondary" fullWidth icon={<IoQrCodeOutline size={18} />} onClick={() => setMode("link")} />
        <button type="button" className="mt-2 text-sm font-semibold text-text-tertiary hover:text-text" onClick={() => setMode("fresh")}>
          Can’t unlock and no device has them?
        </button>
      </div>
    </Shell>
  );
}

/** Older accounts backed up with a messaging PIN; settings can then move the backup to the wallet. */
function RestoreWithPin({ setMode }) {
  const { client, refreshStatus, status } = useDm();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.restore(pin);
      await refreshStatus();
    } catch (err) {
      const b = err.body ?? {};
      if (err.code === "WRONG_PIN") setError(`Wrong PIN — ${b.attemptsLeft} ${b.attemptsLeft === 1 ? "try" : "tries"} left${b.lockedUntil ? `. Locked until ${new Date(b.lockedUntil).toLocaleTimeString()}` : ""}.`);
      else if (err.code === "LOCKED") setError(`Too many wrong PINs. Try again after ${new Date(b.lockedUntil).toLocaleTimeString()}.`);
      else setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Shell Icon={IoKeyOutline} title="Unlock your messages">
      <p className="text-md text-text-secondary">Enter your messaging PIN to bring your encrypted messages to this device.</p>
      {status.backup ? (
        <form onSubmit={submit} className="mt-6 text-left" noValidate>
          <Input label="Messaging PIN" secure autoFocus autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} error={error} />
          <Button type="submit" title="Unlock" fullWidth loading={busy} disabled={!pin} />
        </form>
      ) : (
        <p className="mt-6 rounded-2xl border border-panel-border bg-surface p-4 text-sm text-text-secondary">There’s no PIN backup for this account. Link from a device that has your messages.</p>
      )}
      <div className="mt-6 flex flex-col gap-2">
        <Button title="Link from another device" variant="secondary" fullWidth icon={<IoQrCodeOutline size={18} />} onClick={() => setMode("link")} />
        <button type="button" className="mt-2 text-sm font-semibold text-text-tertiary hover:text-text" onClick={() => setMode("fresh")}>
          Lost your PIN and devices?
        </button>
      </div>
    </Shell>
  );
}

export default function Onboarding() {
  const { status } = useDm();
  if (status.state === "new") return <Setup />;
  if (status.state === "restore") return <Restore />;
  return null;
}
