"use client";
// components/wallet/MultiAssetRow.js — one asset across networks (All
// networks view): logo · symbol · chain icons · total, expanding into a row
// per chain. Picking a chain row switches the active network and opens the
// token there.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { IoChevronDown, IoChevronForward } from "react-icons/io5";
import TokenLogo from "@/components/wallet/TokenLogo";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { useChain } from "@/contexts/ChainContext";
import { formatBalance, formatUsd } from "@/lib/format";

export default function MultiAssetRow({ group }) {
  const { asset, chains, amount, usd } = group;
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { switchChain } = useChain();
  const multi = chains.length > 1;
  const first = chains[0];

  const openOn = (row) => {
    switchChain(row.chain.id);
    router.push(`/wallet/token/${row.isNative ? "native" : row.address}`);
  };

  return (
    <div className="border-b-[0.5px] border-border last:border-b-0">
      <button
        type="button"
        onClick={() => (multi ? setOpen((v) => !v) : openOn(first))}
        aria-expanded={multi ? open : undefined}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover"
      >
        <TokenLogo logo={asset.logo} address={first.isNative ? undefined : first.address} symbol={asset.symbol} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-text">{asset.symbol}</span>
          <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span className="flex -space-x-1">
              {chains.slice(0, 5).map((r) => (
                <ChainIcon key={r.chain.id} chain={r.chain} size={14} className="ring-2 ring-surface" />
              ))}
            </span>
            {multi ? `${chains.length} networks` : first.chain.shortName}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-sm font-bold tabular-nums text-text">
            {formatBalance(String(amount))} {asset.symbol}
          </span>
          <span className="block text-xs tabular-nums text-text-secondary">{usd !== null ? formatUsd(usd) : "—"}</span>
        </span>
        {multi ? (
          <IoChevronDown size={15} className={`shrink-0 text-text-tertiary transition-transform ${open ? "rotate-180" : ""}`} />
        ) : (
          <IoChevronForward size={15} className="shrink-0 text-text-tertiary" />
        )}
      </button>
      {multi && open && (
        <ul className="bg-background/40 pb-1">
          {chains.map((r) => (
            <li key={r.chain.id}>
              <button type="button" onClick={() => openOn(r)} className="flex w-full items-center gap-3 py-2 pl-[68px] pr-4 text-left hover:bg-hover">
                <ChainIcon chain={r.chain} size={18} />
                <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                  {r.chain.name}
                  {r.isNative ? <span className="ml-1.5 text-[10px] font-bold text-text-tertiary">GAS</span> : null}
                </span>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums text-text">{formatBalance(String(r.amount))}</span>
                  <span className="block text-[11px] tabular-nums text-text-tertiary">{r.usd !== null ? formatUsd(r.usd) : "—"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
