// Token-gate card — port of components/tribe/TokenRequirements.js.
import { IoKeyOutline, IoCheckmarkCircle, IoCloseCircle, IoOpenOutline, IoRefresh } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import { LEGACY_CHAIN_ID, explorerToken, getChainById } from "@/lib/config";
import { formatAddress } from "@/lib/wallet";
import { formatBalance } from "@/lib/format";

export default function TokenRequirements({ gate, check, address }) {
  const chain = getChainById(gate.chainId ?? LEGACY_CHAIN_ID);
  const need = gate.tokenType === "NFT" ? `at least 1 ${gate.name || "NFT"}` : `at least ${gate.minTokenAmount} ${gate.symbol || "tokens"}`;
  return (
    <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <p className="mb-1 flex items-center gap-2 font-bold text-text">
        <IoKeyOutline size={18} className="text-primary" /> Token-gated tribe
      </p>
      <p className="mb-3 text-sm text-text-secondary">To join, your wallet needs to hold {need}.</p>
      <a
        href={explorerToken(chain, gate.tokenAddress)}
        target="_blank"
        rel="noreferrer"
        className="mb-3 inline-flex items-center gap-1 font-mono text-xs text-text-tertiary hover:text-primary"
      >
        {gate.name ? `${gate.name} · ` : ""}
        {formatAddress(gate.tokenAddress, 6)} <IoOpenOutline size={12} />
      </a>
      <div className="flex items-center justify-between rounded-xl bg-background/60 px-3 py-2.5 text-sm">
        <span className="text-text-secondary">Your wallet {address ? formatAddress(address, 4) : ""}</span>
        {check.isFetching ? (
          <Spinner size={16} />
        ) : check.data ? (
          <span className={`flex items-center gap-1 font-semibold ${check.data.hasToken ? "text-primary" : "text-text-secondary"}`}>
            {check.data.hasToken ? <IoCheckmarkCircle size={16} /> : <IoCloseCircle size={16} />}
            {gate.tokenType === "NFT" ? `${check.data.balance} held` : `${formatBalance(check.data.balance)} ${gate.symbol || ""}`}
          </span>
        ) : (
          <button type="button" onClick={() => check.refetch()} className="flex items-center gap-1 font-semibold text-primary">
            <IoRefresh size={14} /> Check
          </button>
        )}
      </div>
    </section>
  );
}
