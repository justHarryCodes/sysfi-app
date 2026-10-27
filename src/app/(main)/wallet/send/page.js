"use client";
// Send — port of SendScreen. Stage 1 picks the asset; stage 2 takes the
// recipient (address / ENS / QR / your accounts / recents) and amount, with a
// live fee estimate; Review opens TxFlow, which asks for the password and
// signs. Query params ?token=&to=&amount= pre-fill it (payment links + the
// app's wallet/send/:token deep link, see send/[token]/page.js).
import { Suspense, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { formatUnits, isAddress, parseUnits } from "ethers";
import {
  IoSearchOutline,
  IoScanOutline,
  IoClipboardOutline,
  IoCheckmarkCircle,
  IoAlertCircleOutline,
  IoChevronDown,
  IoPersonCircleOutline,
  IoTimeOutline,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import TokenLogo from "@/components/wallet/TokenLogo";
import TxFlow from "@/components/wallet/TxFlow";
import QRScanner, { isQRScanSupported } from "@/components/wallet/QRScanner";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useWallet } from "@/contexts/WalletContext";
import { useActivity, usePortfolio } from "@/hooks/wallet";
import { getEnsProvider } from "@/lib/chain/rpc";
import { buildTransfer, estimateTx } from "@/lib/chain/tx";
import { isNativeAddress } from "@/lib/config";
import { cleanAmount, formatBalance, formatUsd } from "@/lib/format";
import { useDebounced } from "@/hooks/useDebounced";
import { formatAddress } from "@/lib/wallet";

const isEns = (s) => /\.(eth|xyz|com|org|io|app)$/i.test(s.trim());

function TokenPicker({ assets, onPick }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? assets.filter((a) => a.symbol.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)) : assets;
  }, [assets, q]);

  return (
    <div className="p-4">
      <p className="mb-3 text-lg font-extrabold text-text">What do you want to send?</p>
      <label className="mb-3 flex h-11 items-center gap-2 rounded-full border border-border px-4 text-text-tertiary focus-within:border-primary">
        <IoSearchOutline size={18} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search assets"
          aria-label="Search assets"
          className="min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-tertiary"
        />
      </label>
      <ul className="overflow-hidden rounded-xl border-[0.5px] border-border bg-surface">
        {list.map((a) => (
          <li key={a.address} className="border-b-[0.5px] border-border/50 last:border-0">
            <button type="button" onClick={() => onPick(a)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-card">
              <TokenLogo logo={a.logo} address={a.address} symbol={a.symbol} size={40} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-bold text-text">
                  {a.isNative ? a.name : a.symbol}
                  {!a.isNative && !a.verified && !a.added && <span className="text-[10px] font-semibold text-warning">Unverified</span>}
                </span>
                <span className="block truncate text-xs text-text-tertiary">{a.isNative ? a.symbol : a.name}</span>
              </span>
              <span className="text-sm font-bold tabular-nums text-text">{formatBalance(a.balance)}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="px-4 py-8 text-center text-sm text-text-secondary">Nothing to send yet.</li>}
      </ul>
    </div>
  );
}

function SendForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { address: me, accounts } = useWallet();
  const { chain, nativeAsset, tokens, isLoading } = usePortfolio();
  const activity = useActivity();

  const assets = useMemo(() => [nativeAsset, ...tokens.filter((t) => t.raw !== "0")], [nativeAsset, tokens]);

  // `picked` is undefined until the user chooses; until then ?token= decides
  // (native: "native" or the 0xEeee sentinel).
  const [picked, setPicked] = useState(undefined);
  const [recipient, setRecipient] = useState(params.get("to") || "");
  const [amount, setAmount] = useState(params.get("amount") ? cleanAmount(params.get("amount")) : "");
  const [errors, setErrors] = useState({});
  const [scanOpen, setScanOpen] = useState(false);
  const [review, setReview] = useState(false);
  // Only rendered client-side (FlowGate shows the splash on the server).
  const [canScan] = useState(() => typeof window !== "undefined" && isQRScanSupported());

  const paramToken = useMemo(() => {
    const want = params.get("token");
    if (!want) return null;
    return isNativeAddress(want) ? nativeAsset : assets.find((a) => a.address.toLowerCase() === want.toLowerCase()) || null;
  }, [params, assets, nativeAsset]);
  const token = picked === undefined ? paramToken : picked;

  // Keep the selected token's balance fresh as the portfolio refetches.
  const selected = useMemo(
    () => (token ? assets.find((a) => a.address === token.address) || { ...token, balance: "0" } : null),
    [token, assets],
  );

  // ENS resolution (debounced, cached).
  const ensName = useDebounced(recipient.trim(), 600);
  const ensQuery = useQuery({
    queryKey: ["ens", ensName.toLowerCase()],
    queryFn: async () => (await getEnsProvider().resolveName(ensName)) || null,
    enabled: isEns(ensName),
    staleTime: 10 * 60_000,
    retry: false,
  });
  const ens =
    isEns(recipient.trim()) && ensName === recipient.trim() && !ensQuery.isPending
      ? ensQuery.data
        ? { name: ensName, address: ensQuery.data }
        : { failed: true }
      : null;

  const to = ens?.address || (isAddress(recipient.trim()) ? recipient.trim() : null);

  let amountWei = null;
  try {
    if (selected && amount && Number(amount) > 0) amountWei = parseUnits(amount, selected.decimals);
  } catch {}

  const request = selected && to && amountWei ? buildTransfer({ from: me, to, amount, token: selected }) : null;

  // Fee estimate (debounced while typing, cached briefly).
  const estimateInput = useDebounced(request ? `${chain.id}|${selected.address}|${to}|${amount}` : null, 500);
  const estimateQuery = useQuery({
    queryKey: ["estimate", estimateInput],
    queryFn: () => estimateTx(chain, request),
    enabled: !!request && estimateInput === `${chain.id}|${selected?.address}|${to}|${amount}`,
    staleTime: 15_000,
    retry: false,
  });
  const estimate = request ? estimateQuery.data : null;
  const estimating = !!request && (estimateQuery.isFetching || estimateInput !== `${chain.id}|${selected?.address}|${to}|${amount}`);
  const estimateError = estimateQuery.isError ? "Can't estimate the fee — check the amount and your ETH balance." : null;

  const nativeWei = parseUnits(nativeAsset.balance || "0", chain.decimals);
  const balanceWei = selected ? parseUnits(selected.balance || "0", selected.decimals) : 0n;

  const setMax = async () => {
    if (!selected) return;
    if (!selected.isNative) return setAmount(selected.balance);
    // Reserve the worst-case fee for a native send.
    try {
      const probe = buildTransfer({ from: me, to: to || me, amount: "0", token: selected });
      const est = await estimateTx(chain, probe);
      const max = balanceWei > est.fee ? balanceWei - est.fee : 0n;
      setAmount(formatUnits(max, selected.decimals));
    } catch {
      setAmount(selected.balance);
    }
  };

  const openReview = () => {
    const errs = {};
    if (!to) errs.recipient = ens?.failed ? "Couldn't resolve that ENS name" : "Enter a valid address or ENS name";
    if (!amountWei) errs.amount = "Enter an amount";
    else if (amountWei > balanceWei) errs.amount = "Insufficient balance";
    else if (estimate) {
      const needNative = estimate.fee + (selected.isNative ? amountWei : 0n);
      if (needNative > nativeWei) errs.amount = selected.isNative ? "Not enough left for the network fee" : `You need some ${chain.symbol} to pay the network fee`;
    }
    setErrors(errs);
    if (!Object.keys(errs).length && estimate) setReview(true);
  };

  const onScan = useCallback((res) => {
    setScanOpen(false);
    setRecipient(res.to);
    if (res.amount) setAmount(cleanAmount(res.amount));
  }, []);

  const recents = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const page of activity.data?.pages || []) {
      for (const tx of page.items) {
        if (tx.direction !== "out" || !tx.to) continue;
        const k = tx.to.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        list.push(tx.to);
        if (list.length >= 5) return list;
      }
    }
    return list;
  }, [activity.data]);

  const myOtherAccounts = accounts.filter((a) => a.address.toLowerCase() !== me?.toLowerCase());
  const amountUsd = selected?.price && amount ? formatUsd(Number(amount) * selected.price) : null;
  const feeUsd = estimate && nativeAsset.price ? formatUsd(Number(estimate.feeFormatted) * nativeAsset.price) : null;
  const sendingToSelf = to && me && to.toLowerCase() === me.toLowerCase();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <Spinner size={28} />
        <p className="text-sm text-text-secondary">Loading assets…</p>
      </div>
    );
  }

  if (!selected) return <TokenPicker assets={assets} onPick={setPicked} />;

  return (
    <div className="p-4">
      {/* Asset */}
      <button
        type="button"
        onClick={() => setPicked(null)}
        className="mb-5 flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left hover:bg-card"
      >
        <TokenLogo logo={selected.logo} address={selected.address} symbol={selected.symbol} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-text">{selected.isNative ? selected.name : selected.symbol}</span>
          <span className="block text-xs text-text-tertiary">
            Balance: {formatBalance(selected.balance)} {selected.symbol}
          </span>
        </span>
        <IoChevronDown size={18} className="text-text-tertiary" />
      </button>

      {/* Recipient */}
      <label htmlFor="recipient" className="mb-2 block text-sm font-medium text-text-secondary">
        To
      </label>
      <div className={`flex items-center rounded-md border-2 bg-surface focus-within:border-primary ${errors.recipient ? "border-error" : "border-border"}`}>
        <input
          id="recipient"
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setErrors((p) => ({ ...p, recipient: null }));
          }}
          placeholder="Address (0x…) or ENS name"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-4 py-4 font-mono text-sm text-text outline-none placeholder:font-sans placeholder:text-text-tertiary"
        />
        <button
          type="button"
          aria-label="Paste address"
          onClick={async () => {
            try {
              setRecipient((await navigator.clipboard.readText()).trim());
            } catch {}
          }}
          className="px-2 text-text-secondary hover:text-text"
        >
          <IoClipboardOutline size={20} />
        </button>
        {canScan && (
          <button type="button" aria-label="Scan QR code" onClick={() => setScanOpen(true)} className="pl-2 pr-4 text-text-secondary hover:text-text">
            <IoScanOutline size={20} />
          </button>
        )}
      </div>
      <div className="mb-3 mt-1 min-h-5 text-xs">
        {errors.recipient ? (
          <span className="text-error">{errors.recipient}</span>
        ) : ens?.address ? (
          <span className="flex items-center gap-1 text-primary">
            <IoCheckmarkCircle size={14} /> {formatAddress(ens.address, 6)}
          </span>
        ) : ens?.failed ? (
          <span className="text-error">Couldn&apos;t resolve that ENS name</span>
        ) : sendingToSelf ? (
          <span className="flex items-center gap-1 text-warning">
            <IoAlertCircleOutline size={14} /> This is your own address
          </span>
        ) : null}
      </div>

      {!to && (myOtherAccounts.length > 0 || recents.length > 0) && (
        <div className="mb-5 space-y-1">
          {myOtherAccounts.map((a) => (
            <button key={a.index} type="button" onClick={() => setRecipient(a.address)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface">
              <IoPersonCircleOutline size={20} className="text-primary" />
              <span className="font-semibold text-text">{a.name}</span>
              <span className="ml-auto font-mono text-xs text-text-tertiary">{formatAddress(a.address, 4)}</span>
            </button>
          ))}
          {recents.map((addr) => (
            <button key={addr} type="button" onClick={() => setRecipient(addr)} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-surface">
              <IoTimeOutline size={20} className="text-text-tertiary" />
              <span className="font-mono text-text">{formatAddress(addr, 6)}</span>
              <span className="ml-auto text-xs text-text-tertiary">Recent</span>
            </button>
          ))}
        </div>
      )}

      {/* Amount */}
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="amount" className="text-sm font-medium text-text-secondary">
          Amount
        </label>
        <button type="button" onClick={setMax} className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/25">
          MAX
        </button>
      </div>
      <div className={`rounded-md border-2 bg-surface px-4 py-3 focus-within:border-primary ${errors.amount ? "border-error" : "border-border"}`}>
        <div className="flex items-baseline gap-2">
          <input
            id="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(cleanAmount(e.target.value));
              setErrors((p) => ({ ...p, amount: null }));
            }}
            placeholder="0"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-[32px] font-black tabular-nums text-text outline-none placeholder:text-text-tertiary/60"
          />
          <span className="text-lg font-bold text-text-secondary">{selected.symbol}</span>
        </div>
        {amountUsd && <p className="text-sm text-text-tertiary">≈ {amountUsd}</p>}
      </div>
      <p className="mb-5 mt-1 min-h-5 text-xs text-error">{errors.amount}</p>

      {/* Fee */}
      <div className="mb-6 flex items-center justify-between rounded-lg bg-surface px-4 py-3 text-sm">
        <span className="text-text-secondary">Network fee</span>
        <span className="font-semibold text-text">
          {estimating ? (
            <Spinner size={14} />
          ) : estimate ? (
            <>
              ≈ {Number(estimate.feeFormatted).toPrecision(3)} {chain.symbol}
              {feeUsd && <span className="ml-1 font-normal text-text-tertiary">({feeUsd})</span>}
            </>
          ) : (
            <span className="font-normal text-text-tertiary">{estimateError || "—"}</span>
          )}
        </span>
      </div>

      <Button title="Review" fullWidth disabled={!request || !estimate || estimating} onClick={openReview} />

      {canScan && <QRScanner open={scanOpen} onClose={() => setScanOpen(false)} onResult={onScan} />}

      {review && estimate && request && (
        <TxFlow
          open
          onClose={() => setReview(false)}
          chain={chain}
          prepared={{ request, estimate }}
          hero={{ amount, symbol: selected.symbol, logo: selected.logo, address: selected.address, usd: amountUsd }}
          to={to}
          toLabel={ens?.name}
          feeUsd={feeUsd}
          onSuccess={() => router.push("/wallet")}
        />
      )}
    </div>
  );
}

export default function SendPage() {
  return (
    <>
      <PageHeader title="Send" backHref="/wallet" />
      <Suspense>
        <SendForm />
      </Suspense>
    </>
  );
}
