"use client";
// Twin of crypto-wallet/screens/auth/EmailVerificationScreen.js.
//
// Two steps, never more than two buttons on screen:
//   1. "Verify me"      — nothing is sent until the user asks
//   2. "I've verified" + "Resend" (with a cooldown)
//
// The cooldown is a wall-clock deadline (resendAt), so it stays right while
// the tab is in the background (browsers throttle timers there). The step and
// deadline are remembered per user; coming back to the tab on step 2 quietly
// checks whether the link was opened.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { doc, updateDoc } from "firebase/firestore";
import {
  IoMail,
  IoMailOutline,
  IoMailUnreadOutline,
  IoPaperPlane,
  IoShieldCheckmark,
} from "react-icons/io5";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import Button from "@/components/ui/Button";
import { sendVerificationEmail } from "@/services/firebaseUser";

const COOLDOWN_MS = 60_000;
const RATE_LIMITED_COOLDOWN_MS = 120_000;
const SENT_MEMORY_MS = 24 * 60 * 60 * 1000;
const storageKey = (uid) => `emailVerification:${uid}`;

// Saved step for this user, as the raw stored string (stable for useSyncExternalStore).
const readSavedRaw = (uid) => {
  try {
    const raw = uid ? localStorage.getItem(storageKey(uid)) : null;
    const saved = raw ? JSON.parse(raw) : null;
    return saved?.sentAt && Date.now() - saved.sentAt < SENT_MEMORY_MS
      ? raw
      : null;
  } catch {
    return null;
  }
};
const noSubscribe = () => () => {};
const save = (uid, value) => {
  try {
    if (value) localStorage.setItem(storageKey(uid), JSON.stringify(value));
    else localStorage.removeItem(storageKey(uid));
  } catch {
    // private mode etc. — the flow still works, it just isn't remembered
  }
};

const formatWait = (s) =>
  s >= 60
    ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
    : `${s}s`;

