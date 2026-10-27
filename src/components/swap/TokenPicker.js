"use client";
// components/swap/TokenPicker.js — AssetPickerModal: search the curated list
// (or paste any contract address); tokens you hold float to the top.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress } from "ethers";
import { IoSearchOutline, IoClose } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import TokenLogo from "@/components/wallet/TokenLogo";
import { useDebounced } from "@/hooks/useDebounced";
import { readTokenMetadata } from "@/lib/chain/rpc";
import { formatBalance } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";
import { CHAIN_LIST } from "@/lib/config";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";

/**
 * props: open, onClose, chain, tokens (swap list, each with chainId), balances
 *        { "chainId:addr": formatted }, exclude (token to hide), onPick(token),
 *        title, showChain (badge each row with its network — cross-chain lists),
 *        usd { "chainId:addr": price } to show values
 */
const keyOf = (t) => `${t.chainId}:${t.address.toLowerCase()}`;

export default function TokenPicker({ open, onClose, chain, tokens, balances = {}, usd = {}, exclude, onPick, title = "Select token", showChain = false }) {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 150);
  const lower = query.toLowerCase();

  const list = useMemo(() => {
    const rows = (tokens || []).filter((t) => !exclude || keyOf(t) !== keyOf(exclude));
    const match = lower
      ? rows.filter((t) => t.symbol.toLowerCase().includes(lower) || t.name.toLowerCase().includes(lower) || t.address.toLowerCase() === lower)
      : rows;
    const bal = (t) => parseFloat(balances[keyOf(t)] ?? "0");
    const val = (t) => bal(t) * (usd[keyOf(t)] ?? 0);
    return [...match].sort((a, b) => val(b) - val(a) || bal(b) - bal(a) || Number(b.isNative) - Number(a.isNative));
  }, [tokens, lower, exclude, balances, usd]);

  // Pasted address that isn't in the list → read it from the chain.
  const custom = useQuery({
    queryKey: ["public", "tokenMeta", chain.id, lower],
    queryFn: () => readTokenMetadata(chain, query),
    enabled: open && isAddress(query) && list.length === 0,
    staleTime: Infinity,
    retry: false,
  });

  const pick = (t) => {
    setQ("");
    onPick(t);
    onClose();
  };

  if (!open) return null;
  return (
    <Modal open onClose={onClose} labelledBy="picker-title">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="picker-title" className="text-lg font-bold text-text">
          {title}
        </h2>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-text-secondary hover:bg-hover">
          <IoClose size={20} />
        </button>
      </div>
      <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:border-primary">
        <IoSearchOutline size={17} className="text-text-tertiary" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, symbol or paste address"
          className="min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary"
          spellCheck={false}
        />
      </label>
      <div className="-mx-2 max-h-[55dvh] overflow-y-auto">
        {list.map((t) => {
          const bal = balances[keyOf(t)];
          const net = showChain ? CHAIN_LIST.find((c) => c.id === t.chainId) : null;
          return (
            <button key={keyOf(t)} type="button" onClick={() => pick(t)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-hover">
              <span className="relative shrink-0">
                <TokenLogo logo={t.logo} address={t.isNative ? undefined : t.address} symbol={t.symbol} size={36} />
                {net && <ChainIcon chain={net} size={16} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-text">{t.symbol}</span>
                <span className="block truncate text-xs text-text-secondary">{net ? `on ${net.name}` : t.name}</span>
              </span>
              {bal && parseFloat(bal) > 0 && <span className="text-sm font-semibold tabular-nums text-text">{formatBalance(bal)}</span>}
            </button>
          );
        })}
        {list.length === 0 &&
          (custom.isFetching ? (
            <div className="flex justify-center py-8">
              <Spinner size={22} />
            </div>
          ) : custom.data ? (
            <button type="button" onClick={() => pick({ ...custom.data, chainId: chain.id, isNative: false, logo: null })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-hover">
              <TokenLogo address={custom.data.address} symbol={custom.data.symbol} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-text">{custom.data.symbol}</span>
                <span className="block truncate text-xs text-text-secondary">
                  {custom.data.name} · {formatAddress(custom.data.address, 4)} · not on the curated list
                </span>
              </span>
            </button>
          ) : (
            <p className="py-8 text-center text-sm text-text-secondary">{isAddress(query) ? "No ERC-20 token at that address." : "No tokens found."}</p>
          ))}
      </div>
    </Modal>
  );
}
