"use client";
// components/wallet/WalletAuthSheet.js — the per-action confirm step (the
// web equivalent of the app's PasscodeModal before a transaction). Decrypts
// the wallet for exactly one action, then hands the data back to
// WalletContext, which discards it once the action finishes.
//
//   password       account password (or, if the account has one, its Google backup)
//   google         passwordless Google backup — one tap; a Google popup only
//                  when this browser doesn't hold the Drive half yet
//   google-legacy  older Google accounts (server key alone)
import { useEffect, useState } from "react";
import { IoKeyOutline, IoLockClosed, IoShieldCheckmarkOutline } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import GoogleMark from "@/components/auth/GoogleMark";
import { isPopupDismissed } from "@/lib/googleAuth";

export default function WalletAuthSheet({ request, security, hasGoogleBackup, decrypt, fetchKek, needsGooglePopup, stepUpWithGoogle, onDone }) {
  const [viaGoogle, setViaGoogle] = useState(security !== "password");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Decided up front so the Google popup opens straight from the click.
  const [popupNeeded, setPopupNeeded] = useState(true);

  useEffect(() => {
    if (security === "google" || hasGoogleBackup) needsGooglePopup().then(setPopupNeeded, () => setPopupNeeded(true));
  }, [security, hasGoogleBackup, needsGooglePopup]);

  const usesPassword = security === "password" && !viaGoogle;

  const cancel = () => {
    if (busy) return;
    request.reject(Object.assign(new Error("Cancelled"), { code: "USER_CANCELLED" }));
    onDone();
  };

  const confirm = async (e) => {
    e?.preventDefault();
    if (usesPassword && !password) return setError("Password is required");
    setError("");
    setBusy(true);
    try {
      let data;
      if (usesPassword) data = await decrypt(password);
      else if (security === "google-legacy") data = await decrypt(await fetchKek());
      else {
        if (popupNeeded) await stepUpWithGoogle();
        data = await decrypt(null, { viaGoogle: true });
      }
      setPassword("");
      request.resolve(data);
      onDone();
    } catch (err) {
      setBusy(false);
      if (isPopupDismissed(err)) return;
      setError(usesPassword && !err.message?.startsWith("Too many") ? "Incorrect password. Please try again." : err.message);
    }
  };

  return (
    <Modal open onClose={cancel} labelledBy="wallet-auth-title" dismissible={!busy}>
      <form onSubmit={confirm} noValidate>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface">
            {usesPassword ? <IoLockClosed size={30} className="text-primary" /> : <GoogleMark size={30} />}
          </div>
          <h2 id="wallet-auth-title" className="mb-1 text-xl font-bold text-text">
            {request.title}
          </h2>
          <p className="text-sm text-text-secondary">
            {request.description ||
              (usesPassword
                ? "Enter your account password to authorise this action."
                : "Confirm with your Google account to authorise this action.")}
          </p>
        </div>

        {usesPassword && (
          <Input
            label="Account Password"
            secure
            autoFocus
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            disabled={busy}
            error={error}
            leftIcon={<IoKeyOutline size={20} />}
          />
        )}
        {!usesPassword && error && <p className="mb-4 text-center text-sm text-error">{error}</p>}

        <p className="mb-6 flex items-center justify-center gap-1 text-xs text-text-tertiary" aria-live="polite">
          <IoShieldCheckmarkOutline size={14} />
          {busy ? "Decrypting your wallet… this takes a few seconds." : "Your key is used for this action only, then discarded."}
        </p>

        <Button
          type="submit"
          title={usesPassword ? "Confirm" : "Confirm with Google"}
          icon={usesPassword ? null : <GoogleMark size={18} />}
          fullWidth
          loading={busy}
          className="mb-3"
        />
        {security === "password" && hasGoogleBackup && !busy && (
          <button
            type="button"
            onClick={() => {
              setViaGoogle((v) => !v);
              setError("");
            }}
            className="mb-3 w-full text-center text-sm font-semibold text-primary hover:underline"
          >
            {viaGoogle ? "Use my password instead" : "Forgot your password? Use your Google backup"}
          </button>
        )}
        <Button title="Cancel" variant="outline" fullWidth disabled={busy} onClick={cancel} />
      </form>
    </Modal>
  );
}
