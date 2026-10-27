"use client";
// hooks/wallet.js — cached on-chain + market data for the wallet screens.
// Keys are ["user", uid, …] (see lib/cache/queryClient.js) so they persist
// to IndexedDB per user and are wiped on sign-out.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits } from "ethers";
import { api } from "@/lib/api";
import { APP_CONFIG } from "@/lib/config";
import { kvGet, kvSet, userScope } from "@/lib/cache/idb";
import { invalidateEverywhere } from "@/lib/cache/queryClient";
import { getActivityPage } from "@/lib/chain/history";
import { getNativeBalance, hasIndexer, readTokensMetadata } from "@/lib/chain/rpc";
import { CHAIN_LIST } from "@/lib/config";
import { getAssetRegistry, tokensForChain } from "@/lib/assets";
import { fetchErc20Balances, fetchNativePrices, groupPortfolio, heldRegistryTokens } from "@/lib/portfolio";
import { getTokenPrices } from "@/lib/swap/market";
import { useAuth } from "@/contexts/AuthContext";
import { useChain } from "@/contexts/ChainContext";
import { useWallet } from "@/contexts/WalletContext";

const SEC = 1000;
const MIN = 60 * SEC;

export const walletKeys = {
  all: (uid) => ["user", uid, "wallet"],
  native: (uid, chainId, addr) => ["user", uid, "wallet", "native", chainId, addr],
  erc20: (uid, chainId, addr) => ["user", uid, "wallet", "erc20", chainId, addr],
  activity: (uid, chainId, addr) => ["user", uid, "wallet", "activity", chainId, addr],
  nfts: (uid, chainId, addr) => ["user", uid, "wallet", "nfts", chainId, addr],
};

/** The signed-in user's active address + chain, used by every hook below. */
export function useWalletScope() {
  const { user } = useAuth();
  const { address } = useWallet();
  const { activeChain } = useChain();
  return { uid: user?.uid, address, chain: activeChain };
}

// ─── Market data (public) ─────────────────────────────────────────────────────

/**
 * Native-asset USD prices keyed by chainId. The backend's CoinGecko proxy
 * first; chains it doesn't map yet are filled from CoinGecko's public API.
 */
export const useNativePrices = () =>
  useQuery({
    queryKey: ["public", "prices", "native", CHAIN_LIST.map((c) => c.id).join(",")],
    queryFn: fetchNativePrices,
    staleTime: MIN,
  });

/**
 * Curated token list for a chain, from the cross-chain asset registry
 * (lib/assets.js). Never includes the gas token or a chain's hidden
 * duplicates of it (Arc's USDC interface).
 */
export async function loadTokenList(chain) {
  return tokensForChain(await getAssetRegistry(), chain);
}

/** The whole registry (indexed). Static per deploy, so cached for the session. */
export const useAssetRegistry = () =>
  useQuery({
    queryKey: ["asset-registry"],
    queryFn: getAssetRegistry,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { persist: false }, // ETag-cached by the browser; Maps stay in memory
  });

export const tokenListQuery = (chain) => ({
  queryKey: ["public", "tokenlist", chain.id],
  queryFn: () => loadTokenList(chain),
  staleTime: 24 * 60 * MIN,
});

export const useTokenList = (chainId) => {
  const { chain } = useWalletScope();
  const c = CHAIN_LIST.find((x) => x.id === Number(chainId)) ?? chain;
  return useQuery(tokenListQuery(c));
};

