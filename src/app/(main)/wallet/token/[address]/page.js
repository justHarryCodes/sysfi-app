"use client";
// Token detail — port of TokenDetailScreen: price + chart (1D/7D/1M/3M/1Y),
// your balance, quick actions, market statistics. ERC-20s without a
// CoinGecko id show token info instead of a chart.
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { IoPaperPlane, IoQrCode, IoRepeat, IoOpenOutline, IoCopyOutline, IoCheckmark, IoAlertCircleOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import PriceChart from "@/components/wallet/PriceChart";
import TokenLogo from "@/components/wallet/TokenLogo";
import Spinner from "@/components/ui/Spinner";
import { useCoinChart, useNativePrices, usePortfolio } from "@/hooks/wallet";
import { explorerToken } from "@/lib/config";
import { formatBalance, formatCompactUsd, formatPercent, formatPrice, formatUsd } from "@/lib/format";

const RANGES = [
  { label: "1D", days: 1 },
  { label: "7D", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
];

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-surface p-3">
      <p className="mb-1 text-xs text-text-tertiary">{label}</p>
      <p className="text-md font-bold tabular-nums text-text">{value}</p>
    </div>
  );
}

function Actions({ token }) {
  const sendHref = `/wallet/send?token=${token.isNative ? "native" : token.address}`;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-base font-bold text-text">Quick Actions</h2>
      <div className="grid grid-cols-3 gap-3">
        <Link
          href={sendHref}
          className="flex items-center justify-center gap-2 rounded-md bg-primary py-3.5 font-bold text-on-primary hover:opacity-90"
        >
          <IoPaperPlane size={18} /> Send
        </Link>
        <Link
          href="/wallet/receive"
          className="flex items-center justify-center gap-2 rounded-md bg-surface py-3.5 font-bold text-primary hover:opacity-90"
        >
          <IoQrCode size={18} /> Receive
        </Link>
        <Link
          href={token.isNative ? "/swap" : `/swap?token=${token.address}`}
          className="flex items-center justify-center gap-2 rounded-md bg-surface py-3.5 font-bold text-primary hover:opacity-90"
        >
          <IoRepeat size={18} /> Trade
        </Link>
      </div>
    </section>
  );
}

function BalanceCard({ token }) {
  const usd = token.price ? parseFloat(token.balance) * token.price : null;
  return (
    <section className="mb-6 rounded-2xl border border-primary/15 bg-surface p-5">
      <p className="mb-1 text-xs font-semibold text-text-tertiary">Your Balance</p>
      <p className="text-[28px] font-black tracking-[-0.5px] tabular-nums text-text">
        {formatBalance(token.balance)} <span className="text-lg font-bold text-text-secondary">{token.symbol}</span>
      </p>
      {usd !== null && <p className="text-md font-semibold text-primary">{formatUsd(usd)}</p>}
    </section>
  );
}

