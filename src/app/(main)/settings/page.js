"use client";
// Settings — port of SettingsScreen, adapted to the web:
//   Account   · Edit profile, email, change password (re-keys the cloud wallet)
//   Wallet    · linked login wallet, backup phrase, Google Drive backup, history, tokens
//   Preferences · theme (dark / light / system), currency
//   Data      · clear this browser's cached data
//   Sign out
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail } from "firebase/auth";
import { useAccount, useAccountEffect, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  IoPersonCircleOutline,
  IoMailOutline,
  IoLockClosedOutline,
  IoWalletOutline,
  IoKeyOutline,
  IoTimeOutline,
  IoLayersOutline,
  IoMoonOutline,
  IoCashOutline,
  IoTrashBinOutline,
  IoLogOutOutline,
  IoChevronForward,
  IoLinkOutline,
  IoCheckmarkCircle,
  IoInformationCircleOutline,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useWallet } from "@/contexts/WalletContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { auth } from "@/lib/firebase";
import { userScope, wipeScope } from "@/lib/cache/idb";
import { isUserRejection, linkWalletToAccount, unlinkWalletFromAccount } from "@/lib/siwe";
import { isValidEmail, validatePasswordStrength } from "@/lib/validators";
import { formatAddress } from "@/lib/wallet";
import { GoogleBackupRow } from "@/components/wallet/GoogleBackupSettings";

function Group({ title, children }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[1px] text-text-tertiary">{title}</h2>
      <div className="divide-y divide-divider overflow-hidden rounded-2xl bg-surface">{children}</div>
    </section>
  );
}

function Row({ Icon, title, sub, href, onClick, right, tint, disabled }) {
  const body = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-hover ${tint || "text-text"}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold ${tint === "text-error" ? "text-error" : "text-text"}`}>{title}</span>
        {sub && <span className="block truncate text-xs text-text-tertiary">{sub}</span>}
      </span>
      {right ?? ((href || onClick) && <IoChevronForward size={16} className="text-text-tertiary" />)}
    </>
  );
  const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left ${disabled ? "opacity-50" : href || onClick ? "hover:bg-hover" : ""}`;
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

function ChangePassword({ onClose }) {
  const { user } = useAuth();
  const { rekeyWallet } = useWallet();
  const { showAlert } = useFeedback();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!current) errs.current = "Enter your current password";
    const v = validatePasswordStrength(next);
    if (!v.isValid) errs.next = v.errors[0];
    else if (next === current) errs.next = "Choose a different password";
    if (next !== confirm) errs.confirm = "Passwords do not match";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const cu = auth.currentUser;
      await reauthenticateWithCredential(cu, EmailAuthProvider.credential(user.email, current));
      // Re-encrypts the cloud wallet under the new password, then changes it.
      await rekeyWallet(current, next, () => updatePassword(cu, next));
      onClose();
      showAlert("Password changed", "Your password and your wallet's encrypted backup were both updated.");
    } catch (err) {
      if (err.code === "REKEY_SAVE_FAILED") setRetry(() => err.retry);
      const msg =
        err.code === "auth/wrong-password" || err.code === "auth/invalid-credential" || err.message === "Invalid password"
          ? "Your current password is incorrect."
          : err.code === "auth/too-many-requests"
            ? "Too many attempts. Please wait and try again."
            : err.message;
      setErrors({ form: msg });
    } finally {
      setBusy(false);
    }
  };

  if (retry) {
    return (
      <Modal open onClose={() => {}} labelledBy="pw-title" dismissible={false}>
        <h2 id="pw-title" className="mb-2 text-lg font-bold text-text">
          Finish updating your wallet
        </h2>
        <p className="mb-4 text-sm text-text-secondary">
          Your password changed, but the re-encrypted wallet backup didn&apos;t save. Retry now — until it saves, unlocking needs your old password.
        </p>
        <Button
          title="Retry save"
          fullWidth
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await retry();
              setRetry(null);
              onClose();
            } catch {
              setBusy(false);
            }
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal open onClose={() => !busy && onClose()} labelledBy="pw-title" dismissible={!busy}>
      <form onSubmit={submit} noValidate>
        <h2 id="pw-title" className="mb-1 text-lg font-bold text-text">
          Change Password
        </h2>
        <p className="mb-4 text-sm text-text-secondary">Your wallet backup is encrypted with this password, so it&apos;s re-encrypted as part of the change.</p>
        <Input label="Current password" secure autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.current} />
        <Input label="New password" secure autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.next} />
        <Input label="Confirm new password" secure autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
        {errors.form && <p className="mb-3 text-sm text-error">{errors.form}</p>}
        <Button type="submit" title={busy ? "Re-encrypting wallet…" : "Change Password"} fullWidth loading={busy} className="mb-2" />
        <Button title="Cancel" variant="outline" fullWidth disabled={busy} onClick={onClose} />
      </form>
    </Modal>
  );
}

function AddEmail({ onClose }) {
  const { showAlert } = useFeedback();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!isValidEmail(email.trim())) return setError("Enter a valid email");
    setBusy(true);
    try {
      await verifyBeforeUpdateEmail(auth.currentUser, email.trim());
      onClose();
      showAlert("Check your inbox", `We sent a link to ${email.trim()}. Click it to add this email to your account.`);
    } catch (err) {
      setError(err.code === "auth/email-already-in-use" ? "That email already belongs to another account." : "Couldn't send the verification email.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} labelledBy="email-title">
      <form onSubmit={submit} noValidate>
        <h2 id="email-title" className="mb-1 text-lg font-bold text-text">
          Add an email
        </h2>
        <p className="mb-4 text-sm text-text-secondary">For notifications and recovery. Your wallet stays your login.</p>
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} />
        <Button type="submit" title="Send verification link" fullWidth loading={busy} className="mb-2" />
        <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
      </form>
    </Modal>
  );
}

