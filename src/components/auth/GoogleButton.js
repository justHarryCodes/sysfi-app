"use client";
// components/auth/GoogleButton.js — "Continue with Google" (sign in or sign
// up; Firebase popup with Drive access for the wallet backup). Styled per
// Google's branding guidelines: neutral surface, the four-colour G, a plain
// label. FlowGate routes on once signed in.
import { useState } from "react";
import { useRouter } from "next/navigation";
import GoogleMark from "@/components/auth/GoogleMark";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { isPopupDismissed } from "@/lib/googleAuth";

export default function GoogleButton({ label = "Continue with Google", className = "" }) {
  const { loginWithGoogle } = useAuth();
  const { showAlert } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      await loginWithGoogle();
      // Stay busy: FlowGate navigates away.
    } catch (err) {
      setBusy(false);
      if (isPopupDismissed(err)) return;
      if (err.code === "GOOGLE_ACCOUNT_EXISTS") {
        showAlert("Sign in with your password", err.message, [
          { text: "OK", onPress: () => router.push(`/login${err.email ? `?email=${encodeURIComponent(err.email)}` : ""}`) },
        ]);
        return;
      }
      if (err.code === "auth/popup-blocked") {
        showAlert("Popup blocked", "Allow popups for this site to continue with Google.");
        return;
      }
      showAlert("Google sign-in failed", err.message || "Please try again.");
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex h-[52px] w-full items-center justify-center gap-3 rounded-lg border border-border bg-card text-md font-semibold text-text transition-colors hover:bg-surface disabled:opacity-60 ${className}`}
    >
      {busy ? <Spinner size={20} /> : <GoogleMark size={20} />}
      {busy ? "Connecting to Google…" : label}
    </button>
  );
}
