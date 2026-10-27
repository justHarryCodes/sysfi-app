"use client";
// components/wallet/TxFlow.js — the send pipeline UI, port of the app's
// TransactionModal (review → authorise → processing → success | error) and
// TransactionSuccessScreen. Authorisation goes through WalletContext.withSigner,
// which asks for the password and discards the key once the tx is mined.
import { useEffect, useRef, useState } from "react";
import {
  IoCheckmark,
  IoAlertCircle,
  IoArrowForwardOutline,
  IoOpenOutline,
  IoShieldCheckmarkOutline,
} from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Portal from "@/components/ui/Portal";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import TokenLogo from "@/components/wallet/TokenLogo";
import { useWallet } from "@/contexts/WalletContext";
import { useRefreshWallet } from "@/hooks/wallet";
import { explorerTx } from "@/lib/config";
import { getProvider } from "@/lib/chain/rpc";
import { describeTxError, sendPrepared } from "@/lib/chain/tx";
import { formatAddress } from "@/lib/wallet";

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="min-w-0 text-right font-semibold text-text">{children}</span>
    </div>
  );
}

/**
 * props
 *   open, onClose
 *   chain
 *   prepared: { request, estimate }        — built + estimated by the caller
 *   hero: { amount, symbol, logo, address, usd }   or { image, name } for NFTs
 *   to: recipient address, toLabel?: ENS name
 *   feeUsd?: string
 *   onSuccess(result)
 */
export default function TxFlow({ open, onClose, chain, prepared, hero, to, toLabel, feeUsd, onSuccess }) {
  const { withSigner, isExternal } = useWallet();
  const refreshWallet = useRefreshWallet();
  const [step, setStep] = useState("review"); // review | processing | success | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const confirm = async () => {
    setError(null);
    try {
      const res = await withSigner(
        getProvider(chain),
        async (signer) => {
          setStep("processing");
          return sendPrepared(signer, prepared.request, prepared.estimate);
        },
        { title: "Confirm transaction", description: `Enter your account password to send on ${chain.name}.` },
      );
      setResult(res);
      setStep("success");
      refreshWallet();
    } catch (err) {
      const info = describeTxError(err);
      if (!info) return setStep("review"); // user cancelled the password sheet
      setError({ ...info, hash: err?.hash });
      setStep("error");
      refreshWallet();
    }
  };

  const close = () => {
    if (step === "processing") return;
    setStep("review");
    setError(null);
    onClose();
  };

  if (!open) return null;

  if (step === "success") {
    return (
      <SuccessOverlay
        hero={hero}
        to={to}
        href={explorerTx(chain, result.hash)}
        onDone={() => {
          setStep("review");
          onSuccess?.(result);
        }}
      />
    );
  }

  return (
    <Modal open onClose={close} labelledBy="tx-title" dismissible={step !== "processing"}>
      {step === "review" && (
        <>
          <h2 id="tx-title" className="mb-5 text-center text-lg font-bold text-text">
            Review transaction
          </h2>
          <div className="mb-5 flex flex-col items-center gap-2">
            {hero.image !== undefined ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero.image || "/default-avatar.png"} alt="" className="h-24 w-24 rounded-xl bg-surface object-cover" />
            ) : (
              <TokenLogo logo={hero.logo} address={hero.address} symbol={hero.symbol} size={48} />
            )}
            <p className="text-center text-xxl font-black tracking-[-0.5px] text-text">
              {hero.name ?? `${hero.amount} ${hero.symbol}`}
            </p>
            {hero.usd && <p className="text-sm text-text-secondary">{hero.usd}</p>}
          </div>
          <div className="mb-5 divide-y divide-divider rounded-lg bg-surface px-4">
            <Row label="To">
              {toLabel && <span className="block">{toLabel}</span>}
              <span className="font-mono text-xs text-text-secondary">{formatAddress(to, 8)}</span>
            </Row>
            <Row label="Network">{chain.name}</Row>
            <Row label="Network fee">
              ≤ {Number(prepared.estimate.feeFormatted).toPrecision(3)} {chain.symbol}
              {feeUsd && <span className="block text-xs font-normal text-text-secondary">{feeUsd}</span>}
            </Row>
          </div>
          <p className="mb-5 flex items-center justify-center gap-1 text-xs text-text-tertiary">
            <IoShieldCheckmarkOutline size={14} />
            Transactions on-chain can&apos;t be reversed — check the address.
          </p>
          <Button title="Confirm" fullWidth onClick={confirm} className="mb-3" />
          <Button title="Cancel" variant="outline" fullWidth onClick={close} />
        </>
      )}

      {step === "processing" && (
        <div className="flex flex-col items-center py-8 text-center" aria-live="polite">
          <Spinner size={44} />
          <h2 id="tx-title" className="mb-1 mt-6 text-lg font-bold text-text">
            {isExternal ? "Confirm in your wallet" : "Submitting…"}
          </h2>
          <p className="text-sm text-text-secondary">
            {isExternal
              ? "Approve the transaction in your wallet app. We'll wait for the network to confirm it."
              : "Your transaction is being sent to the network."}
          </p>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col items-center py-4 text-center">
          <IoAlertCircle size={56} className="mb-4 text-error" />
          <h2 id="tx-title" className="mb-2 text-lg font-bold text-text">
            {error?.title}
          </h2>
          <p className="mb-6 text-sm text-text-secondary">{error?.message}</p>
          {error?.hash && (
            <a href={explorerTx(chain, error.hash)} target="_blank" rel="noreferrer" className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View on explorer <IoOpenOutline size={14} />
            </a>
          )}
          <Button title="Try Again" fullWidth onClick={() => setStep("review")} className="mb-3" />
          <Button title="Close" variant="outline" fullWidth onClick={close} />
        </div>
      )}
    </Modal>
  );
}

