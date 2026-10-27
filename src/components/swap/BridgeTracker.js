"use client";
// components/swap/BridgeTracker.js — a cross-chain trade after it's signed:
// polls LI.FI's status (backend /lifi/status) until the funds land on the
// destination chain, then refreshes balances.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { IoCheckmarkCircle, IoAlertCircle, IoClose, IoOpenOutline } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { explorerTx, getChainById } from "@/lib/config";
import { getBridgeStatus } from "@/lib/swap/api";

/** bridge: { txHash, fromChain, toChain, label, etaSec, startedAt } */
export default function BridgeTracker({ bridge, onDone, onDismiss }) {
  const from = getChainById(bridge.fromChain);
  const to = getChainById(bridge.toChain);
  const q = useQuery({
    queryKey: ["bridge", bridge.txHash],
    queryFn: () => getBridgeStatus(bridge),
    refetchInterval: (query) => (["DONE", "FAILED"].includes(query.state.data?.status) ? false : 8000),
    retry: true,
    meta: { persist: false },
  });
  const status = q.data?.status ?? "PENDING";
  const done = status === "DONE";
  const failed = status === "FAILED";
  const receiving = q.data?.receiving;

  useEffect(() => {
    if (done) onDone?.();
  }, [done, onDone]);

  return (
    <div className={`mt-3 rounded-2xl border p-3 ${failed ? "border-down/30 bg-down/[0.05]" : done ? "border-up/30 bg-up/[0.05]" : "border-border bg-surface"}`} role="status" aria-live="polite">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5">
          {done ? <IoCheckmarkCircle size={18} className="text-up" /> : failed ? <IoAlertCircle size={18} className="text-down" /> : <Spinner size={16} className="text-primary" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">{bridge.label}</p>
          <p className="flex items-center gap-1 text-xs text-text-secondary">
            {from && <ChainIcon chain={from} size={12} />} {from?.shortName} →{to && <ChainIcon chain={to} size={12} />} {to?.shortName} ·{" "}
            {done
              ? "Arrived"
              : failed
                ? q.data?.substatusMessage || "Bridge failed — funds are refunded on the source chain"
                : q.data?.substatus === "WAIT_DESTINATION_TRANSACTION"
                  ? "Finishing on destination…"
                  : bridge.etaSec
                    ? `About ${Math.max(1, Math.round(bridge.etaSec / 60))} min`
                    : "In progress"}
          </p>
          <div className="mt-1 flex gap-3 text-[11px]">
            {from && (
              <a href={explorerTx(from, bridge.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary">
                Sent <IoOpenOutline size={11} />
              </a>
            )}
            {receiving?.txHash && to && (
              <a href={explorerTx(to, receiving.txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary">
                Received <IoOpenOutline size={11} />
              </a>
            )}
          </div>
        </div>
        {(done || failed) && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss} className="rounded p-0.5 text-text-tertiary hover:text-text">
            <IoClose size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
