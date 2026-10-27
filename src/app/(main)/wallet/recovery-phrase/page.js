"use client";
// Recovery Phrase — port of RecoveryPhraseScreen: security warning → confirm
// with password (withSecret) → words. The words live only in this page's
// state, are re-hidden whenever the tab goes to the background, and are
// dropped on leave.
import { useEffect, useState } from "react";
import { IoWarning, IoKey, IoEyeOutline, IoEyeOffOutline, IoCopyOutline, IoCheckmark, IoInformationCircleOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Button from "@/components/ui/Button";
import { useWallet } from "@/contexts/WalletContext";
import { useFeedback } from "@/contexts/FeedbackContext";

const WARNINGS = [
  "Anyone with these words can take everything in your wallet.",
  "Sysfi will never ask for your recovery phrase.",
  "Write it down offline. Don't screenshot it or store it in the cloud.",
];

export default function RecoveryPhrasePage() {
  const { withSecret, activeAccountIndex } = useWallet();
  const { showAlert } = useFeedback();
  const [words, setWords] = useState(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && setVisible(false);
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);

  const reveal = async () => {
    setBusy(true);
    try {
      const mnemonic = await withSecret((d) => d.mnemonic, {
        title: "Show recovery phrase",
        description: "Enter your account password to reveal your recovery phrase.",
      });
      if (!mnemonic) throw new Error("This wallet has no recovery phrase stored.");
      setWords(mnemonic.split(" "));
      setVisible(true);
    } catch (err) {
      if (err?.code !== "USER_CANCELLED") showAlert("Couldn't reveal phrase", err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(words.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <PageHeader title="Recovery Phrase" backHref="/wallet" />
      <div className="mx-auto max-w-[520px] px-4 py-6">
        {!words ? (
          <>
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-[100px] w-[100px] items-center justify-center rounded-full bg-surface">
                <IoWarning size={48} className="text-primary" />
              </div>
              <h2 className="mb-1 text-xl font-bold text-text">Security Warning</h2>
              <p className="text-sm text-text-secondary">Your recovery phrase is the master key to your wallet.</p>
            </div>
            <ul className="mb-6 space-y-2">
              {WARNINGS.map((w) => (
                <li key={w} className="flex items-start gap-2 rounded-lg bg-surface p-3 text-sm text-text">
                  <IoKey size={16} className="mt-0.5 shrink-0 text-primary" /> {w}
                </li>
              ))}
            </ul>
            <Button title="I Understand" fullWidth loading={busy} onClick={reveal} />
          </>
        ) : (
          <>
            <div className="relative mb-4 rounded-xl bg-surface p-4">
              <ol className={`grid grid-cols-3 gap-2 transition ${visible ? "" : "select-none blur-md"}`} aria-hidden={!visible}>
                {words.map((w, i) => (
                  <li key={i} className="flex items-center gap-1.5 rounded-md bg-card px-2 py-2">
                    <span className="w-4 text-right text-xs text-text-tertiary">{i + 1}</span>
                    <span className="font-mono text-sm font-semibold text-text">{w}</span>
                  </li>
                ))}
              </ol>
              {!visible && (
                <button type="button" onClick={() => setVisible(true)} className="absolute inset-0 flex items-center justify-center gap-2 font-bold text-text">
                  <IoEyeOutline size={20} /> Tap to reveal
                </button>
              )}
            </div>
            <div className="mb-6 grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                title={visible ? "Hide" : "Show"}
                icon={visible ? <IoEyeOffOutline size={18} /> : <IoEyeOutline size={18} />}
                onClick={() => setVisible((v) => !v)}
              />
              <Button
                variant="secondary"
                title={copied ? "Copied" : "Copy to Clipboard"}
                icon={copied ? <IoCheckmark size={18} /> : <IoCopyOutline size={18} />}
                onClick={copy}
              />
            </div>
            <div className="mb-4 flex items-start gap-2 rounded-lg bg-primary-light p-4 text-sm text-text">
              <IoInformationCircleOutline size={20} className="mt-px shrink-0 text-on-primary-light" />
              <p>
                Tribe derives your account{activeAccountIndex ? "s" : ""} from this phrase plus the BIP-39 passphrase{" "}
                <code className="rounded bg-background px-1 font-mono text-xs">m/44&apos;/60&apos;/0&apos;/0/{activeAccountIndex}</code>. Another
                wallet app will only show the same address if you enter that passphrase too.
              </p>
            </div>
            <Button title="Done" fullWidth onClick={() => setWords(null)} />
          </>
        )}
      </div>
    </>
  );
}
