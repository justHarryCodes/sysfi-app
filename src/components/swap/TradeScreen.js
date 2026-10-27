"use client";
// Trade — the web's SwapNewScreen, laid out like a trading terminal but kept
// to one decision at a time:
//   desktop  watchlist │ market header + chart + pools │ order ticket
//   phone    market header → chart → order ticket → pools
// Market data comes from GeckoTerminal (every Robinhood Chain pool); prices
// and execution from 0x through the backend.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatUnits } from "ethers";
import { IoChevronDown, IoStatsChartOutline, IoTrendingUpOutline, IoBarChartOutline, IoWaterOutline, IoRepeatOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import TokenLogo from "@/components/wallet/TokenLogo";
import MarketChart from "@/components/swap/MarketChart";
import OrderPanel from "@/components/swap/OrderPanel";
import TokenPicker from "@/components/swap/TokenPicker";
import { useActionSheet } from "@/components/wallet/useActionSheet";
import ChainSwitcher from "@/components/wallet/ChainSwitcher";
import { useChain } from "@/contexts/ChainContext";
import { useCandles, useSwapTokens, useTokenMarket, useTokenPrices } from "@/hooks/swap";
import { useAllChainsPortfolio, useAssetRegistry, useNativeBalance, useNativePrices, usePortfolio, useRefreshWallet } from "@/hooks/wallet";
import { NATIVE_TOKEN_ADDRESS, SWAP_CHAINS, getChainById } from "@/lib/config";
import { autoSource, gasToken, holdingsAsTokens, tokenKey } from "@/lib/swap/sources";
import BridgeTracker from "@/components/swap/BridgeTracker";
import { formatBalance, formatCompactUsd, formatPrice } from "@/lib/format";
import { RANGES, marketAddress, marketNetwork, seriesChange } from "@/lib/swap/market";

const lc = (a) => a?.toLowerCase();
const NATIVE = lc(NATIVE_TOKEN_ADDRESS);
/** The gas token, or the ERC-20 that stands in for it (Arc's USDC). */
const isHead = (t) => t.isNative || t.standsForNative;

function Change({ value, className = "" }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={`text-text-tertiary ${className}`}>—</span>;
  const up = value >= 0;
  return (
    <span className={`font-bold tabular-nums ${up ? "text-up" : "text-down"} ${className}`}>
      {up ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function Stat({ Icon, label, value }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[11px] text-text-tertiary">
        <Icon size={12} /> {label}
      </p>
      <p className="truncate text-sm font-bold tabular-nums text-text">{value}</p>
    </div>
  );
}

// ─── Watchlist ───────────────────────────────────────────────────────────────

function Watchlist({ chain, tokens, base, balances, onSelect }) {
  const [tab, setTab] = useState("all");
  const held = tokens.filter((t) => parseFloat(balances[tokenKey(t)] ?? "0") > 0);
  const rows = (tab === "held" ? held : tokens).filter((t) => !isHead(t)).slice(0, 30);
  const prices = useTokenPrices(chain.id, rows.map((t) => marketAddress(chain.id, t)));

  return (
    <aside className="flex min-h-0 flex-col rounded-2xl border border-border bg-surface">
      <div className="flex gap-1 p-2">
        {[
          ["all", "Markets"],
          ["held", `Holding${held.length ? ` · ${held.filter((t) => !isHead(t)).length}` : ""}`],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-8 flex-1 rounded-lg text-xs font-bold ${tab === id ? "bg-hover text-text" : "text-text-tertiary hover:text-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        {rows.length === 0 && <p className="px-3 py-6 text-center text-xs text-text-tertiary">{tab === "held" ? "You don't hold any listed tokens yet." : "No tokens."}</p>}
        {rows.map((t) => {
          const q = prices.data?.[marketAddress(chain.id, t)];
          const active = lc(t.address) === lc(base.address);
          return (
            <button
              key={t.address}
              type="button"
              onClick={() => onSelect(t)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left ${active ? "bg-primary/10" : "hover:bg-hover"}`}
            >
              <TokenLogo logo={t.logo} address={t.address} symbol={t.symbol} size={28} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-bold ${active ? "text-primary" : "text-text"}`}>{t.symbol}</span>
                <span className="block truncate text-[11px] text-text-tertiary">{t.name}</span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-semibold tabular-nums text-text">{q ? formatPrice(q.price) : prices.isPending ? "…" : "—"}</span>
                <Change value={q?.change24h} className="block text-[11px]" />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ─── Pools ─────────────────────────────────────────────────────────────────

function Pools({ market, base, className }) {
  if (!market?.pools?.length) return null;
  return (
    <div className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>
      <h3 className="mb-2 text-sm font-bold text-text">Pools</h3>
      <table className="w-full text-left text-xs">
        <thead className="text-text-tertiary">
          <tr>
            <th className="py-1.5 font-semibold">Pair</th>
            <th className="py-1.5 text-right font-semibold">Liquidity</th>
            <th className="py-1.5 text-right font-semibold">24h vol</th>
            <th className="hidden py-1.5 text-right font-semibold sm:table-cell">Buys / sells</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {market.pools.slice(0, 6).map((p) => (
            <tr key={p.address}>
              <td className="py-2">
                <span className="block font-semibold text-text">
                  {base.symbol} / {p.pairSymbol}
                </span>
                <span className="block text-[11px] text-text-tertiary">{String(p.dex).replace(/\s*\(Robinhood\)/i, "")}</span>
              </td>
              <td className="py-2 text-right tabular-nums text-text">{formatCompactUsd(p.liquidity)}</td>
              <td className="py-2 text-right tabular-nums text-text">{formatCompactUsd(p.volume24h)}</td>
              <td className="hidden py-2 text-right tabular-nums sm:table-cell">
                <span className="text-up">{p.buys24h}</span> <span className="text-text-tertiary">/</span> <span className="text-down">{p.sells24h}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

/** Remount per chain so pair, ticket and chart state never leak across chains. */
export default function TradePage() {
  const { activeChain } = useChain();
  if (!activeChain.swap) {
    return (
      <>
        <PageHeader title="Trade" subtitle={activeChain.name} />
        <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
          <p className="text-sm text-text-secondary">Trading isn&apos;t available on {activeChain.name}.</p>
          <ChainSwitcher only={(c) => !!c.swap} />
        </div>
      </>
    );
  }
  return <TradeScreen key={activeChain.id} />;
}

function TradeScreen() {
  const { activeChain: chain } = useChain();
  const router = useRouter();
  const search = useSearchParams();
  const tokens = useSwapTokens(chain.id);
  const portfolio = usePortfolio();
  const native = useNativeBalance();
  const nativePrices = useNativePrices();
  const { sheet, run } = useActionSheet(chain);

  const [counterSel, setCounterSel] = useState(null); // explicit "with" token, or null = automatic
  const [picker, setPicker] = useState(null); // "base" | "counter"
  const [range, setRange] = useState("1D");
  const [mode, setMode] = useState("candles");
  const [hover, setHover] = useState(null);
  const [bridges, setBridges] = useState([]); // cross-chain trades in flight
  const side = search.get("side") === "sell" ? "sell" : "buy";
  const everywhere = useAllChainsPortfolio();
  const refreshWallet = useRefreshWallet();
  const reg = useAssetRegistry();

  const list = tokens.data || [];
  const [extra, setExtra] = useState([]); // custom tokens picked by address
  const all = [...list, ...extra.filter((e) => !list.some((t) => lc(t.address) === lc(e.address)))];
  const find = (a) => all.find((t) => lc(t.address) === lc(a));

  // Default market: the URL's token, else the chain's default (lib/chains.js
  // swap.market), else the first ERC-20.
  const head = all[0];
  const base = find(search.get("token")) ?? all.find((t) => t.symbol === chain.swap.market) ?? all.find((t) => !isHead(t));

  // Chain abstraction: what you hold on every network can pay (buy) or be
  // paid into (sell). Auto picks the best source; the user can override.
  const sources = holdingsAsTokens(everywhere.assets);
  const auto = base ? (side === "buy" ? autoSource(sources, base) : head) : null;
  const counter = counterSel && base && tokenKey(counterSel) !== tokenKey(base) ? counterSel : auto;
  const isAuto = !counterSel;

  const setParams = (next) => {
    const sp = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(next)) sp.set(k, v);
    router.replace(`/swap?${sp.toString()}`, { scroll: false });
  };
  const selectBase = (t) => {
    if (!list.some((x) => lc(x.address) === lc(t.address))) setExtra((e) => [...e, t]);
    setHover(null);
    setParams({ token: t.address });
  };

  // Balances keyed "chainId:address": this chain from the wallet portfolio
  // (includes unlisted/added tokens), every other chain from the
  // all-networks portfolio.
  const nativeWei = native.data?.wei;
  const wei = nativeWei ? BigInt(nativeWei) : 0n;
  const balances = {};
  const raw = {};
  const k = (addr) => `${chain.id}:${lc(addr)}`;
  balances[k(NATIVE)] = portfolio.nativeAsset.balance;
  raw[k(NATIVE)] = wei;
  const standIn = chain.swap.nativeAs;
  if (standIn) {
    // Arc: the USDC ERC-20 reads the same balance as the gas token, in 6 decimals.
    balances[k(standIn.address)] = portfolio.nativeAsset.balance;
    raw[k(standIn.address)] = wei / 10n ** BigInt(chain.decimals - standIn.decimals);
  }
  for (const t of portfolio.tokens) {
    balances[k(t.address)] = t.balance;
    raw[k(t.address)] = BigInt(t.raw ?? "0");
  }
  for (const t of sources) {
    if (t.chainId === chain.id) continue;
    balances[tokenKey(t)] = t.balance;
    raw[tokenKey(t)] = t.raw;
  }

  const market = useTokenMarket(chain.id, base);
  const sameChainCounter = counter && counter.chainId === chain.id && !isHead(counter);
  const counterMarket = useTokenMarket(chain.id, sameChainCounter ? counter : null);
  const top = market.data?.top;
  const candles = useCandles(chain.id, top?.address, top?.side, range);
  const ethUsd = nativePrices.data?.[chain.id]?.usd ?? null; // gas-token USD price

  const usd = {};
  for (const t of sources) if (t.price !== null) usd[tokenKey(t)] = t.price;
  usd[k(NATIVE)] = ethUsd;
  if (head && !head.isNative) usd[tokenKey(head)] = ethUsd;
  if (base) usd[tokenKey(base)] = market.data?.priceUsd ?? null;
  if (sameChainCounter) usd[tokenKey(counter)] = counterMarket.data?.priceUsd ?? null;
  if (counter && counter.chainId !== chain.id && usd[tokenKey(counter)] === undefined) {
    // Another chain's gas token without a holding: native price list.
    if (counter.isNative || counter.standsForNative) usd[tokenKey(counter)] = nativePrices.data?.[counter.chainId]?.usd ?? null;
  }

  // Picker lists. Buy: everything you hold anywhere, then this chain's list.
  // Sell: this chain's list, plus every network's gas token and USDC.
  const dedupe = (arr) => [...new Map(arr.map((t) => [tokenKey(t), t])).values()];
  const usdcEverywhere = reg.data
    ? Object.entries(reg.data.byId.get("usdc")?.deployments ?? {})
        .map(([cid, d]) => ({ cid: Number(cid), d }))
        .filter(({ cid, d }) => !d.native && getChainById(cid)?.swap)
        .map(({ cid, d }) => ({ address: d.address, chainId: cid, symbol: d.symbol ?? "USDC", name: "USD Coin", decimals: d.decimals, isNative: false, logo: reg.data.byId.get("usdc").logo }))
    : [];
  const counterOptions =
    side === "buy"
      ? dedupe([...sources.filter((t) => tokenKey(t) !== tokenKey(base ?? {})), ...all])
      : dedupe([...all, ...SWAP_CHAINS.filter((c) => !c.testnet).map(gasToken), ...usdcEverywhere]);

  if (tokens.isPending || !base || !counter) {
    return (
      <>
        <PageHeader title="Trade" />
        <div className="flex flex-col items-center gap-3 py-24 text-sm text-text-secondary">
          {tokens.isError ? <p>Couldn&apos;t load the token list. {tokens.error.message}</p> : <Spinner size={28} className="text-primary" />}
        </div>
      </>
    );
  }

  const series = candles.data || [];
  const lastPrice = hover?.close ?? market.data?.priceUsd ?? series.at(-1)?.close ?? null;
  const rangeChange = seriesChange(series);
  const hasMarket = !!marketNetwork(chain.id);
  const ethPrice = lastPrice && ethUsd ? lastPrice / ethUsd : null;
  const intraday = range === "1H" || range === "1D";

  return (
    <>
      <PageHeader title="Trade" subtitle={`Spot · ${chain.name}`} />
      <div className="flex items-center gap-2 px-4 pt-4 md:px-5">
        <ChainSwitcher only={(c) => !!c.swap} />
        <span className="text-xs text-text-tertiary">Pay from any network — Sysfi picks the best funds and bridges automatically.</span>
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 md:p-5 xl:h-[calc(100dvh-140px)] xl:min-h-[640px] xl:grid-cols-[240px_minmax(0,1fr)_340px]">
        <div className="hidden min-h-0 xl:flex xl:flex-col">
          <Watchlist chain={chain} tokens={all} base={base} balances={balances} onSelect={selectBase} />
        </div>

        {/* Market */}
        <section className="panel-scroll flex min-h-0 min-w-0 flex-col gap-4 xl:overflow-y-auto">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <button type="button" onClick={() => setPicker("base")} className="flex items-center gap-2.5 rounded-xl py-1 pr-2 text-left hover:bg-hover">
                <TokenLogo logo={base.logo ?? market.data?.logo} address={base.address} symbol={base.symbol} size={40} />
                <span>
                  <span className="flex items-center gap-1 text-lg font-extrabold text-text">
                    {base.symbol} <span className="text-text-tertiary">/ USD</span> <IoChevronDown size={15} className="text-text-tertiary" />
                  </span>
                  <span className="block max-w-[180px] truncate text-xs text-text-secondary">{base.name}</span>
                </span>
              </button>
              <div>
                <p className="text-2xl font-black tabular-nums tracking-[-0.5px] text-text">{lastPrice ? formatPrice(lastPrice) : "—"}</p>
                <p className="flex items-center gap-2 text-xs">
                  <Change value={hover ? (hover.open ? ((hover.close - hover.open) / hover.open) * 100 : null) : rangeChange} />
                  <span className="text-text-tertiary">{hover ? new Date(hover.time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : range}</span>
                </p>
              </div>
              <div className="grid min-w-[240px] flex-1 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                <Stat Icon={IoRepeatOutline} label={`In ${chain.symbol}`} value={ethPrice ? formatBalance(String(ethPrice)) : "—"} />
                <Stat Icon={IoBarChartOutline} label="24h volume" value={market.data ? formatCompactUsd(market.data.volume24h) : "—"} />
                <Stat Icon={IoWaterOutline} label="Liquidity" value={market.data ? formatCompactUsd(market.data.liquidity) : "—"} />
                <Stat Icon={IoTrendingUpOutline} label="24h trades" value={market.data ? market.data.txns24h.toLocaleString("en-US") : "—"} />
              </div>
            </div>
          </div>

          <div className="flex min-h-[380px] flex-1 flex-col rounded-2xl border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex gap-0.5 rounded-lg bg-background p-0.5">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRange(r.id)}
                    className={`h-7 rounded-md px-2.5 text-xs font-bold ${range === r.id ? "bg-hover text-text" : "text-text-tertiary hover:text-text"}`}
                  >
                    {r.id}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {candles.isFetching && <Spinner size={14} className="text-text-tertiary" />}
                <div className="flex gap-0.5 rounded-lg bg-background p-0.5">
                  {[
                    ["candles", IoStatsChartOutline, "Candles"],
                    ["line", IoTrendingUpOutline, "Line"],
                  ].map(([id, Icon, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-label={label}
                      aria-pressed={mode === id}
                      onClick={() => setMode(id)}
                      className={`flex h-7 w-8 items-center justify-center rounded-md ${mode === id ? "bg-hover text-text" : "text-text-tertiary hover:text-text"}`}
                    >
                      <Icon size={15} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {hover?.open !== undefined && mode === "candles" && (
              <p className="mb-1 flex gap-3 text-[11px] tabular-nums text-text-tertiary">
                {[
                  ["O", hover.open],
                  ["H", hover.high],
                  ["L", hover.low],
                  ["C", hover.close],
                ].map(([k, v]) => (
                  <span key={k}>
                    {k} <span className="font-semibold text-text-secondary">{formatPrice(v)}</span>
                  </span>
                ))}
              </p>
            )}
            <div className="relative min-h-[320px] flex-1">
              {!hasMarket ? (
                <p className="absolute inset-0 flex items-center justify-center text-sm text-text-secondary">Charts are available on Robinhood Chain mainnet.</p>
              ) : market.isPending || (candles.isPending && top) ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Spinner size={26} className="text-primary" />
                </div>
              ) : candles.isError && !series.length ? (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-text-secondary">
                  {candles.error?.message ?? "Chart unavailable right now."}
                </p>
              ) : !top ? (
                <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-text-secondary">
                  {market.error ? market.error.message : `No on-chain pool for ${base.symbol} yet, so there's no chart.`}
                </p>
              ) : (
                <div className="absolute inset-0">
                  <MarketChart candles={series} mode={mode} intraday={intraday} onHover={setHover} height="100%" />
                </div>
              )}
            </div>
          </div>

          <Pools market={market.data} base={base} className="hidden xl:block" />
        </section>

        {/* Ticket */}
        <div className="min-w-0 xl:min-h-0 xl:overflow-y-auto">
          <OrderPanel
            key={`${tokenKey(base)}-${tokenKey(counter)}`}
            chain={chain}
            base={base}
            counter={counter}
            side={side}
            onSide={(s) => setParams({ side: s })}
            onPickBase={() => setPicker("base")}
            onPickCounter={() => setPicker("counter")}
            balances={balances}
            raw={raw}
            usd={usd}
            run={run}
            isAuto={isAuto}
            onCrossChain={(b) => setBridges((list) => [b, ...list])}
          />
          {bridges.map((b) => (
            <BridgeTracker key={b.txHash} bridge={b} onDone={refreshWallet} onDismiss={() => setBridges((list) => list.filter((x) => x.txHash !== b.txHash))} />
          ))}
          <p className="mt-3 px-1 text-[11px] leading-4 text-text-tertiary">
            {chain.swap.router === "lifi"
              ? `Swaps on ${chain.name} route through LI.FI.`
              : `Swaps on ${chain.name} route through 0x, with a 0.3% Sysfi fee included in the price.`}{" "}
            Paying from another network routes through LI.FI bridges; fees are shown before you confirm.{" "}
            Market data by GeckoTerminal.
          </p>
          {balances[k(NATIVE)] && parseFloat(balances[k(NATIVE)]) === 0 && (
            <p className="mt-2 px-1 text-[11px] text-neutral">You need a little {chain.symbol} for network fees.</p>
          )}
          {raw[tokenKey(base)] > 0n && (
            <p className="mt-2 px-1 text-[11px] text-text-tertiary">
              You hold {formatBalance(formatUnits(raw[tokenKey(base)], base.decimals))} {base.symbol}
              {usd[tokenKey(base)] ? ` · ${formatCompactUsd(Number(formatUnits(raw[tokenKey(base)], base.decimals)) * usd[tokenKey(base)])}` : ""}
            </p>
          )}
        </div>
        <Pools market={market.data} base={base} className="xl:hidden" />
      </div>

      <TokenPicker
        open={!!picker}
        onClose={() => setPicker(null)}
        chain={chain}
        tokens={picker === "base" ? all.filter((t) => !isHead(t)) : counterOptions}
        showChain={picker === "counter"}
        usd={usd}
        balances={balances}
        exclude={picker === "counter" ? base : undefined}
        title={picker === "base" ? "Select market" : side === "buy" ? "Pay with" : "Receive"}
        onPick={(t) => (picker === "base" ? selectBase(t) : setCounterSel(t))}
      />
      {sheet}
    </>
  );
}
