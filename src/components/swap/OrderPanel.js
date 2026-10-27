"use client";
// components/swap/OrderPanel.js — the order ticket. Buy spends the "with"
// token for the market token; Sell does the reverse. One amount field, % of
// balance chips, a live router estimate (0x or LI.FI), and the details a trader checks
// (rate, impact, minimum, fees, route) folded under one row.
import { useState } from "react";
import { formatUnits, parseUnits } from "ethers";
import { IoChevronDown, IoSettingsOutline, IoInformationCircleOutline, IoAlertCircle, IoSwapVertical, IoGitNetworkOutline } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import TokenLogo from "@/components/wallet/TokenLogo";
import { useWallet } from "@/contexts/WalletContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSignInGate } from "@/hooks/useSignInGate";
import { useSwapPrice } from "@/hooks/swap";
import { useDebounced } from "@/hooks/useDebounced";
import { cleanAmount, formatBalance, formatUsd } from "@/lib/format";
import { getSwapQuote } from "@/lib/swap/api";
import { describeRoute, swapAction } from "@/lib/swap/actions";
import { tokenKey } from "@/lib/swap/sources";
import { getChainById } from "@/lib/config";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";

const SLIPPAGES = [0.005, 0.01, 0.02, 0.03];

function safeParse(v, decimals) {
  try {
    return v && Number(v) > 0 ? parseUnits(v, decimals) : 0n;
  } catch {
    return 0n;
  }
}

function TokenButton({ token, onClick, label, showChain }) {
  const net = showChain ? getChainById(token.chainId) : null;
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 hover:border-primary/50">
      <span className="relative">
        <TokenLogo logo={token.logo} address={token.isNative ? undefined : token.address} symbol={token.symbol} size={24} />
        {net && <ChainIcon chain={net} size={12} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-card" />}
      </span>
      <span className="text-sm font-bold text-text">{token.symbol}</span>
      <IoChevronDown size={13} className="text-text-tertiary" />
    </button>
  );
}

/**
 * props: chain, base (market token), counter (the "with" token), side, onSide,
 *        onPickCounter(), onPickBase(), balances { addr: formatted }, raw { addr: bigint },
 *        usd { addr: price }, run (action sheet), onTraded()
 */
