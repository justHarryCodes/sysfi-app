"use client";
// hooks/swap.js — data for the trade screen.
//   ["public", "swap", …]    token list, market data, candles (shared, persisted)
//   indicative 0x prices are volatile → not persisted
import { useQuery } from "@tanstack/react-query";
import { getSwapPrice } from "@/lib/swap/api";
import { loadTokenList } from "@/hooks/wallet";
import { getCandles, getTokenMarket, getTokenPrices, marketAddress, marketNetwork } from "@/lib/swap/market";
import { NATIVE_TOKEN_ADDRESS, getChainById } from "@/lib/config";

const SEC = 1000;
// Tokens are identified by chain + address (cross-chain trades).
const pairKey = (t) => (t ? `${t.chainId}:${t.address.toLowerCase()}` : null);
const MIN = 60 * SEC;

// GeckoTerminal answers 429 when busy; back off instead of hammering it.
const marketRetry = (count, err) => (err?.code === "RATE_LIMITED" ? count < 4 : count < 1);
const marketRetryDelay = (count, err) => (err?.code === "RATE_LIMITED" ? 8 * SEC * (count + 1) : 2 * SEC);

/**
 * Tradable tokens on a chain: the gas token first (or the ERC-20 that stands
 * in for it — Arc's USDC), then the chain's tokens from the asset registry.
 */
export const useSwapTokens = (chainId) => {
  const chain = getChainById(chainId);
  return useQuery({
    queryKey: ["public", "swap", "tokens", chainId],
    queryFn: async () => {
      const list = await loadTokenList(chain);
      const head = chain.swap?.nativeAs
        ? { ...chain.swap.nativeAs, chainId: chain.id, isNative: false, logo: chain.nativeLogo, standsForNative: true }
        : { address: NATIVE_TOKEN_ADDRESS, chainId: chain.id, symbol: chain.symbol, name: chain.nativeTokenName, decimals: chain.decimals, isNative: true, logo: chain.nativeLogo };
      const rest = list
        .filter((t) => t.address.toLowerCase() !== head.address.toLowerCase())
        .map((t) => ({ ...t, chainId: chain.id, isNative: false, logo: t.logoURI ?? null }));
      return [head, ...rest];
    },
    enabled: !!chain?.swap,
    staleTime: 6 * 60 * MIN,
  });
};

export function useTokenMarket(chainId, token) {
  const address = marketAddress(chainId, token);
  return useQuery({
    queryKey: ["public", "swap", "market", chainId, address],
    queryFn: () => getTokenMarket(chainId, address),
    enabled: !!(address && marketNetwork(chainId)),
    staleTime: MIN,
    refetchInterval: 2 * MIN,
    retry: marketRetry,
    retryDelay: marketRetryDelay,
  });
}

/** Watchlist prices (one GeckoTerminal call for up to 30 tokens). */
export function useTokenPrices(chainId, addresses) {
  const key = [...new Set((addresses || []).filter(Boolean).map((a) => a.toLowerCase()))].sort();
  return useQuery({
    queryKey: ["public", "swap", "prices", chainId, key.join(",")],
    queryFn: () => getTokenPrices(chainId, key),
    enabled: key.length > 0 && !!marketNetwork(chainId),
    staleTime: MIN,
    refetchInterval: 2 * MIN,
    retry: marketRetry,
    retryDelay: marketRetryDelay,
    placeholderData: (prev) => prev,
  });
}

export function useCandles(chainId, pool, side, range) {
  return useQuery({
    queryKey: ["public", "swap", "candles", chainId, pool, side, range],
    queryFn: () => getCandles(chainId, pool, side, range),
    enabled: !!(pool && side),
    staleTime: range === "1H" ? MIN : 5 * MIN,
    refetchInterval: range === "1H" ? MIN : 5 * MIN,
    retry: marketRetry,
    retryDelay: marketRetryDelay,
    placeholderData: (prev) => prev,
  });
}

/**
 * Indicative 0x price for selling `amount` (base units) of `sell` for `buy`.
 * Refreshes every 15 s while the order panel is showing it.
 */
export function useSwapPrice({ chainId, sell, buy, amount, taker, slippage }) {
  return useQuery({
    queryKey: ["swap", "price", chainId, pairKey(sell), pairKey(buy), amount?.toString(), slippage, taker],
    queryFn: () => getSwapPrice({ chainId, sell, buy, sellAmount: amount, taker, slippage }),
    enabled: !!(sell && buy && amount > 0n && pairKey(sell) !== pairKey(buy)),
    staleTime: 10 * SEC,
    refetchInterval: 15 * SEC,
    retry: (count, err) => !["RESTRICTED", "NO_LIQUIDITY"].includes(err?.code) && err?.status !== 400 && count < 1,
    meta: { persist: false },
    placeholderData: (prev, prevQuery) =>
      // Keep the last price on screen while the amount changes, not across pairs.
      prevQuery?.queryKey[3] === pairKey(sell) && prevQuery?.queryKey[4] === pairKey(buy) ? prev : undefined,
  });
}
