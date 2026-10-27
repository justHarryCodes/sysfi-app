// lib/swap/sources.js — chain abstraction for the trade ticket: the wallet's
// holdings on every network as tradable tokens, and the automatic choice of
// which one pays for a buy.
import { NATIVE_TOKEN_ADDRESS, getChainById } from "@/lib/config";

export const tokenKey = (t) => `${t.chainId}:${t.address.toLowerCase()}`;

/** The token record the routers trade for a chain's gas coin (Arc → its USDC ERC-20). */
export function gasToken(chain) {
  return chain.swap?.nativeAs
    ? { ...chain.swap.nativeAs, chainId: chain.id, isNative: false, standsForNative: true, logo: chain.nativeLogo }
    : { address: NATIVE_TOKEN_ADDRESS, chainId: chain.id, symbol: chain.symbol, name: chain.nativeTokenName, decimals: chain.decimals, isNative: true, logo: chain.nativeLogo };
}

/**
 * useAllChainsPortfolio() groups → flat tradable tokens with balance, raw,
 * price and usd, on chains that have a swap router.
 */
export function holdingsAsTokens(groups) {
  const out = [];
  for (const g of groups) {
    for (const r of g.chains) {
      if (!r.chain.swap) continue;
      let token;
      let raw = BigInt(r.raw);
      if (r.isNative) {
        token = gasToken(r.chain);
        // Arc: same balance read through the 6-decimal ERC-20 interface.
        if (token.standsForNative) raw /= 10n ** BigInt(r.chain.decimals - token.decimals);
      } else {
        const dep = g.asset.deployments[r.chain.id];
        token = { address: dep.address, chainId: r.chain.id, symbol: dep.symbol ?? g.asset.symbol, name: g.asset.name, decimals: dep.decimals, isNative: false, logo: g.asset.logo };
      }
      out.push({ ...token, assetId: g.asset.id, tags: g.asset.tags, wraps: g.asset.wraps, balance: String(r.amount), raw, price: r.price, usd: r.usd });
    }
  }
  return out;
}

const MIN_USD = 1; // below this a source can't usefully pay for anything

/**
 * Which holding pays for a buy of `base`, when the user hasn't chosen:
 *   1. the gas token on the market's own chain (one transaction, no bridge)
 *   2. otherwise the largest stablecoin / gas-token holding on any chain
 *   3. otherwise the same-chain gas token anyway (shows "insufficient")
 */
export function autoSource(sources, base) {
  const head = gasToken(getChainById(base.chainId));
  const local = sources.find((s) => tokenKey(s) === tokenKey(head));
  if (local && (local.usd ?? 0) >= MIN_USD) return local;
  const liquid = sources
    .filter((s) => tokenKey(s) !== tokenKey(base) && (s.usd ?? 0) >= MIN_USD && (s.tags?.includes("native") || s.tags?.includes("stablecoin") || s.wraps))
    .sort((a, b) => (b.chainId === base.chainId) - (a.chainId === base.chainId) || (b.usd ?? 0) - (a.usd ?? 0));
  return liquid[0] ?? local ?? head;
}
