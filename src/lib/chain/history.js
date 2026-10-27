// lib/chain/history.js — wallet activity via Alchemy's alchemy_getAssetTransfers
// (same source the app's utils/blockchain/Transaction.js uses). Outgoing and
// incoming transfers are two queries, merged newest-first and paged.
import { alchemy, getProvider } from "./rpc";

const CATEGORIES = ["external", "erc20", "erc721", "erc1155"];
const PAGE = 25;

/**
 * Fetches one page of activity. `cursor` is { out, in } Alchemy pageKeys
 * (undefined on the first page); returns { items, nextCursor }.
 */
export async function getActivityPage(chain, address, cursor) {
  const base = { fromBlock: "0x0", category: CATEGORIES, withMetadata: true, excludeZeroValue: false, order: "desc", maxCount: `0x${PAGE.toString(16)}` };

  const [out, inc] = await Promise.all([
    cursor && !cursor.out ? null : alchemy(chain, "alchemy_getAssetTransfers", [{ ...base, fromAddress: address, ...(cursor?.out ? { pageKey: cursor.out } : {}) }]),
    cursor && !cursor.in ? null : alchemy(chain, "alchemy_getAssetTransfers", [{ ...base, toAddress: address, ...(cursor?.in ? { pageKey: cursor.in } : {}) }]),
  ]);

  const me = address.toLowerCase();
  const byId = new Map();
  for (const t of [...(out?.transfers || []), ...(inc?.transfers || [])]) {
    const from = t.from?.toLowerCase();
    const to = t.to?.toLowerCase();
    byId.set(t.uniqueId, {
      id: t.uniqueId,
      hash: t.hash,
      blockNum: parseInt(t.blockNum, 16),
      timestamp: t.metadata?.blockTimestamp ? Date.parse(t.metadata.blockTimestamp) : null,
      direction: from === me && to === me ? "self" : from === me ? "out" : "in",
      from: t.from,
      to: t.to,
      value: t.value,
      // Alchemy calls every native transfer "ETH", whatever the chain.
      asset: t.category === "external" ? chain.symbol : t.asset || null,
      category: t.category,
      tokenAddress: t.rawContract?.address || null,
      tokenId: t.tokenId ? BigInt(t.tokenId).toString() : t.erc721TokenId ? BigInt(t.erc721TokenId).toString() : null,
    });
  }

  const items = [...byId.values()].sort((a, b) => b.blockNum - a.blockNum);

  // Some chains' indexers omit block timestamps (HyperEVM); read them from
  // the blocks over public RPC — one batched round-trip per page.
  const missing = [...new Set(items.filter((i) => !i.timestamp).map((i) => i.blockNum))];
  if (missing.length) {
    const provider = getProvider(chain);
    const blocks = await Promise.all(missing.map((n) => provider.getBlock(n).catch(() => null)));
    const ts = new Map(blocks.filter(Boolean).map((b) => [b.number, b.timestamp * 1000]));
    for (const i of items) if (!i.timestamp) i.timestamp = ts.get(i.blockNum) ?? null;
  }
  const nextCursor = out?.pageKey || inc?.pageKey ? { out: out?.pageKey, in: inc?.pageKey } : undefined;
  return { items, nextCursor };
}
