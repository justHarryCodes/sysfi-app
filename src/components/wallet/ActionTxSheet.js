"use client";
// components/wallet/ActionTxSheet.js — confirm sheet for contract calls
// (vote, propose, delegate, launch …), the counterpart of TxFlow for
// transfers and of the app's TransactionModal for DAO params.
//
//   • review: what the call does, network fee, and a pre-flight simulation of
//     the first step so a doomed call shows its revert reason up front
//   • one authorisation (password sheet or wallet app) runs every step in
//     order — e.g. approve → createDAO — each re-estimated once the previous
//     one is mined
//   • success / error, then onSuccess(results)
import { useEffect, useState } from "react";
import { IoAlertCircle, IoCheckmarkCircle, IoEllipseOutline, IoOpenOutline } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useWallet } from "@/contexts/WalletContext";
import { explorerTx } from "@/lib/config";
import { getProvider } from "@/lib/chain/rpc";
import { describeTxError, estimateTx, sendPrepared } from "@/lib/chain/tx";

/**
 * props
 *   open, onClose, chain
 *   title, description          what the user is approving
 *   details: [{ label, value }] summary rows
 *   steps: [{ label, request }]  request = { to, data, value } or () => Promise<request>
 *   tone: "primary" | "danger"
 *   onSuccess(results)          [{ hash, receipt }] per step
 */