function NativeDetail({ token, chain }) {
  const [range, setRange] = useState(RANGES[1]);
  const [scrubbed, setScrubbed] = useState(null);
  const chart = useCoinChart(token.coingeckoId, range.days);
  const prices = useNativePrices();
  const stats = prices.data?.[chain.id] || prices.data?.[1];

  const first = chart.data?.[0]?.[1];
  const last = chart.data?.[chart.data.length - 1]?.[1];
  const rangeChange = first && last ? ((last - first) / first) * 100 : null;
  const shownPrice = scrubbed ?? token.price;

  // Wide screens: chart on the left, balance/actions/stats beside it.
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
      <div>
        <section className="mb-4">
          <p className="text-[34px] font-black tracking-[-1px] tabular-nums text-text">{formatPrice(shownPrice)}</p>
          {rangeChange !== null && (
            <p className={`text-sm font-semibold ${rangeChange >= 0 ? "text-primary" : "text-text-tertiary"}`}>
              {formatPercent(rangeChange)} <span className="font-normal text-text-tertiary">· past {range.label}</span>
            </p>
          )}
        </section>

        <section className="mb-2">
          {chart.isPending ? (
            <div className="flex h-[200px] items-center justify-center">
              <Spinner />
            </div>
          ) : chart.isError ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-text-tertiary">
              Chart unavailable right now.
            </div>
          ) : (
            <PriceChart points={chart.data} days={range.days} onScrub={setScrubbed} />
          )}
        </section>
        <div className="mb-6 flex gap-1 rounded-lg bg-surface p-1" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              role="tab"
              aria-selected={r.label === range.label}
              onClick={() => setRange(r)}
              className={`flex-1 rounded-md py-1.5 text-sm font-bold ${r.label === range.label ? "bg-primary text-on-primary" : "text-text-secondary hover:text-text"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <BalanceCard token={token} />
        <Actions token={token} />

        {stats && (
          <section className="mb-6">
            <h2 className="mb-2 text-base font-bold text-text">Market Statistics</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Price" value={formatPrice(stats.usd)} />
              <Stat label="24h Change" value={formatPercent(stats.usd_24h_change)} />
              <Stat label="Market Cap" value={formatCompactUsd(stats.usd_market_cap)} />
              <Stat label="24h Volume" value={formatCompactUsd(stats.usd_24h_vol)} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function TokenInfo({ token, chain }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <BalanceCard token={token} />
      <Actions token={token} />
      <section className="mb-6">
        <h2 className="mb-2 text-base font-bold text-text">Token Information</h2>
        <dl className="divide-y divide-divider rounded-lg bg-surface px-4 text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-text-secondary">Name</dt>
            <dd className="text-right font-semibold text-text">{token.name}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-text-secondary">Decimals</dt>
            <dd className="font-semibold text-text">{token.decimals}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-text-secondary">Contract</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-xs text-text">{token.address}</span>
              <button
                type="button"
                aria-label="Copy contract address"
                onClick={async () => {
                  await navigator.clipboard.writeText(token.address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="shrink-0 text-text-tertiary hover:text-text"
              >
                {copied ? <IoCheckmark size={16} className="text-primary" /> : <IoCopyOutline size={16} />}
              </button>
            </dd>
          </div>
        </dl>
        <a
          href={explorerToken(chain, token.address)}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary"
        >
          View on explorer <IoOpenOutline size={14} />
        </a>
      </section>
      {!token.verified && (
        <p className="mb-6 flex items-start gap-2 rounded-lg bg-surface p-3 text-sm text-text-secondary">
          <IoAlertCircleOutline size={18} className="mt-px shrink-0 text-warning" />
          This token isn&apos;t in this network&apos;s token list. Be careful with unknown tokens — some are scams sent to look
          valuable.
        </p>
      )}
    </>
  );
}

export default function TokenDetailPage() {
  const { address } = useParams();
  const { chain, nativeAsset, tokens, tokenList, isLoading } = usePortfolio();
  const isNative = address === "native";
  const lower = String(address).toLowerCase();
  const fromList = tokenList.find((t) => t.address.toLowerCase() === lower);
  const token = isNative
    ? nativeAsset
    : tokens.find((t) => t.address.toLowerCase() === lower) ||
      (fromList && { ...fromList, logo: fromList.logoURI, balance: "0", verified: true });

  return (
    <>
      <PageHeader
        title={token ? (isNative ? token.name : token.symbol) : "Token"}
        subtitle={chain.name}
        backHref="/wallet/assets"
      />
      <div className="px-4 pt-4">
        {!token ? (
          isLoading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-text-secondary">This token isn&apos;t in your wallet.</p>
          )
        ) : (
          <>
            <div className="mb-4 flex items-center gap-3">
              <TokenLogo logo={token.logo} address={token.address} symbol={token.symbol} size={44} />
              <div>
                <p className="text-lg font-extrabold text-text">{isNative ? token.name : token.symbol}</p>
                <p className="text-sm text-text-tertiary">{isNative ? `${token.symbol} · ${chain.name}` : token.name}</p>
              </div>
            </div>
            {isNative ? <NativeDetail token={token} chain={chain} /> : <TokenInfo token={token} chain={chain} />}
          </>
        )}
      </div>
    </>
  );
}