/** Full-screen confirmation — TransactionSuccessScreen. Auto-continues after 4s. */
function SuccessOverlay({ hero, to, href, onDone }) {
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), 4500);
    return () => clearTimeout(t);
  }, []);

  return (
    <Portal>
    <div className="fixed inset-0 z-[120] flex flex-col items-center overflow-hidden bg-background" role="status" aria-live="polite">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[30vh] h-[80vh] w-[140vw] rounded-full opacity-[0.13] [animation:tx-glow_900ms_ease-out]"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 65%)" }}
      />
      <div className="relative mt-[22vh] flex h-40 w-40 items-center justify-center [animation:tx-pop_500ms_cubic-bezier(.2,1.4,.4,1)]">
        <span className="absolute inset-0 rounded-full border-2 border-primary/15" />
        <span className="absolute inset-4 rounded-full border-2 border-primary/25" />
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-on-primary">
          <IoCheckmark size={56} />
        </span>
      </div>

      <div className="mt-auto flex w-full max-w-md flex-col items-center px-6 pb-[calc(env(safe-area-inset-bottom)+56px)] [animation:tx-rise_600ms_ease-out]">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[1.5px] text-text-secondary">Transaction Sent</p>
        <div className="mb-2 flex items-center gap-3">
          {hero.image !== undefined ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.image || "/default-avatar.png"} alt="" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <TokenLogo logo={hero.logo} address={hero.address} symbol={hero.symbol} size={40} />
          )}
          <span className="text-[34px] font-black tracking-[-1px] text-text">{hero.name ?? hero.amount}</span>
          {hero.name === undefined && <span className="text-xl font-bold text-text-secondary">{hero.symbol}</span>}
        </div>
        {hero.usd && <p className="mb-4 text-md text-text-secondary">{hero.usd}</p>}
        <span className="mb-6 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 font-mono text-sm text-text-secondary">
          <IoArrowForwardOutline size={13} />
          {formatAddress(to, 6)}
        </span>
        <div className="mb-6 flex gap-3">
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-text">
            Explorer <IoOpenOutline size={14} />
          </a>
          <button type="button" onClick={() => doneRef.current()} className="rounded-full bg-primary px-6 py-2 text-sm font-bold text-on-primary">
            Done
          </button>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full bg-primary [animation:tx-progress_4500ms_linear_forwards]" />
        </div>
      </div>
    </div>
    </Portal>
  );
}
