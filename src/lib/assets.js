// lib/assets.js — the cross-chain asset registry (backend
// scripts/build-assets.mjs → GET /api/v1/assets). One entry per economic
// asset (USDC, ETH, cbBTC, NVDA…) with its deployment on every chain:
//
//   { id, symbol, name, logo, tags, verified, wraps?, chains: [ids],
//     deployments: { [chainId]: { address, decimals, symbol, native?, erc20? } } }
//
// Falls back to the copy in public/data until a backend with the route is
// deployed.
import { APP_CONFIG, NATIVE_TOKEN_ADDRESS } from "@/lib/config";

const lc = (a) => a?.toLowerCase();

let registryPromise = null;

/** Memoised per page load (≈360 KB, served with an ETag); retried after a failure. */
export function getAssetRegistry() {
  registryPromise ??= fetchAssetRegistry().catch((e) => {
    registryPromise = null;
    throw e;
  });
  return registryPromise;
}

export async function fetchAssetRegistry() {
  const tryJson = async (url) => {
    const res = await fetch(url, { headers: { accept: "application/json" } }).catch(() => null);
    if (!res?.ok) return null;
    const j = await res.json().catch(() => null);
    return j?.data?.assets ? j.data : j?.assets ? j : null;
  };
  const reg = (await tryJson(`${APP_CONFIG.BACKEND_URL}/assets`)) ?? (await tryJson("/data/assets.json"));
  if (!reg) throw new Error("Couldn't load the token registry.");
  return indexRegistry(reg);
}

/** Adds lookups: byId, byDeployment ("chainId:address" → asset). */
export function indexRegistry(reg) {
  const byId = new Map();
  const byDeployment = new Map();
  for (const a of reg.assets) {
    byId.set(a.id, a);
    for (const [cid, d] of Object.entries(a.deployments)) {
      byDeployment.set(`${cid}:${lc(d.address)}`, a);
      if (d.erc20) byDeployment.set(`${cid}:${lc(d.erc20.address)}`, a);
    }
  }
  return { ...reg, byId, byDeployment };
}

export const assetOf = (reg, chainId, address) =>
  reg?.byDeployment.get(`${chainId}:${lc(address === "native" ? NATIVE_TOKEN_ADDRESS : address)}`) ?? null;

/**
 * The chain's ERC-20s as flat token records (the shape the wallet and swap
 * screens already use), excluding the gas token and the chain's hidden
 * duplicates of it (Arc's USDC interface).
 */
export function tokensForChain(reg, chain) {
  const out = [];
  for (const a of reg.assets) {
    const d = a.deployments[chain.id];
    if (!d || d.native || chain.hiddenTokens.includes(lc(d.address))) continue;
    out.push({
      chainId: chain.id,
      address: d.address,
      symbol: d.symbol ?? a.symbol,
      name: a.name,
      decimals: d.decimals,
      logoURI: a.logo,
      assetId: a.id,
      verified: a.verified,
    });
  }
  return out;
}
