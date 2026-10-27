"use client";
// Manage Tokens — port of TokenImportScreen: "Token List" tab toggles tokens
// from the active chain's curated list; "Custom" tab imports any ERC-20 by
// contract address (metadata read on-chain). Web adds a "Hidden" tab.
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isAddress } from "ethers";
import { IoSearchOutline, IoCheckmarkCircle, IoAddCircleOutline, IoListOutline, IoCodeSlashOutline, IoEyeOffOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import TokenLogo from "@/components/wallet/TokenLogo";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { usePortfolio } from "@/hooks/wallet";
import { readTokenMetadata } from "@/lib/chain/rpc";
import { explorerToken } from "@/lib/config";

const TABS = [
  { id: "list", label: "Token List" },
  { id: "custom", label: "Custom" },
  { id: "hidden", label: "Hidden" },
];

function Toggle({ on, onToggle, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-border"}`}
    >
      <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-background transition-all ${on ? "left-[23px]" : "left-[3px]"}`} />
    </button>
  );
}

function ListTab({ portfolio }) {
  const { tokenList, tokens, addToken, removeToken } = portfolio;
  const [q, setQ] = useState("");
  const shown = useMemo(() => new Set(tokens.map((t) => t.address.toLowerCase())), [tokens]);
  const held = useMemo(() => new Set(tokens.filter((t) => t.held).map((t) => t.address.toLowerCase())), [tokens]);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? tokenList.filter((t) => t.symbol.toLowerCase().includes(s) || t.name.toLowerCase().includes(s) || t.address.toLowerCase() === s)
      : tokenList;
  }, [tokenList, q]);

  return (
    <>
      <div className="px-4 py-3">
        <label className="flex h-11 items-center gap-2 rounded-full border border-border px-4 text-text-tertiary focus-within:border-primary">
          <IoSearchOutline size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, symbol or address"
            aria-label="Search tokens"
            className="min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-tertiary"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-text-secondary">No tokens match “{q}”.</p>
      ) : (
        <ul>
          {filtered.map((t) => {
            const addr = t.address.toLowerCase();
            const on = shown.has(addr);
            return (
              <li key={addr} className="flex items-center gap-3 border-b-[0.5px] border-divider px-4 py-3">
                <TokenLogo logo={t.logoURI} address={t.address} symbol={t.symbol} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block text-md font-bold text-text">{t.symbol}</span>
                  <span className="block truncate text-xs text-text-tertiary">{t.name}</span>
                </span>
                {held.has(addr) ? (
                  <span className="text-xs font-semibold text-text-tertiary">In wallet</span>
                ) : (
                  <Toggle
                    on={on}
                    label={`Show ${t.symbol}`}
                    onToggle={() => (on ? removeToken(t.address) : addToken({ address: t.address, name: t.name, symbol: t.symbol, decimals: t.decimals, logo: t.logoURI || null }))}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function CustomTab({ portfolio }) {
  const { chain, addToken, tokens } = portfolio;
  const [address, setAddress] = useState("");
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  const lookup = async (e) => {
    e.preventDefault();
    setMeta(null);
    setAdded(false);
    if (!isAddress(address.trim())) return setError("Enter a valid contract address");
    setError("");
    setBusy(true);
    try {
      setMeta(await readTokenMetadata(chain, address.trim()));
    } catch {
      setError(`No ERC-20 token found at this address on ${chain.name}.`);
    } finally {
      setBusy(false);
    }
  };

  const already = meta && tokens.some((t) => t.address.toLowerCase() === meta.address.toLowerCase());

  return (
    <form onSubmit={lookup} className="p-4" noValidate>
      <Input
        label="Token contract address"
        placeholder="0x…"
        value={address}
        onChange={(e) => {
          setAddress(e.target.value);
          setError("");
          setMeta(null);
        }}
        error={error}
        inputClassName="font-mono text-sm"
        leftIcon={<IoCodeSlashOutline size={20} />}
      />
      {!meta && <Button type="submit" title="Look up token" fullWidth loading={busy} />}
      {meta && (
        <div className="rounded-lg bg-surface p-4">
          <div className="mb-4 flex items-center gap-3">
            <TokenLogo address={meta.address} symbol={meta.symbol} size={44} />
            <div className="min-w-0">
              <p className="text-md font-bold text-text">{meta.symbol}</p>
              <p className="truncate text-sm text-text-secondary">{meta.name}</p>
            </div>
          </div>
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-text-tertiary">Decimals</dt>
            <dd className="text-text">{meta.decimals}</dd>
            <dt className="text-text-tertiary">Contract</dt>
            <dd className="truncate font-mono text-text">
              <a href={explorerToken(chain, meta.address)} target="_blank" rel="noreferrer" className="hover:text-primary">
                {meta.address}
              </a>
            </dd>
          </dl>
          <p className="mb-4 text-xs text-text-tertiary">
            Anyone can create a token with any name. Only add tokens you trust.
          </p>
          {added || already ? (
            <p className="flex items-center justify-center gap-1.5 py-2 text-sm font-bold text-primary">
              <IoCheckmarkCircle size={18} /> Added to your assets
            </p>
          ) : (
            <Button
              title="Add Token"
              icon={<IoAddCircleOutline size={18} />}
              fullWidth
              onClick={() => {
                addToken({ ...meta, logo: null });
                setAdded(true);
              }}
            />
          )}
        </div>
      )}
    </form>
  );
}

function HiddenTab({ portfolio }) {
  const { prefs, unhideToken, tokenList } = portfolio;
  const byAddr = Object.fromEntries(tokenList.map((t) => [t.address.toLowerCase(), t]));
  if (!prefs.hidden.length) {
    return <p className="px-4 py-10 text-center text-sm text-text-secondary">You haven&apos;t hidden any tokens.</p>;
  }
  return (
    <ul>
      {prefs.hidden.map((addr) => (
        <li key={addr} className="flex items-center gap-3 border-b-[0.5px] border-divider px-4 py-3">
          <IoEyeOffOutline size={20} className="text-text-tertiary" />
          <span className="min-w-0 flex-1">
            <span className="block text-md font-bold text-text">{byAddr[addr]?.symbol || "Token"}</span>
            <span className="block truncate font-mono text-xs text-text-tertiary">{addr}</span>
          </span>
          <button type="button" onClick={() => unhideToken(addr)} className="text-sm font-bold text-primary">
            Unhide
          </button>
        </li>
      ))}
    </ul>
  );
}

function ManageTokens() {
  const params = useSearchParams();
  const [tab, setTab] = useState(TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "list");
  const portfolio = usePortfolio();

  return (
    <>
      <PageHeader title="Manage Tokens" backHref="/wallet/assets" tabs={TABS} activeTab={tab} onTabChange={setTab} />
      {portfolio.tokenList.length === 0 && tab === "list" ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : tab === "list" ? (
        <ListTab portfolio={portfolio} />
      ) : tab === "custom" ? (
        <CustomTab portfolio={portfolio} />
      ) : (
        <HiddenTab portfolio={portfolio} />
      )}
      <p className="flex items-center justify-center gap-1 px-4 py-6 text-xs text-text-tertiary">
        <IoListOutline size={14} /> List: tokens Sysfi supports on this network
      </p>
    </>
  );
}

export default function ManageTokensPage() {
  return (
    <Suspense>
      <ManageTokens />
    </Suspense>
  );
}
