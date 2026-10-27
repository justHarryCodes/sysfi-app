// components/wallet/AssetRow.js — one asset line (app's AssetCard / TokensScreen
// AssetRow): logo · name + price/change · balance + USD.
import Link from "next/link";
import { IoAlertCircleOutline } from "react-icons/io5";
import TokenLogo from "@/components/wallet/TokenLogo";
import { formatBalance, formatPrice, formatUsd } from "@/lib/format";

export function ChangeBadge({ change }) {
  if (change === null || change === undefined) return null;
  const up = change >= 0;
  return (
    <span className="rounded-[5px] border border-border bg-surface px-1.5 py-px text-[10px] font-bold tabular-nums">
      <span className={up ? "text-primary" : "text-error"}>
        {up ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
      </span>
    </span>
  );
}

export default function AssetRow({ asset, href, trailing, divider = true }) {
  const bal = parseFloat(asset.balance || "0");
  const usd = asset.price ? bal * asset.price : null;
  const main = (
    <>
      <TokenLogo logo={asset.logo} address={asset.address} symbol={asset.symbol} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-base font-bold text-text">{asset.isNative ? asset.name : asset.symbol}</span>
          {asset.isNative && (
            <span className="rounded bg-primary px-1 py-px text-[8px] font-black tracking-[0.6px] text-on-primary">NATIVE</span>
          )}
          {!asset.isNative && !asset.verified && (
            <span title="Not in this network's token list" className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning">
              <IoAlertCircleOutline size={11} /> Unverified
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs text-text-tertiary">
          {asset.price ? formatPrice(asset.price) : asset.isNative ? asset.symbol : asset.name}
          <ChangeBadge change={asset.change24h} />
        </span>
      </span>
      <span className="text-right">
        <span className={`block text-sm tabular-nums ${bal > 0 ? "font-bold text-text" : "text-text-secondary"}`}>
          {formatBalance(asset.balance)} {asset.isNative ? asset.symbol : ""}
        </span>
        {usd !== null && <span className="block text-xs font-semibold tabular-nums text-primary">{formatUsd(usd)}</span>}
      </span>
    </>
  );
  const inner = "flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4";
  return (
    <div
      className={`flex items-center gap-1 pr-4 transition-colors ${href ? "hover:bg-card" : ""} ${
        divider ? "border-b-[0.5px] border-border/50 last:border-0" : ""
      }`}
    >
      {href ? (
        <Link href={href} className={inner}>
          {main}
        </Link>
      ) : (
        <div className={inner}>{main}</div>
      )}
      {trailing}
    </div>
  );
}
