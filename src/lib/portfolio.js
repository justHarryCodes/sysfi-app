// lib/portfolio.js — balances and the cross-chain portfolio, as plain async
// functions. The web wraps them in TanStack queries (hooks/wallet.js); the
// mobile app calls them from its own hook (crypto-wallet bundles this file
// through its Metro config), so both show the same numbers.
import { formatUnits } from "ethers";
import { api } from "@/lib/api";
import { CHAIN_LIST } from "@/lib/config";
import { assetOf } from "@/lib/assets";
import { discoverErc20Balances, getTokenBalances, hasIndexer } from "@/lib/chain/rpc";

/**
 * ERC-20 balances (raw, as strings) for `addresses` — the registry's tokens
 * for the chain plus any the user added — with one Multicall3 on public RPC.
 * Where Alchemy's indexer exists it also discovers unlisted tokens
 * (best-effort, never required). The chain's hidden tokens are dropped.
 */
export async function fetchErc20Balances(chain, owner, addresses) {
  const [known, found] = await Promise.all([
    getTokenBalances(chain, owner, addresses),
    hasIndexer(chain) ? discoverErc20Balances(chain, owner).catch(() => ({})) : {},
  ]);
  const merged = { ...found, ...known };
  for (const a of chain.hiddenTokens ?? []) delete merged[a];
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, v.toString()]));
}

/**
 * Native-asset USD prices keyed by chainId ({ usd, usd_24h_change }). The
 * backend's CoinGecko proxy first; chains it doesn't map yet are filled from
 * CoinGecko's public API.
 */
export async function fetchNativePrices() {
  const out = { ...((await api.publicGet("/coingecko/native-prices").catch(() => null)) || {}) };
  const missing = CHAIN_LIST.filter((c) => !out[c.id] && c.coingeckoId);
  if (missing.length) {
    const ids = [...new Set(missing.map((c) => c.coingeckoId))].join(",");
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`).catch(() => null);
    const j = res?.ok ? await res.json() : {};
    for (const c of missing) if (j[c.coingeckoId]) out[c.id] = j[c.coingeckoId];
  }
  return out;
}

/** Held ERC-20s on `chain` that are in the registry (the ones worth pricing), ≤ 30. */
export const heldRegistryTokens = (reg, chain, erc20) =>
  reg ? Object.keys(erc20 || {}).filter((a) => assetOf(reg, chain.id, a)).sort().slice(0, 30) : [];

/**
 * Groups holdings by asset across chains (USDC on Base + USDC on Arbitrum →
 * one USDC row). Inputs are aligned with `chains`:
 *   natives[i]      { wei } | null
 *   erc20s[i]       { address: raw } | null
 *   nativePrices    { [chainId]: { usd } }
 *   tokenPrices[i]  { address: { price } } | null
 * Unlisted tokens are left out, so airdropped spam can't inflate the total.
 * zeroNatives: also list each chain's gas token at a 0 balance (the app's
 * wallet shows every supported network's default token).
 * → { assets: [{ asset, amount, usd, chains: [row] }], totalUsd }
 */
export function groupPortfolio({ chains, reg, natives, erc20s, nativePrices, tokenPrices, zeroNatives = false }) {
  const groups = new Map();
  const add = (asset, row) => {
    const g = groups.get(asset.id) ?? { asset, usd: 0, amount: 0, priced: false, chains: [] };
    g.chains.push(row);
    g.amount += row.amount;
    if (row.usd !== null) {
      g.usd += row.usd;
      g.priced = true;
    }
    groups.set(asset.id, g);
  };
  if (reg) {
    chains.forEach((c, i) => {
      const wei = natives[i]?.wei ? BigInt(natives[i].wei) : 0n;
      const nativeAsset =
        assetOf(reg, c.id, "native") ??
        (zeroNatives ? { id: `native:${c.id}`, symbol: c.symbol, name: c.nativeTokenName, logo: c.nativeLogo ?? null } : null);
      if ((wei > 0n || zeroNatives) && nativeAsset) {
        const amount = Number(formatUnits(wei, c.decimals));
        const price = nativePrices?.[c.id]?.usd ?? null;
        add(nativeAsset, { chain: c, amount, raw: wei.toString(), address: "native", decimals: c.decimals, isNative: true, price, usd: price !== null ? amount * price : null });
      }
      for (const [addr, raw] of Object.entries(erc20s[i] || {})) {
        const asset = assetOf(reg, c.id, addr);
        if (!asset) continue;
        const dep = asset.deployments[c.id];
        const amount = Number(formatUnits(BigInt(raw), dep.decimals));
        const price = tokenPrices?.[i]?.[addr]?.price ?? null;
        add(asset, { chain: c, amount, raw, address: dep.address, decimals: dep.decimals, isNative: false, price, usd: price !== null ? amount * price : null });
      }
    });
  }
  const assets = [...groups.values()]
    .map((g) => ({ ...g, usd: g.priced ? g.usd : null, chains: g.chains.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0)) }))
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || a.asset.symbol.localeCompare(b.asset.symbol));
  return { assets, totalUsd: assets.some((a) => a.usd !== null) ? assets.reduce((s, a) => s + (a.usd ?? 0), 0) : null };
}
