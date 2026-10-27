// lib/swap/market.js — on-chain market data from GeckoTerminal's public API
// (pools, prices, candles) on every chain in lib/chains.js.
// The app's swap chart uses CoinGecko coin ids, which tokenized stocks and
// new tokens don't have; GeckoTerminal covers every pool on the chain.
// Public limit is ~30 calls/min per IP, so callers cache aggressively.

import { APP_CONFIG, getChainById } from "@/lib/config";

const GT = "https://api.geckoterminal.com/api/v2";

/** chainId → GeckoTerminal network id (lib/chains.js gtNetwork). */
export const marketNetwork = (chainId) => getChainById(chainId)?.gtNetwork ?? null;

/** The gas token has no contract; its market is the wrapped token's. */
export const marketAddress = (chainId, token) =>
  (token?.isNative ? getChainById(chainId)?.wrappedNative : token?.address)?.toLowerCase() ?? null;

// Prefer the backend's cached proxy (api/v1/markets/gt — shared cache, one
// rate-limit budget for everyone); call GeckoTerminal directly when the
// backend doesn't have the route (older deploys) or can't be reached.
let proxyMissing = false;

const busy = () => Object.assign(new Error("Market data is busy — retrying shortly."), { code: "RATE_LIMITED", status: 429 });

async function fetchJson(url) {
  let res;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    // GeckoTerminal's 429s carry no CORS header, so the browser reports a
    // rate limit as a failed fetch — back off the same way.
    return { failed: true };
  }
  return { res };
}

async function gt(path) {
  if (!proxyMissing) {
    const { res } = await fetchJson(`${APP_CONFIG.BACKEND_URL}/markets/gt${path}`);
    if (res?.ok) return res.json();
    if (res?.status === 429) throw busy();
    if (res?.status === 404) {
      const body = await res.json().catch(() => null);
      if (Array.isArray(body?.errors)) return null; // GeckoTerminal's own "not found"
      proxyMissing = true; // backend predates the proxy route
    }
    // network error / 5xx: try GeckoTerminal directly this time
  }
  const { res, failed } = await fetchJson(GT + path);
  if (failed || res.status === 429) throw busy();
  if (res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error(`Market data failed (${res.status})`), { status: res.status });
  return res.json();
}

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

/**
 * Market summary for a token: its deepest pool (used for candles), USD price,
 * and 24h volume / liquidity summed across its top pools.
 */
export async function getTokenMarket(chainId, address) {
  const net = marketNetwork(chainId);
  if (!net || !address) return null;
  const j = await gt(`/networks/${net}/tokens/${address}/pools?page=1&include=base_token,quote_token,dex`);
  const pools = j?.data ?? [];
  if (!pools.length) return { address, pools: [], top: null, priceUsd: null, volume24h: 0, liquidity: 0 };

  const tokens = Object.fromEntries((j.included ?? []).filter((x) => x.type === "token").map((t) => [t.id, t.attributes]));
  const dexes = Object.fromEntries((j.included ?? []).filter((x) => x.type === "dex").map((d) => [d.id, d.attributes?.name]));
  const me = `${net}_${address.toLowerCase()}`;

  const shaped = pools.map((p) => {
    const a = p.attributes;
    const baseId = p.relationships.base_token.data.id;
    const quoteId = p.relationships.quote_token.data.id;
    const side = baseId === me ? "base" : "quote";
    const other = tokens[side === "base" ? quoteId : baseId];
    return {
      address: a.address,
      name: a.name,
      dex: dexes[p.relationships.dex.data.id] ?? p.relationships.dex.data.id,
      side,
      pairSymbol: other?.symbol ?? "?",
      pairLogo: other?.image_url && !other.image_url.includes("missing") ? other.image_url : null,
      priceUsd: num(side === "base" ? a.base_token_price_usd : a.quote_token_price_usd),
      liquidity: num(a.reserve_in_usd) ?? 0,
      volume24h: num(a.volume_usd?.h24) ?? 0,
      // GeckoTerminal's change is the base token's; flip it when we're the quote.
      change24h: side === "base" ? num(a.price_change_percentage?.h24) : null,
      txns24h: (a.transactions?.h24?.buys ?? 0) + (a.transactions?.h24?.sells ?? 0),
      buys24h: a.transactions?.h24?.buys ?? 0,
      sells24h: a.transactions?.h24?.sells ?? 0,
      createdAt: a.pool_created_at,
    };
  });
  const top = shaped.reduce((best, p) => (p.liquidity > (best?.liquidity ?? -1) ? p : best), null);
  const meta = tokens[me];
  return {
    address,
    name: meta?.name,
    symbol: meta?.symbol,
    logo: meta?.image_url && !meta.image_url.includes("missing") ? meta.image_url : null,
    pools: shaped.sort((a, b) => b.liquidity - a.liquidity),
    top,
    priceUsd: top?.priceUsd ?? null,
    volume24h: shaped.reduce((s, p) => s + p.volume24h, 0),
    liquidity: shaped.reduce((s, p) => s + p.liquidity, 0),
    txns24h: shaped.reduce((s, p) => s + p.txns24h, 0),
  };
}

/**
 * USD price + 24h change for up to 30 tokens in one call (watchlist).
 * Returns { addrLower: { price, change24h } }.
 */
export async function getTokenPrices(chainId, addresses) {
  const net = marketNetwork(chainId);
  const list = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))].slice(0, 30);
  if (!net || !list.length) return {};
  const j = await gt(`/simple/networks/${net}/token_price/${list.join(",")}?include_24hr_price_change=true`);
  const a = j?.data?.attributes ?? {};
  const out = {};
  for (const addr of list) {
    const price = num(a.token_prices?.[addr]);
    if (price !== null) out[addr] = { price, change24h: num(a.h24_price_change_percentage?.[addr]) };
  }
  return out;
}

/** Chart ranges → GeckoTerminal OHLCV resolution. */
export const RANGES = [
  { id: "1H", tf: "minute", aggregate: 1, limit: 60 },
  { id: "1D", tf: "minute", aggregate: 15, limit: 96 },
  { id: "1W", tf: "hour", aggregate: 1, limit: 168 },
  { id: "1M", tf: "hour", aggregate: 4, limit: 180 },
  { id: "1Y", tf: "day", aggregate: 1, limit: 365 },
];

/**
 * USD candles for `side` of a pool, oldest first, one per timestamp
 * (the API occasionally repeats a bucket).
 */
export async function getCandles(chainId, pool, side, rangeId) {
  const net = marketNetwork(chainId);
  const r = RANGES.find((x) => x.id === rangeId) ?? RANGES[1];
  const j = await gt(`/networks/${net}/pools/${pool}/ohlcv/${r.tf}?aggregate=${r.aggregate}&limit=${r.limit}&currency=usd&token=${side}`);
  const rows = j?.data?.attributes?.ohlcv_list ?? [];
  const byTime = new Map();
  for (const [t, o, h, l, c, v] of rows) if (!byTime.has(t)) byTime.set(t, { time: t, open: o, high: h, low: l, close: c, volume: v });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Change between the first open and last close of a candle series, in %. */
export const seriesChange = (candles) =>
  candles?.length > 1 && candles[0].open ? ((candles.at(-1).close - candles[0].open) / candles[0].open) * 100 : null;