/** CoinGecko price history for the token detail chart (public API, like the app). */
export const useCoinChart = (coingeckoId, days) =>
  useQuery({
    queryKey: ["public", "chart", coingeckoId, days],
    queryFn: async () => {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`,
      );
      if (!res.ok) throw Object.assign(new Error("Chart unavailable"), { status: res.status });
      return (await res.json()).prices.map(([t, p]) => [t, p]);
    },
    enabled: !!coingeckoId,
    staleTime: days <= 1 ? 5 * MIN : 30 * MIN,
  });

// ─── Balances ─────────────────────────────────────────────────────────────────

const nativeBalanceQuery = (uid, chain, address) => ({
  queryKey: walletKeys.native(uid, chain.id, address),
  queryFn: () => getNativeBalance(chain, address),
  enabled: !!(uid && address),
  staleTime: 15 * SEC,
  refetchInterval: 60 * SEC,
});

export function useNativeBalance() {
  const { uid, address, chain } = useWalletScope();
  return useQuery(nativeBalanceQuery(uid, chain, address));
}

/**
 * Raw balances (as strings — bigint isn't JSON-safe for every consumer) of
 * every ERC-20 held. Curated + user-added tokens are read with one Multicall3
 * on public RPC; where Alchemy's indexer exists it also discovers tokens
 * that aren't on any list (best-effort, never required).
 */
const erc20Query = (qc, uid, chain, address) => ({
    queryKey: walletKeys.erc20(uid, chain.id, address),
    queryFn: async () => {
      const [list, prefs] = await Promise.all([qc.ensureQueryData(tokenListQuery(chain)), kvGet(prefsKey(uid, chain.id))]);
      const addrs = [...list.map((t) => t.address), ...(prefs?.added ?? []).map((t) => t.address)];
      return fetchErc20Balances(chain, address, addrs);
    },
    enabled: !!(uid && address),
    staleTime: 30 * SEC,
});

export function useErc20Raw() {
  const { uid, address, chain } = useWalletScope();
  const qc = useQueryClient();
  return useQuery(erc20Query(qc, uid, chain, address));
}

// ─── Per-user token preferences (added / hidden), IndexedDB kv ───────────────

const prefsKey = (uid, chainId) => `tokenPrefs:${uid}:${chainId}`;

export function useTokenPrefs() {
  const { uid, chain } = useWalletScope();
  const [prefs, setPrefs] = useState({ added: [], hidden: [] });

  useEffect(() => {
    if (!uid) return;
    kvGet(prefsKey(uid, chain.id)).then((p) => p && setPrefs(p));
  }, [uid, chain.id]);

  const qc = useQueryClient();
  const save = useCallback(
    (updater) =>
      setPrefs((prev) => {
        const next = updater(prev);
        // Balances are read for listed + added tokens, so re-read after a change.
        kvSet(prefsKey(uid, chain.id), next, userScope(uid)).then(() => qc.invalidateQueries({ queryKey: ["user", uid, "wallet", "erc20", chain.id] }));
        return next;
      }),
    [uid, chain.id, qc],
  );

  const addToken = useCallback(
    (token) =>
      save((p) => ({
        added: [...p.added.filter((t) => t.address.toLowerCase() !== token.address.toLowerCase()), token],
        hidden: p.hidden.filter((a) => a !== token.address.toLowerCase()),
      })),
    [save],
  );
  const removeToken = useCallback(
    (address) => save((p) => ({ ...p, added: p.added.filter((t) => t.address.toLowerCase() !== address.toLowerCase()) })),
    [save],
  );
  const hideToken = useCallback(
    (address) =>
      save((p) => ({
        added: p.added.filter((t) => t.address.toLowerCase() !== address.toLowerCase()),
        hidden: [...new Set([...p.hidden, address.toLowerCase()])],
      })),
    [save],
  );
  const unhideToken = useCallback((address) => save((p) => ({ ...p, hidden: p.hidden.filter((a) => a !== address.toLowerCase()) })), [save]);

  return { prefs, addToken, removeToken, hideToken, unhideToken };
}

// ─── Portfolio: native + held + added tokens, priced ──────────────────────────

/**
 * Everything the Home/Assets/Send screens need, in one place.
 * Tokens = held (listed, added or indexer-discovered) minus hidden. Tokens in
 * the chain's curated list are `verified`; anything else that turns up in
 * the wallet is shown as unverified (airdropped spam is common).
 */
export function usePortfolio() {
  const { uid, chain } = useWalletScope();
  const native = useNativeBalance();
  const erc20 = useErc20Raw();
  const list = useTokenList(chain.id);
  const prices = useNativePrices();
  const { prefs, ...prefActions } = useTokenPrefs();

  const listByAddr = useMemo(
    () => Object.fromEntries((list.data || []).map((t) => [t.address.toLowerCase(), t])),
    [list.data],
  );

  // Metadata for held tokens that aren't in the curated list.
  const unknownAddrs = useMemo(
    () => Object.keys(erc20.data || {}).filter((a) => !listByAddr[a] && !prefs.added.some((t) => t.address.toLowerCase() === a)),
    [erc20.data, listByAddr, prefs.added],
  );
  const unknownMeta = useQuery({
    queryKey: ["user", uid, "wallet", "tokenMeta", chain.id, unknownAddrs],
    queryFn: () => readTokensMetadata(chain, unknownAddrs).catch(() => ({})),
    enabled: !!uid && unknownAddrs.length > 0 && !list.isPending,
    staleTime: 24 * 60 * MIN,
  });

  const nativePrice = prices.data?.[chain.id] ?? null;

  // USD prices for held, listed tokens (GeckoTerminal, ≤30 per call). Unlisted
  // tokens stay unpriced so airdropped spam can't inflate the total.
  const pricedAddrs = useMemo(
    () => Object.keys(erc20.data || {}).filter((a) => listByAddr[a] || prefs.added.some((t) => t.address.toLowerCase() === a)).sort().slice(0, 30),
    [erc20.data, listByAddr, prefs.added],
  );
  const tokenPrices = useQuery({
    queryKey: ["public", "prices", "tokens", chain.id, pricedAddrs.join(",")],
    queryFn: () => getTokenPrices(chain.id, pricedAddrs),
    enabled: pricedAddrs.length > 0 && !!chain.gtNetwork,
    staleTime: 2 * MIN,
    retry: (n, err) => (err?.code === "RATE_LIMITED" ? n < 3 : n < 1),
    retryDelay: (n) => 8 * SEC * (n + 1),
    placeholderData: (prev) => prev,
  });
  const nativeBal = native.data?.formatted ?? "0";

  const tokens = useMemo(() => {
    const held = erc20.data || {};
    const hidden = new Set(prefs.hidden);
    const byAddr = new Map();
    const put = (addr, meta, extra) => {
      if (!meta || hidden.has(addr)) return;
      const raw = held[addr] ?? "0";
      byAddr.set(addr, {
        ...meta,
        address: meta.address,
        decimals: meta.decimals ?? 18,
        balance: formatUnits(BigInt(raw), meta.decimals ?? 18),
        raw,
        verified: !!listByAddr[addr],
        price: tokenPrices.data?.[addr]?.price ?? null,
        change24h: tokenPrices.data?.[addr]?.change24h ?? null,
        ...extra,
      });
    };
    for (const addr of Object.keys(held)) put(addr, listByAddr[addr] || unknownMeta.data?.[addr], { held: true });
    for (const t of prefs.added) {
      const addr = t.address.toLowerCase();
      if (!byAddr.has(addr)) put(addr, listByAddr[addr] || t, { added: true });
      else byAddr.get(addr).added = true;
    }
    return [...byAddr.values()].sort(
      (a, b) => Number(b.raw !== "0") - Number(a.raw !== "0") || Number(b.verified) - Number(a.verified) || a.symbol.localeCompare(b.symbol),
    );
  }, [erc20.data, listByAddr, unknownMeta.data, prefs, tokenPrices.data]);

  const nativeAsset = {
    isNative: true,
    address: "native",
    symbol: chain.symbol,
    name: chain.nativeTokenName,
    decimals: chain.decimals,
    logo: chain.nativeLogo,
    balance: nativeBal,
    price: nativePrice?.usd ?? null,
    change24h: nativePrice?.usd_24h_change ?? null,
    coingeckoId: chain.coingeckoId,
  };

  // Native + every priced token on this chain.
  const totalUsd = nativePrice?.usd
    ? parseFloat(nativeBal) * nativePrice.usd + tokens.reduce((sum, t) => sum + (t.price ? parseFloat(t.balance) * t.price : 0), 0)
    : null;

  return {
    chain,
    nativeAsset,
    tokens,
    totalUsd,
    isLoading: native.isPending || erc20.isPending,
    isFetching: native.isFetching || erc20.isFetching,
    error: native.error || erc20.error,
    tokenList: list.data || [],
    prefs,
    ...prefActions,
  };
}

// ─── All networks: one portfolio across every chain ─────────────────────────

const MAINNETS = CHAIN_LIST.filter((c) => !c.testnet);

/**
 * The wallet across every mainnet, grouped by asset (USDC on four chains is
 * one row). Same queries as the single-chain view — one Multicall per chain
 * on public RPC — so switching views is free. Only registry assets appear:
 * unlisted (often spam) tokens stay on the per-chain Assets screen.
 *
 * Returns { assets: [{ asset, usd, amount, chains: [{ chain, amount, raw,
 * address, decimals, isNative, usd, price }] }], totalUsd, isLoading, isFetching }.
 */
export function useAllChainsPortfolio() {
  const { uid, address } = useWalletScope();
  const qc = useQueryClient();
  const chains = MAINNETS;
  const reg = useAssetRegistry();
  const prices = useNativePrices();
  const natives = useQueries({ queries: chains.map((c) => nativeBalanceQuery(uid, c, address)) });
  const erc20s = useQueries({ queries: chains.map((c) => erc20Query(qc, uid, c, address)) });

  // Held registry tokens per chain → one GeckoTerminal price call per chain.
  // (Plain computations — the React Compiler memoises them.)
  const heldByChain = chains.map((c, i) =>
    heldRegistryTokens(reg.data, c, erc20s[i].data),
  );
  const tokenPrices = useQueries({
    queries: chains.map((c, i) => ({
      queryKey: ["public", "prices", "tokens", c.id, heldByChain[i].join(",")],
      queryFn: () => getTokenPrices(c.id, heldByChain[i]),
      enabled: heldByChain[i].length > 0 && !!c.gtNetwork,
      staleTime: 2 * MIN,
      retry: (n, err) => (err?.code === "RATE_LIMITED" ? n < 3 : n < 1),
      retryDelay: (n) => 8 * SEC * (n + 1),
    })),
  });

  const result = groupPortfolio({
    chains,
    reg: reg.data,
    natives: natives.map((q) => q.data),
    erc20s: erc20s.map((q) => q.data),
    nativePrices: prices.data,
    tokenPrices: tokenPrices.map((q) => q.data),
  });

  return {
    ...result,
    isLoading: !reg.data || natives.some((q) => q.isPending) || erc20s.some((q) => q.isPending),
    isFetching: natives.some((q) => q.isFetching) || erc20s.some((q) => q.isFetching),
    failedChains: chains.filter((_, i) => natives[i].isError || erc20s[i].isError),
  };
}

/** Refresh balances + activity everywhere (after a send, pull-to-refresh). */
export function useRefreshWallet() {
  const qc = useQueryClient();
  const { uid } = useWalletScope();
  return useCallback(() => invalidateEverywhere(qc, walletKeys.all(uid)), [qc, uid]);
}

// ─── Activity ────────────────────────────────────────────────────────────────

/**
 * Transfer history needs an indexer (Alchemy's alchemy_getAssetTransfers) —
 * public RPC can't list past transfers. `supported` is false on chains
 * without one; screens then link to the block explorer instead.
 */
export function useActivity() {
  const { uid, address, chain } = useWalletScope();
  const supported = hasIndexer(chain);
  const q = useInfiniteQuery({
    queryKey: walletKeys.activity(uid, chain.id, address),
    queryFn: ({ pageParam }) => getActivityPage(chain, address, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!(uid && address) && supported,
    staleTime: 30 * SEC,
    retry: 1,
    meta: { persist: false }, // paged history is cheap to refetch; keep IDB lean
  });
  return Object.assign(q, { supported });
}

// ─── NFTs ─────────────────────────────────────────────────────────────────────

export function useNFTs() {
  const { uid, address, chain } = useWalletScope();
  return useQuery({
    queryKey: walletKeys.nfts(uid, chain.id, address),
    queryFn: async () => {
      const res = await fetch(`${APP_CONFIG.BACKEND_URL}/nfts/${chain.id}/${address}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw Object.assign(new Error(json.error || "Couldn't load NFTs"), { status: res.status });
      return json.nfts || [];
    },
    enabled: !!(uid && address),
    staleTime: 2 * MIN,
  });
}

export const nftImage = (nft) =>
  nft?.image?.cachedUrl || nft?.image?.thumbnailUrl || nft?.image?.originalUrl || nft?.media?.[0]?.gateway || null;