function LinkedWalletRow() {
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const { address, chainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  const link = useCallback(
    async (addr, cid) => {
      setBusy(true);
      try {
        await linkWalletToAccount({ address: addr, chainId: cid, signMessage: signMessageAsync });
        showAlert("Wallet linked", `You can now also sign in with ${formatAddress(addr, 4)}.`);
      } catch (e) {
        if (!isUserRejection(e)) showAlert("Couldn't link wallet", e.message);
      } finally {
        setBusy(false);
      }
    },
    [signMessageAsync, showAlert],
  );

  useAccountEffect({
    onConnect({ address: a, chainId: c, isReconnected }) {
      if (pending.current && !isReconnected) {
        pending.current = false;
        link(a, c);
      }
    },
  });

  if (user?.isWalletAccount) {
    return <Row Icon={IoWalletOutline} title="Sign-in wallet" sub={formatAddress(user.walletAddress, 6)} right={<IoCheckmarkCircle size={18} className="text-primary" />} />;
  }

  const linked = user?.linkedWalletAddress;
  const start = () => {
    if (isConnected && address) return link(address, chainId);
    pending.current = true;
    openConnectModal?.();
  };
  const unlink = () =>
    showAlert("Unlink wallet?", `You'll no longer be able to sign in with ${formatAddress(linked, 4)}.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unlink",
        style: "destructive",
        onPress: () => unlinkWalletFromAccount().catch((e) => showAlert("Couldn't unlink", e.message)),
      },
    ]);

  return linked ? (
    <Row
      Icon={IoLinkOutline}
      title="Linked wallet"
      sub={`${formatAddress(linked, 6)} · can sign in to this account`}
      right={
        <button type="button" onClick={unlink} className="text-sm font-semibold text-error">
          Unlink
        </button>
      }
    />
  ) : (
    <Row
      Icon={IoLinkOutline}
      title="Link a wallet"
      sub={busy ? "Check your wallet to sign…" : "Sign in with MetaMask or WalletConnect too"}
      onClick={start}
      disabled={busy}
    />
  );
}

export default function SettingsPage() {
  const { user, hasPasswordProvider, logout } = useAuth();
  const { isExternal, address } = useWallet();
  const { themeMode, setTheme } = useTheme();
  const { showAlert } = useFeedback();
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);

  const clearCache = () =>
    showAlert("Clear cached data?", "Feeds, tribes and balances will reload from the network. You'll stay signed in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          qc.removeQueries({ queryKey: ["user"] });
          qc.removeQueries({ queryKey: ["public"] });
          await wipeScope(userScope(user?.uid));
          await wipeScope("public");
          showAlert("Cache cleared", "Fresh data will load as you browse.");
        },
      },
    ]);

  return (
    <>
      <PageHeader title="Settings" backHref="/profile" />
      <div className="mx-auto max-w-[640px] space-y-6 px-4 py-6">
        <Group title="Account">
          <Row Icon={IoPersonCircleOutline} title="Edit Profile" sub="Update your name and preferences" href="/profile/edit" />
          {user?.email ? (
            <Row Icon={IoMailOutline} title="Email" sub={`${user.email}${user.emailVerified ? " · verified" : ""}`} />
          ) : (
            <Row Icon={IoMailOutline} title="Add an email" sub="Optional — for notifications and recovery" onClick={() => setModal("email")} />
          )}
          {hasPasswordProvider && (
            <Row Icon={IoLockClosedOutline} title="Change Password" sub="Also re-encrypts your wallet backup" onClick={() => setModal("password")} />
          )}
          <LinkedWalletRow />
        </Group>

        <Group title="Wallet">
          <Row Icon={IoWalletOutline} title="Wallet" sub={address ? formatAddress(address, 6) : undefined} href="/wallet" />
          {!isExternal && <Row Icon={IoKeyOutline} title="Show Recovery Phrase" sub="View your 12-word recovery phrase" href="/wallet/recovery-phrase" tint="text-warning" />}
          {!isExternal && <GoogleBackupRow Row={Row} />}
          <Row Icon={IoTimeOutline} title="Transaction History" sub="View all your transactions" href="/wallet/activity" />
          <Row Icon={IoLayersOutline} title="Manage Tokens" href="/wallet/assets/manage" />
        </Group>

        <Group title="Preferences">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-hover text-text">
              <IoMoonOutline size={18} />
            </span>
            <span className="flex-1 font-semibold text-text">Theme</span>
            <div role="radiogroup" aria-label="Theme" className="flex gap-1 rounded-xl bg-hover p-1">
              {["dark", "light", "system"].map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={themeMode === m}
                  onClick={() => setTheme(m)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${themeMode === m ? "bg-primary text-on-primary" : "text-text-secondary"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <Row Icon={IoCashOutline} title="Currency" right={<span className="text-sm font-semibold text-text-secondary">USD</span>} />
        </Group>

        <Group title="Data">
          <Row Icon={IoTrashBinOutline} title="Clear Cache" sub="Free up storage in this browser" onClick={clearCache} />
        </Group>

        <Group title="About">
          <Row Icon={IoInformationCircleOutline} title="Sysfi for Web" sub="Multichain · keys never leave this browser unencrypted" />
        </Group>

        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-error/20 bg-error/[0.03] py-3.5 font-semibold text-error hover:bg-error/[0.06]"
        >
          <IoLogOutOutline size={18} /> Logout
        </button>
      </div>

      {modal === "password" && <ChangePassword onClose={() => setModal(null)} />}
      {modal === "email" && <AddEmail onClose={() => setModal(null)} />}
    </>
  );
}