export default function OrderPanel({ chain, base, counter, side, onSide, onPickCounter, onPickBase, balances, raw, usd, run, isAuto, onCrossChain }) {
  const { address } = useWallet();
  const { user } = useAuth();
  const { signIn } = useSignInGate();
  const { showAlert } = useFeedback();
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState(0.01);
  const [showSettings, setShowSettings] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const isBuy = side === "buy";
  const sell = isBuy ? counter : base;
  const buy = isBuy ? base : counter;
  const key = tokenKey;
  const sellChain = getChainById(sell.chainId) ?? chain;
  const buyChain = getChainById(buy.chainId) ?? chain;
  const crossChain = sellChain.id !== buyChain.id;
  const sellRaw = safeParse(amount, sell.decimals);
  const debounced = useDebounced(sellRaw, 400);
  const balance = raw[key(sell)] ?? 0n;
  const insufficient = sellRaw > balance;

  const price = useSwapPrice({ chainId: chain.id, sell, buy, amount: debounced, taker: address, slippage });
  const p = sellRaw > 0n ? price.data : null;
  const stale = debounced !== sellRaw || price.isFetching;
  const out = p?.buyAmount ? Number(formatUnits(BigInt(p.buyAmount), buy.decimals)) : null;
  const inNum = Number(amount || 0);
  const rate = out && inNum ? out / inNum : null;

  // Neither router reports impact consistently; compare value out vs value in
  // at market prices (so it includes fees).
  const inUsd = usd[key(sell)] ? inNum * usd[key(sell)] : null;
  const outUsd = out !== null && usd[key(buy)] ? out * usd[key(buy)] : null;
  const impact = inUsd && outUsd ? ((inUsd - outUsd) / inUsd) * 100 : null;
  const { path, sources } = describeRoute(p);

  const err = sellRaw > 0n ? price.error : null;
  const restricted = err?.code === "RESTRICTED";
  const noLiquidity = err?.code === "NO_LIQUIDITY" || p?.liquidityAvailable === false;

  // "Max" of the gas token (or Arc's USDC, which is the gas token) keeps a
  // per-chain reserve back for fees (lib/chains.js gasReserve).
  const gasReserve = sell.isNative || sell.standsForNative ? safeParse(sellChain.gasReserve ?? "0", sell.decimals) : 0n;
  const setPct = (pct) => {
    let v = (balance * BigInt(pct)) / 100n;
    if (pct === 100 && gasReserve) v = v > gasReserve ? v - gasReserve : 0n;
    setAmount(v > 0n ? formatUnits(v, sell.decimals) : "");
  };

  const cta = !user
    ? { label: "Sign in to trade", disabled: false, signIn: true }
    : !address
    ? { label: "Set up your wallet to trade", disabled: true }
    : restricted
      ? { label: "Not tradable here", disabled: true }
      : !sellRaw
        ? { label: "Enter an amount", disabled: true }
        : insufficient
          ? { label: `Insufficient ${sell.symbol}`, disabled: true }
          : noLiquidity
            ? { label: "No liquidity", disabled: true }
            : { label: isBuy ? `Buy ${base.symbol}` : `Sell ${base.symbol}`, disabled: !p || !!err };

  const submit = async () => {
    if (cta.signIn) return signIn();
    setPreparing(true);
    try {
      const quote = await getSwapQuote({ chainId: chain.id, sell, buy, sellAmount: sellRaw, taker: address, slippage });
      if (!quote?.transaction) throw new Error("The quote didn't include a transaction. Try again.");
      run(await swapAction(sellChain, quote, sell, buy, address, { side, toChain: buyChain }), (results) => {
        setAmount("");
        const hash = results.at(-1)?.hash;
        if (quote.crossChain && hash) {
          onCrossChain?.({
            txHash: hash,
            fromChain: sellChain.id,
            toChain: buyChain.id,
            etaSec: quote.etaSec,
            label: `${isBuy ? "Buying" : "Selling"} ${base.symbol} · ${formatBalance(formatUnits(sellRaw, sell.decimals))} ${sell.symbol}`,
          });
        }
      });
    } catch (e) {
      showAlert(e.code === "RESTRICTED" ? "Not tradable" : "Couldn't get a quote", e.message);
    } finally {
      setPreparing(false);
    }
  };

  const upCls = "bg-up text-white";
  const downCls = "bg-down text-white";

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      {/* Buy / Sell */}
      <div role="tablist" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-background p-1">
        {["buy", "sell"].map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={side === s}
            onClick={() => {
              onSide(s);
              setAmount("");
            }}
            className={`h-10 rounded-lg text-sm font-extrabold capitalize transition-colors ${side === s ? (s === "buy" ? upCls : downCls) : "text-text-secondary hover:text-text"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Amount in */}
      <div className="rounded-xl border border-border bg-background p-3 focus-within:border-primary">
        <div className="mb-1 flex items-center justify-between text-xs text-text-tertiary">
          <span>{isBuy ? "Spend" : "Sell"}</span>
          <span>
            Balance: <span className="font-semibold text-text-secondary">{formatBalance(balances[key(sell)] ?? "0")}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(cleanAmount(e.target.value))}
            aria-label={`Amount of ${sell.symbol}`}
            className={`min-w-0 flex-1 bg-transparent text-2xl font-bold tabular-nums outline-none placeholder:text-text-tertiary ${insufficient ? "text-down" : "text-text"}`}
          />
          <TokenButton token={sell} showChain={crossChain} onClick={isBuy ? onPickCounter : onPickBase} label={`Change ${isBuy ? "payment" : "market"} token`} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-text-tertiary">{inUsd ? `≈ ${formatUsd(inUsd)}` : " "}</span>
          <div className="flex gap-1">
            {[25, 50, 75, 100].map((pct) => (
              <button key={pct} type="button" onClick={() => setPct(pct)} disabled={!balance} className="rounded-md bg-hover px-2 py-0.5 text-[11px] font-bold text-text-secondary hover:text-text disabled:opacity-40">
                {pct === 100 ? "MAX" : `${pct}%`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-10 -my-2.5 flex justify-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-tertiary">
          <IoSwapVertical size={15} />
        </span>
      </div>

      {/* Amount out */}
      <div className="rounded-xl border border-border bg-background p-3">
        <div className="mb-1 flex items-center justify-between text-xs text-text-tertiary">
          <span>{isBuy ? "Receive" : "Get"}</span>
          <span>
            Balance: <span className="font-semibold text-text-secondary">{formatBalance(balances[key(buy)] ?? "0")}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-2xl font-bold tabular-nums ${out !== null ? "text-text" : "text-text-tertiary"} ${stale && out !== null ? "opacity-60" : ""}`}>
            {out !== null ? formatBalance(String(out)) : "0.0"}
          </span>
          <TokenButton token={buy} showChain={crossChain} onClick={isBuy ? onPickBase : onPickCounter} label={`Change ${isBuy ? "market" : "receive"} token`} />
        </div>
        <span className="mt-2 block text-xs text-text-tertiary">{outUsd ? `≈ ${formatUsd(outUsd)}` : " "}</span>
      </div>

      {/* Where the money comes from / goes to */}
      {(crossChain || (isAuto && isBuy)) && (
        <button type="button" onClick={onPickCounter} className="mt-3 flex w-full items-center gap-2 rounded-xl bg-background px-3 py-2 text-left text-xs text-text-secondary hover:text-text">
          <IoGitNetworkOutline size={15} className="shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            {isBuy ? "Paying with" : "Receiving"} <span className="font-bold text-text">{counter.symbol}</span> on{" "}
            <span className="font-bold text-text">{getChainById(counter.chainId)?.name}</span>
            {isAuto && isBuy ? " · picked for you" : ""}
            {crossChain && p?.etaSec ? ` · arrives on ${buyChain.shortName} in ~${Math.max(1, Math.round(p.etaSec / 60))} min` : crossChain ? " · bridged automatically" : ""}
          </span>
          <span className="font-semibold text-primary">Change</span>
        </button>
      )}

      {/* Status line */}
      <div className="mt-3 min-h-[20px] text-xs">
        {restricted ? (
          <p className="flex gap-1.5 text-neutral">
            <IoAlertCircle size={15} className="mt-px shrink-0" />
            {(err.side === "buy" ? buy : sell).symbol} can&apos;t be traded through our swap provider — it&apos;s restricted for legal reasons. Charts still work.
          </p>
        ) : noLiquidity ? (
          <p className="flex gap-1.5 text-neutral">
            <IoAlertCircle size={15} className="mt-px shrink-0" /> No route has enough liquidity for this pair and size.
          </p>
        ) : err ? (
          <p className="text-down">{err.message}</p>
        ) : p && rate ? (
          <button type="button" onClick={() => setShowDetails((v) => !v)} className="flex w-full items-center justify-between text-text-secondary hover:text-text">
            <span className="flex items-center gap-1.5">
              {stale && <Spinner size={12} />}1 {sell.symbol} = {formatBalance(String(rate))} {buy.symbol}
            </span>
            <span className="flex items-center gap-1">
              {impact !== null && <span className={impact > 3 ? "font-bold text-down" : impact > 1 ? "text-neutral" : ""}>{impact.toFixed(2)}%</span>}
              <IoChevronDown size={13} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
            </span>
          </button>
        ) : sellRaw > 0n && price.isFetching ? (
          <span className="flex items-center gap-1.5 text-text-tertiary">
            <Spinner size={12} /> Finding the best price…
          </span>
        ) : null}
      </div>

      {showDetails && p && !err && (
        <dl className="mt-2 space-y-1.5 rounded-xl bg-background p-3 text-xs">
          {[
            ["Minimum received", `${formatBalance(formatUnits(BigInt(p.minBuyAmount), buy.decimals))} ${buy.symbol}`],
            ["Price impact (incl. fees)", impact !== null ? `${impact.toFixed(2)}%` : "—"],
            p.router === "lifi"
              ? ["Fees", p.feesUsd ? `≈ ${formatUsd(p.feesUsd)}` : "None"]
              : ["Sysfi fee", p.fees?.integratorFee?.amount ? `${formatBalance(formatUnits(BigInt(p.fees.integratorFee.amount), buy.decimals))} ${buy.symbol} (0.3%)` : "—"],
            ["Network fee", p.totalNetworkFee ? `≈ ${formatBalance(formatUnits(BigInt(p.totalNetworkFee), chain.decimals))} ${chain.symbol}` : "—"],
            ["Max slippage", `${(slippage * 100).toFixed(1)}%`],
            ["Route", path ? `${path}${sources.length ? ` via ${sources.join(", ")}` : ""}` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <dt className="shrink-0 text-text-tertiary">{k}</dt>
              <dd className="text-right font-semibold text-text">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Slippage */}
      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => setShowSettings((v) => !v)} className="flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text">
          <IoSettingsOutline size={14} /> Slippage {(slippage * 100).toFixed(1)}%
        </button>
        <span className="flex items-center gap-1 text-[11px] text-text-tertiary">
          <IoInformationCircleOutline size={13} /> {crossChain ? `Bridged by ${p?.tool ?? "LI.FI"}` : `Best price across ${chain.shortName} DEXs`}
        </span>
      </div>
      {showSettings && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {SLIPPAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSlippage(s)}
              className={`h-8 rounded-lg text-xs font-bold ${slippage === s ? "bg-primary text-on-primary" : "bg-background text-text-secondary hover:text-text"}`}
            >
              {(s * 100).toFixed(1)}%
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={cta.disabled || preparing}
        onClick={submit}
        className={`mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-extrabold transition-opacity disabled:cursor-not-allowed disabled:bg-hover disabled:text-text-tertiary ${isBuy ? upCls : downCls} hover:opacity-90`}
      >
        {preparing ? <Spinner size={18} /> : null}
        {preparing ? "Getting firm quote…" : cta.label}
      </button>
    </div>
  );
}