export default function ActionTxSheet({ open, onClose, chain, title, description, details = [], steps, tone = "primary", onSuccess }) {
  const { withSigner, address, isExternal } = useWallet();
  const [phase, setPhase] = useState("review"); // review | processing | success | error
  const [preflight, setPreflight] = useState({ status: "idle" }); // idle | ok | fail
  const [current, setCurrent] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const first = steps?.[0]?.request;

  // Simulate + price the first step as soon as the sheet opens.
  useEffect(() => {
    if (!open || !first || typeof first === "function") return;
    let cancelled = false;
    estimateTx(chain, { ...first, from: address })
      .then((estimate) => !cancelled && setPreflight({ status: "ok", estimate }))
      .catch((err) => !cancelled && setPreflight({ status: "fail", error: describeTxError(err) }));
    return () => {
      cancelled = true;
    };
  }, [open, first, chain, address]);

  if (!open) return null;

  const reset = () => {
    setPhase("review");
    setPreflight({ status: "idle" });
    setCurrent(0);
    setResults([]);
    setError(null);
  };
  const close = () => {
    if (phase === "processing") return;
    reset();
    onClose();
  };

  const confirm = async () => {
    setError(null);
    const done = [];
    try {
      await withSigner(
        getProvider(chain),
        async (signer) => {
          setPhase("processing");
          const from = await signer.getAddress();
          for (let i = 0; i < steps.length; i++) {
            setCurrent(i);
            const req = typeof steps[i].request === "function" ? await steps[i].request() : steps[i].request;
            const estimate = await estimateTx(chain, { ...req, from });
            done.push(await sendPrepared(signer, req, estimate));
            setResults([...done]);
          }
        },
        { title, description: isExternal ? undefined : `Enter your account password to confirm on ${chain.name}.` },
      );
      setPhase("success");
    } catch (err) {
      const info = describeTxError(err);
      if (!info) return setPhase("review"); // cancelled the password sheet / wallet prompt
      setError({ ...info, hash: err?.hash });
      setPhase("error");
    }
  };

  const finish = () => {
    const r = results;
    reset();
    onSuccess?.(r);
  };

  const lastHash = results.at(-1)?.hash;
  const blocked = preflight.status === "fail";

  return (
    <Modal open onClose={close} labelledBy="action-title" dismissible={phase !== "processing"}>
      {phase === "review" && (
        <>
          <h2 id="action-title" className="mb-1 text-center text-lg font-bold text-text">
            {title}
          </h2>
          {description && <p className="mb-5 text-center text-sm text-text-secondary">{description}</p>}

          <div className="mb-4 divide-y divide-divider rounded-lg bg-surface px-4">
            {details.map((d) => (
              <div key={d.label} className="flex items-start justify-between gap-4 py-3 text-sm">
                <span className="shrink-0 text-text-secondary">{d.label}</span>
                <span className="min-w-0 break-words text-right font-semibold text-text">{d.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="text-text-secondary">Network fee</span>
              <span className="font-semibold text-text">
                {preflight.status === "ok"
                  ? `≤ ${Number(preflight.estimate.feeFormatted).toPrecision(3)} ${chain.symbol}`
                  : preflight.status === "fail"
                    ? "—"
                    : typeof first === "function"
                      ? "Estimated at each step"
                      : <Spinner size={16} />}
              </span>
            </div>
          </div>

          {steps.length > 1 && (
            <ol className="mb-4 space-y-1.5 text-sm text-text-secondary">
              {steps.map((s, i) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-hover text-[11px] font-bold text-text">{i + 1}</span>
                  {s.label}
                </li>
              ))}
            </ol>
          )}

          {blocked && (
            <div className="mb-4 flex gap-2 rounded-lg border border-error/25 bg-error/[0.06] p-3 text-sm">
              <IoAlertCircle size={18} className="mt-0.5 shrink-0 text-error" />
              <div>
                <p className="font-semibold text-error">{preflight.error?.title}</p>
                <p className="text-text-secondary">{preflight.error?.message}</p>
              </div>
            </div>
          )}

          <Button
            title={blocked ? "Can't continue" : steps.length > 1 ? `Confirm ${steps.length} transactions` : "Confirm"}
            variant={tone === "danger" ? "danger" : "primary"}
            fullWidth
            disabled={blocked || (preflight.status === "idle" && typeof first !== "function")}
            onClick={confirm}
            className="mb-3"
          />
          <Button title="Cancel" variant="outline" fullWidth onClick={close} />
        </>
      )}

      {phase === "processing" && (
        <div className="py-6 text-center" aria-live="polite">
          <Spinner size={40} className="mx-auto text-primary" />
          <h2 id="action-title" className="mb-1 mt-5 text-lg font-bold text-text">
            {isExternal ? "Confirm in your wallet" : "Submitting…"}
          </h2>
          <p className="mb-5 text-sm text-text-secondary">{steps[current]?.label}</p>
          {steps.length > 1 && (
            <ol className="mx-auto max-w-xs space-y-2 text-left text-sm">
              {steps.map((s, i) => (
                <li key={s.label} className={`flex items-center gap-2 ${i > current ? "text-text-tertiary" : "text-text"}`}>
                  {i < current ? (
                    <IoCheckmarkCircle size={18} className="text-success" />
                  ) : i === current ? (
                    <Spinner size={16} className="text-primary" />
                  ) : (
                    <IoEllipseOutline size={18} />
                  )}
                  {s.label}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {phase === "success" && (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-on-primary [animation:tx-pop_500ms_cubic-bezier(.2,1.4,.4,1)]">
            <IoCheckmarkCircle size={40} />
          </span>
          <h2 id="action-title" className="mb-1 text-lg font-bold text-text">
            Confirmed
          </h2>
          <p className="mb-5 text-sm text-text-secondary">{title} went through on {chain.name}.</p>
          {lastHash && (
            <a href={explorerTx(chain, lastHash)} target="_blank" rel="noreferrer" className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View on explorer <IoOpenOutline size={14} />
            </a>
          )}
          <Button title="Done" fullWidth onClick={finish} />
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col items-center py-4 text-center">
          <IoAlertCircle size={56} className="mb-4 text-error" />
          <h2 id="action-title" className="mb-2 text-lg font-bold text-text">
            {error?.title}
          </h2>
          <p className="mb-6 text-sm text-text-secondary">{error?.message}</p>
          {results.length > 0 && results.length < steps.length && (
            <p className="mb-4 text-xs text-text-tertiary">
              {results.length} of {steps.length} steps completed — retrying picks up where it stopped.
            </p>
          )}
          {error?.hash && (
            <a href={explorerTx(chain, error.hash)} target="_blank" rel="noreferrer" className="mb-6 inline-flex items-center gap-1 text-sm font-semibold text-primary">
              View on explorer <IoOpenOutline size={14} />
            </a>
          )}
          <Button title="Close" fullWidth onClick={close} />
        </div>
      )}
    </Modal>
  );
}
