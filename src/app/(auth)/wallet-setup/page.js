"use client";
// Port of crypto-wallet/screens/wallet/WalletSetupScreen.js. Create-only (no
// recovery-phrase import, same as the app). The cloud copy is encrypted with
// the account password — carried over from Register/Login, or re-entered
// and verified here. Google accounts have no password: their wallet goes
// straight into the Google backup (half in their Drive, half with us —
// lib/googleBackup.js).
// The web skips the app's device-PIN step (see WalletContext).
import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import {
  IoAddCircle,
  IoWalletOutline,
  IoCheckmarkCircle,
  IoKey,
  IoCopyOutline,
  IoWarning,
  IoLockClosed,
  IoInformationCircleOutline,
  IoShieldCheckmarkOutline,
} from "react-icons/io5";
import { auth } from "@/lib/firebase";
import { isPopupDismissed } from "@/lib/googleAuth";
import GoogleMark from "@/components/auth/GoogleMark";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";

const REAUTH_ERRORS = {
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/invalid-credential": "Incorrect password. Please try again.",
  "auth/too-many-requests": "Too many failed attempts. Please try again later.",
  "auth/user-mismatch": "User mismatch. Please try again.",
};

export default function WalletSetupPage() {
  const { user, tempCloudPassword, clearTempPassword, logout } = useAuth();
  const { createWallet, createWalletWithGoogle, confirmBackup } = useWallet();
  const viaGoogle = !!user?.isGoogleOnly;
  const { showLoading, updateLoading, hideLoading, showAlert } = useFeedback();

  const [walletName, setWalletName] = useState("Main Wallet");
  const [nameError, setNameError] = useState(null);
  const [mnemonic, setMnemonic] = useState("");
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthError, setReauthError] = useState("");
  const [reauthBusy, setReauthBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  const proceed = async (secret) => {
    try {
      showLoading("Generating recovery phrase...", { step: 1, totalSteps: 3 });
      updateLoading("Encrypting wallet for cloud...", 2);
      const result = await createWallet(secret, walletName.trim());
      updateLoading("Finalizing wallet setup...", 3);
      clearTempPassword();
      setMnemonic(result.mnemonic);
    } catch (err) {
      console.error("Wallet creation error:", err);
      showAlert("Error", "Failed to create wallet. Please try again.");
    } finally {
      hideLoading();
    }
  };

  const handleCreate = async () => {
    if (!walletName.trim()) return setNameError("Wallet name is required");
    if (viaGoogle) {
      // Straight from the click: may open the Google popup for Drive access.
      setCreating(true);
      try {
        const result = await createWalletWithGoogle(walletName.trim());
        setMnemonic(result.mnemonic);
      } catch (err) {
        if (!isPopupDismissed(err)) showAlert("Couldn't create your wallet", err?.message || "Please try again.");
      } finally {
        setCreating(false);
      }
      return;
    }
    if (tempCloudPassword) return proceed(tempCloudPassword);
    setReauthOpen(true);
  };

  const submitReauth = async (e) => {
    e.preventDefault();
    if (!reauthPassword) return setReauthError("Password is required");
    setReauthBusy(true);
    setReauthError("");
    try {
      const cu = auth.currentUser;
      await reauthenticateWithCredential(cu, EmailAuthProvider.credential(cu.email, reauthPassword));
      setReauthOpen(false);
      const pw = reauthPassword;
      setReauthPassword("");
      await proceed(pw);
    } catch (err) {
      setReauthError(REAUTH_ERRORS[err.code] || "Authentication failed. Please try again.");
    } finally {
      setReauthBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showAlert("Error", "Couldn't copy — please write the words down instead.");
    }
  };

  // ── Recovery phrase screen ─────────────────────────────────────────────────
  if (mnemonic) {
    return (
      <main className="min-h-dvh bg-background">
        <div className="mx-auto max-w-[480px] px-6 py-12">
          <header className="mb-8 flex flex-col items-center text-center">
            <IoCheckmarkCircle size={80} className="mb-4 text-primary" />
            <h1 className="mb-2 text-xxl font-bold text-text">Wallet Created!</h1>
            <p className="text-md text-text-secondary">Save your recovery phrase securely</p>
          </header>

          <Card className="mb-6">
            <div className="mb-4 flex items-center gap-2">
              <IoKey size={24} className="text-primary" />
              <h2 className="text-md font-bold text-text">Your Recovery Phrase</h2>
            </div>
            <ol className="mb-4 grid grid-cols-3 gap-2">
              {mnemonic.split(" ").map((w, i) => (
                <li key={i} className="flex items-center gap-1.5 rounded-md bg-surface px-2 py-2">
                  <span className="w-4 text-right text-xs text-text-tertiary">{i + 1}</span>
                  <span className="font-mono text-sm font-semibold text-text">{w}</span>
                </li>
              ))}
            </ol>
            <button type="button" onClick={copy} className="mx-auto mb-4 flex items-center gap-2 text-sm font-semibold text-primary">
              {copied ? <IoCheckmarkCircle size={20} /> : <IoCopyOutline size={20} />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
            <div className="flex items-start gap-2 rounded-md bg-surface p-3">
              <IoWarning size={20} className="shrink-0 text-warning" />
              <p className="text-sm text-text-secondary">
                Never share this phrase with anyone. Anyone with this phrase can access your wallet.
              </p>
            </div>
          </Card>

          <label className="mb-6 flex cursor-pointer items-start gap-3 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            I&apos;ve written down my recovery phrase and stored it somewhere safe.
          </label>
          <Button
            title="I've Saved It Securely"
            fullWidth
            disabled={!acknowledged}
            onClick={() => {
              setMnemonic("");
              confirmBackup();
            }}
          />
        </div>
      </main>
    );
  }

  // ── Create form ────────────────────────────────────────────────────────────
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[480px] px-6 py-12">
        <header className="mb-8 flex flex-col items-center text-center">
          <div className="mb-6 flex h-[120px] w-[120px] items-center justify-center rounded-full bg-surface">
            <IoAddCircle size={64} className="text-primary" />
          </div>
          <h1 className="mb-2 text-xxl font-bold text-text">Create Wallet</h1>
          <p className="text-md text-text-secondary">Set up your new wallet securely</p>
        </header>

        <Input
          label="Wallet Name"
          placeholder="Enter wallet name"
          value={walletName}
          onChange={(e) => {
            setWalletName(e.target.value);
            setNameError(null);
          }}
          error={nameError}
          leftIcon={<IoWalletOutline size={20} />}
        />

        <div className="mb-6 flex items-start gap-2 rounded-lg bg-surface p-4">
          <IoShieldCheckmarkOutline size={20} className="mt-px shrink-0 text-primary" />
          <p className="text-sm leading-5 text-text-secondary">
            {viaGoogle
              ? "No password needed. Your wallet is encrypted, then split: one half goes to a private folder in your Google Drive, the other stays with Sysfi. Neither half can open it alone."
              : "Your wallet is encrypted with your account password before it's backed up to the cloud. You'll confirm with this password for every transaction."}
          </p>
        </div>

        <Button
          title={viaGoogle ? "Create wallet with Google" : "Create Wallet"}
          icon={viaGoogle ? <GoogleMark size={18} /> : null}
          fullWidth
          onClick={handleCreate}
          loading={creating}
        />
        <button type="button" onClick={() => logout()} className="mt-4 w-full text-center text-sm text-text-secondary hover:text-text">
          Sign out
        </button>
      </div>

      <Modal open={reauthOpen} onClose={() => !reauthBusy && setReauthOpen(false)} labelledBy="reauth-title" dismissible={!reauthBusy}>
        <form onSubmit={submitReauth} noValidate>
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-surface">
              <IoLockClosed size={40} className="text-primary" />
            </div>
            <h2 id="reauth-title" className="mb-1 text-xl font-bold text-text">
              Confirm Your Identity
            </h2>
            <p className="text-sm text-text-secondary">Please enter your account password to encrypt your wallet</p>
          </div>
          <Input
            label="Account Password"
            secure
            autoFocus
            autoComplete="current-password"
            placeholder="Enter your password"
            value={reauthPassword}
            onChange={(e) => {
              setReauthPassword(e.target.value);
              setReauthError("");
            }}
            disabled={reauthBusy}
            error={reauthError}
            leftIcon={<IoKey size={20} />}
          />
          <div className="mb-6 flex items-start gap-2 rounded-lg bg-surface p-3">
            <IoInformationCircleOutline size={20} className="shrink-0 text-info" />
            <p className="text-sm text-text-secondary">
              This password will be used to encrypt and secure your wallet in the cloud.
            </p>
          </div>
          <Button type="submit" title="Confirm" fullWidth loading={reauthBusy} className="mb-3" />
          <Button title="Cancel" variant="outline" fullWidth disabled={reauthBusy} onClick={() => setReauthOpen(false)} />
        </form>
      </Modal>
    </main>
  );
}
