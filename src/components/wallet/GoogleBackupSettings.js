"use client";
// components/wallet/GoogleBackupSettings.js — the "Google Drive backup" row
// in Settings (lib/googleBackup.js).
//   Google accounts   the wallet IS the Google backup — status only
//   password accounts back up to Drive (links Google to the account), back up
//                     again, or restore the password copy from Drive after a
//                     password reset
import { useState } from "react";
import { IoCheckmarkCircle, IoCloudUploadOutline, IoKeyOutline, IoRefresh } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import GoogleMark from "@/components/auth/GoogleMark";
import { useWallet } from "@/contexts/WalletContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { isPopupDismissed } from "@/lib/googleAuth";

const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export function GoogleBackupRow({ Row }) {
  const { walletSecurity, googleBackup } = useWallet();
  const [open, setOpen] = useState(false);
  if (walletSecurity === "external" || !walletSecurity) return null;

  if (walletSecurity === "google") {
    return (
      <Row
        Icon={() => <GoogleMark size={18} />}
        title="Google Drive backup"
        sub={`On · split between your Drive and Sysfi${googleBackup?.createdAt ? ` · ${when(googleBackup.createdAt)}` : ""}`}
        right={<IoCheckmarkCircle size={18} className="text-primary" />}
      />
    );
  }

  return (
    <>
      <Row
        Icon={() => <GoogleMark size={18} />}
        title={googleBackup ? "Google Drive backup" : "Back up to Google Drive"}
        sub={googleBackup ? `Backed up ${when(googleBackup.createdAt)}` : "Restore your wallet with Google if you forget your password"}
        onClick={() => setOpen(true)}
      />
      {open && <GoogleBackupModal onClose={() => setOpen(false)} />}
    </>
  );
}

function GoogleBackupModal({ onClose }) {
  const { googleBackup, backupToGoogleDrive, restorePasswordCopyFromGoogle } = useWallet();
  const { showAlert } = useFeedback();
  const [mode, setMode] = useState("overview"); // overview | restore
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const backup = async () => {
    setBusy(true);
    setError("");
    try {
      await backupToGoogleDrive();
      onClose();
      showAlert("Backed up to Google Drive", "Your wallet is encrypted and split between your Google Drive and Sysfi. You can now restore it with Google.");
    } catch (err) {
      setBusy(false);
      if (!isPopupDismissed(err) && err.code !== "USER_CANCELLED") setError(err.message || "Backup failed. Please try again.");
    }
  };

  const restore = async (e) => {
    e.preventDefault();
    if (!password) return setError("Enter your current account password");
    setBusy(true);
    setError("");
    try {
      await restorePasswordCopyFromGoogle(password);
      onClose();
      showAlert("Wallet restored", "Your wallet is unlocked with your current password again.");
    } catch (err) {
      setBusy(false);
      if (!isPopupDismissed(err)) setError(err.message || "Restore failed. Please try again.");
    }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} labelledBy="gb-title" dismissible={!busy}>
      <div className="mb-5 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface">
          <GoogleMark size={30} />
        </div>
        <h2 id="gb-title" className="mb-1 text-xl font-bold text-text">
          {mode === "restore" ? "Restore from Google Drive" : "Google Drive backup"}
        </h2>
        <p className="text-sm text-text-secondary">
          {mode === "restore"
            ? "Changed or reset your password and can't unlock your wallet? We'll open the Google backup and lock your wallet with your current password."
            : "Your wallet is encrypted, then split: half in a private folder in your Google Drive, half with Sysfi. Neither half can open it alone — together, with your Google sign-in, they restore it without your password."}
        </p>
      </div>

      {mode === "restore" ? (
        <form onSubmit={restore} noValidate>
          <Input
            label="Current account password"
            secure
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            disabled={busy}
            error={error}
            leftIcon={<IoKeyOutline size={20} />}
          />
          <Button type="submit" title="Restore with Google" icon={<GoogleMark size={18} />} fullWidth loading={busy} className="mb-3" />
          <Button title="Back" variant="outline" fullWidth disabled={busy} onClick={() => setMode("overview")} />
        </form>
      ) : (
        <>
          {googleBackup && <p className="mb-4 text-center text-xs text-text-tertiary">Last backup: {when(googleBackup.createdAt)}</p>}
          {error && <p className="mb-4 text-center text-sm text-error">{error}</p>}
          <Button
            title={googleBackup ? "Back up again" : "Back up now"}
            icon={googleBackup ? <IoRefresh size={18} /> : <IoCloudUploadOutline size={18} />}
            fullWidth
            loading={busy}
            onClick={backup}
            className="mb-3"
          />
          {googleBackup ? (
            <Button title="Restore from Google Drive" variant="outline" fullWidth disabled={busy} onClick={() => setMode("restore")} />
          ) : (
            <Button title="Not now" variant="outline" fullWidth disabled={busy} onClick={onClose} />
          )}
        </>
      )}
    </Modal>
  );
}