/** Envelope with slow pulse rings and a status badge (send → sent). */
function VerifyIllustration({ sent }) {
  return (
    <div
      className="relative mb-7 flex h-44 w-44 items-center justify-center"
      aria-hidden
    >
      <span className="absolute h-32 w-32 rounded-full border-[1.5px] border-primary opacity-0 [animation:verify-ring_2.4s_ease-out_infinite]" />
      <span className="absolute h-32 w-32 rounded-full border-[1.5px] border-primary opacity-0 [animation:verify-ring_2.4s_ease-out_1.2s_infinite]" />
      <div className="flex h-32 w-32 items-center justify-center rounded-full bg-primary/15">
        <div className="flex h-16 w-[84px] items-center justify-center rounded-2xl border border-border bg-card text-primary">
          {sent ? (
            <IoMailUnreadOutline size={44} />
          ) : (
            <IoMailOutline size={44} />
          )}
        </div>
      </div>
      <div className="absolute bottom-[30px] right-[30px] flex h-[38px] w-[38px] items-center justify-center rounded-full border-[3px] border-background bg-primary text-on-primary">
        {sent ? <IoPaperPlane size={17} /> : <IoShieldCheckmark size={18} />}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  const { user, refreshUserData, logout } = useAuth();
  const { showAlert } = useFeedback();
  const uid = user?.uid ?? auth.currentUser?.uid;

  // Remembered step (client only — the server render shows step 1), then
  // whatever the user does here on top of it.
  const savedRaw = useSyncExternalStore(
    noSubscribe,
    () => readSavedRaw(uid),
    () => null,
  );
  const saved = useMemo(
    () => (savedRaw ? JSON.parse(savedRaw) : null),
    [savedRaw],
  );
  const [local, setLocal] = useState(null); // { resendAt } once a link is sent from this page
  const phase = local || saved ? "sent" : "intro"; // intro → sent
  const resendAt = local?.resendAt ?? saved?.resendAt ?? 0;
  const [now, setNow] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const sent = phase === "sent";

  const ticking = secondsLeft > 0;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  const startCooldown = (ms) => {
    const t = Date.now();
    setLocal({ resendAt: t + ms });
    setNow(t);
    if (uid) save(uid, { sentAt: t, resendAt: t + ms });
  };

  const sendLink = async () => {
    if (!auth.currentUser || sending || secondsLeft > 0) return;
    setSending(true);
    try {
      await sendVerificationEmail(auth.currentUser);
      startCooldown(COOLDOWN_MS);
    } catch (err) {
      if (err?.code === "auth/too-many-requests") {
        startCooldown(RATE_LIMITED_COOLDOWN_MS);
        showAlert(
          "Link already sent",
          "We sent a link very recently. Check your inbox and spam folder before asking for another.",
        );
      } else {
        showAlert(
          "Couldn't send the link",
          "Please check your connection and try again.",
        );
      }
    } finally {
      setSending(false);
    }
  };

  const checkVerified = useCallback(
    async ({ silent = false } = {}) => {
      const cu = auth.currentUser;
      if (!cu || checkingRef.current) return;
      checkingRef.current = true;
      if (!silent) setChecking(true);
      try {
        await cu.reload();
        if (!cu.emailVerified) {
          if (!silent)
            showAlert(
              "Not verified yet",
              "Open the link in the email we sent, then press “I've verified” again.",
            );
          return;
        }
        // Firestore rules read token.email_verified — refresh the token first.
        await cu.getIdToken(true);
        await updateDoc(doc(db, "users", cu.uid), {
          emailVerified: true,
        }).catch((e) =>
          console.warn(
            "Firestore emailVerified sync failed (non-blocking):",
            e,
          ),
        );
        save(cu.uid, null);
        await refreshUserData();
      } catch {
        if (!silent)
          showAlert(
            "Couldn't check",
            "Please check your connection and try again.",
          );
      } finally {
        checkingRef.current = false;
        if (!silent) setChecking(false);
      }
    },
    [refreshUserData, showAlert],
  );

  // Back from the mail tab: refresh the clock and quietly check.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      if (sent) checkVerified({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [sent, checkVerified]);

  const confirmSignOut = () =>
    showAlert("Sign out", "You can verify your email next time you sign in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => logout() },
    ]);

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="mx-auto flex h-14 w-full max-w-[440px] items-center justify-between px-6">
        <div
          className="flex gap-1.5"
          aria-label={sent ? "Step 2 of 2" : "Step 1 of 2"}
        >
          <span className="h-1.5 w-[22px] rounded-full bg-primary" />
          <span
            className={`h-1.5 rounded-full transition-all duration-300 ${sent ? "w-[22px] bg-primary" : "w-1.5 bg-border"}`}
          />
        </div>
        <button
          type="button"
          onClick={confirmSignOut}
          className="text-sm font-semibold text-text-secondary hover:text-text"
        >
          Sign out
        </button>
      </header>

      {/* Phones: action pinned to the bottom (thumb reach). Wider screens: content + action centred together. */}
      <div className="flex flex-1 flex-col md:justify-center md:pb-14">
        <section className="mx-auto flex w-full max-w-[440px] flex-1 flex-col items-center justify-center px-6 py-6 text-center md:flex-none">
          <VerifyIllustration sent={sent} />
          <p className="mb-2 text-xs font-bold tracking-[0.12em] text-primary">
            {sent ? "LINK SENT" : "ONE LAST STEP"}
          </p>
          <h1 className="mb-2 text-xxl font-extrabold text-text">
            {sent ? "Check your inbox" : "Verify your email"}
          </h1>
          <p className="max-w-[320px] text-md leading-relaxed text-text-secondary">
            {sent
              ? "Open the email from Sysfi and click the link. Then come back here."
              : "Confirm this address belongs to you. We'll email you a one-click link."}
          </p>

          <div className="mt-6 flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
            <IoMail size={16} className="shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold text-text">
              {user?.email ?? auth.currentUser?.email}
            </span>
          </div>

          {sent && (
            <>
              <ol className="mt-8 grid w-full max-w-[340px] grid-cols-3">
                {["Open the email", "Click the link", "Come back here"].map(
                  (label, i) => (
                    <li
                      key={label}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-border bg-surface text-xs font-bold text-text">
                        {i + 1}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {label}
                      </span>
                    </li>
                  ),
                )}
              </ol>
              <p className="mt-6 text-xs text-text-tertiary">
                Can&apos;t find it? Check your spam or promotions folder.
              </p>
            </>
          )}
        </section>

        <footer className="mx-auto flex w-full max-w-[440px] flex-col gap-2 px-6 pb-8 pt-4 md:pt-6">
          {sent ? (
            <>
              <Button
                title="I've verified"
                onClick={() => checkVerified()}
                loading={checking}
                fullWidth
                size="medium"
                className="rounded-lg"
              />
              <Button
                title={
                  secondsLeft > 0
                    ? `Resend in ${formatWait(secondsLeft)}`
                    : "Resend link"
                }
                onClick={sendLink}
                loading={sending}
                disabled={secondsLeft > 0}
                variant="outline"
                fullWidth
                size="medium"
                className="rounded-lg"
              />
            </>
          ) : (
            <Button
              title="Verify me"
              onClick={sendLink}
              loading={sending}
              fullWidth
              size="medium"
              className="rounded-lg"
            />
          )}
        </footer>
      </div>
    </main>
  );
}
