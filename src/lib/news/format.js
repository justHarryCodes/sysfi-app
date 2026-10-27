// lib/news/format.js — display helpers for news cards (web + mobile).

/** "coindesk.com" from an article URL. */
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** First letters for a publisher monogram: "CoinDesk" → "CD", "Decrypt" → "D". */
export function monogram(name) {
  const words = String(name ?? "").replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "N";
  const caps = words[0].match(/[A-Z]/g);
  if (words.length === 1) return caps && caps.length > 1 ? caps.slice(0, 2).join("") : words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const TOPIC_LABEL = {
  regulation: "Regulation",
  etf: "ETFs",
  hacks: "Security",
  defi: "DeFi",
  nfts: "NFTs",
  stablecoins: "Stablecoins",
  markets: "Markets",
  memecoins: "Memecoins",
  ai: "AI",
  layer2: "Layer 2",
  funding: "Funding",
  adoption: "Adoption",
};
export const topicLabel = (topics) => TOPIC_LABEL[(topics ?? []).find((t) => TOPIC_LABEL[t])] ?? null;

/**
 * The headline number for an insight card:
 * { value: "12%", direction: "up"|"down"|null, label: "TVL 24h" } or null.
 */
export function insightMetric(insight) {
  const d = insight?.data ?? {};
  const pct = (p) => `${Math.abs(p) >= 10 ? Math.round(Math.abs(p)) : Math.abs(p).toFixed(1)}%`;
  switch (insight?.kind) {
    case "protocol_tvl":
    case "chain_tvl":
      return typeof d.change1d === "number" ? { value: pct(d.change1d), direction: d.change1d >= 0 ? "up" : "down", label: "TVL · 24h" } : null;
    case "dex_volume":
      return typeof d.change1d === "number" ? { value: pct(d.change1d), direction: "up", label: "Volume · 24h" } : null;
    case "hack":
      return typeof d.amount === "number" ? { value: usdShort(d.amount), direction: "down", label: "Lost" } : null;
    default:
      return null;
  }
}

export function usdShort(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export const insightLabel = (kind) => ({ protocol_tvl: "Protocol", chain_tvl: "Chain", dex_volume: "DEX", hack: "Security incident" })[kind] ?? "On-chain data";
