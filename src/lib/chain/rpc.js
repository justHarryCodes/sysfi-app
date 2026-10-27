// lib/chain/rpc.js — read-only chain access. Port of the app's
// utils/blockchain/Providers.js: one cached provider per chain. Providers
// are ResilientProviders (lib/chain/transport.js): public RPCs first,
// Alchemy only as the slow/failed fallback. Balances and token metadata go
// through Multicall3 so a whole wallet is one or two public-RPC calls.
import { AbiCoder, Contract, Interface, formatUnits } from "ethers";
import { getChainById } from "@/lib/config";
import { ResilientProvider } from "./transport";

const providers = new Map();

export function getProvider(chain) {
  let p = providers.get(chain.id);
  if (!p) {
    p = new ResilientProvider(chain);
    providers.set(chain.id, p);
  }
  return p;
}

/** Ethereum mainnet provider — ENS lookups when sending. */
export const getEnsProvider = () => getProvider(getChainById(1));

/** True if this chain has the alchemy_* indexer APIs (token discovery, history). */
export const hasIndexer = (chain) => getProvider(chain).hasIndexer;

/** Alchemy enhanced-API call (alchemy_getTokenBalances, alchemy_getAssetTransfers, …). */
export const alchemy = (chain, method, params) => getProvider(chain).send(method, params);

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

export const NFT_ABI = [
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
];

export async function getNativeBalance(chain, address) {
  const wei = await getProvider(chain).getBalance(address);
  return { wei: wei.toString(), formatted: formatUnits(wei, chain.decimals) };
}

// ─── Multicall3 (same address on every supported chain) ──────────────────────

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const mc = new Interface(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[])"]);
const erc20 = new Interface(ERC20_ABI);
const coder = AbiCoder.defaultAbiCoder();
const CHUNK = 150;

/** Runs calls [{ target, data }] through Multicall3; returns returnData or null per call. */
export async function multicall(chain, calls) {
  const provider = getProvider(chain);
  const out = [];
  for (let i = 0; i < calls.length; i += CHUNK) {
    const slice = calls.slice(i, i + CHUNK);
    const data = mc.encodeFunctionData("aggregate3", [slice.map((c) => ({ target: c.target, allowFailure: true, callData: c.data }))]);
    const raw = await provider.call({ to: MULTICALL3, data });
    const [results] = mc.decodeFunctionResult("aggregate3", raw);
    for (const r of results) out.push(r.success && r.returnData !== "0x" ? r.returnData : null);
  }
  return out;
}

/**
 * Balances of `tokens` (addresses) for `owner`, from public RPC.
 * Returns { [lowercaseAddress]: bigint } for non-zero balances only.
 */
export async function getTokenBalances(chain, owner, tokens) {
  const list = [...new Set(tokens.map((t) => t.toLowerCase()))];
  if (!list.length) return {};
  const res = await multicall(chain, list.map((target) => ({ target, data: erc20.encodeFunctionData("balanceOf", [owner]) })));
  const out = {};
  res.forEach((r, i) => {
    if (!r) return;
    try {
      const v = coder.decode(["uint256"], r)[0];
      if (v > 0n) out[list[i]] = v;
    } catch {}
  });
  return out;
}

/**
 * ERC-20s the owner holds that may not be on any list, via Alchemy's
 * indexer. Optional extra: one page (≤100 tokens — heavily airdropped
 * wallets hold thousands of spam tokens), and a time budget so the public
 * Multicall result is never held up by it.
 */
export async function discoverErc20Balances(chain, owner, budgetMs = 5000) {
  const page = alchemy(chain, "alchemy_getTokenBalances", [owner, "erc20"]).then((res) => {
    const out = {};
    for (const { contractAddress, tokenBalance, error } of res.tokenBalances || []) {
      if (error || !tokenBalance) continue;
      const v = BigInt(tokenBalance);
      if (v > 0n) out[contractAddress.toLowerCase()] = v;
    }
    return out;
  }).catch(() => ({})); // optional: a refused/slow indexer just means "nothing extra"
  const timeout = new Promise((resolve) => setTimeout(() => resolve({}), budgetMs));
  return Promise.race([page, timeout]);
}

const decodeString = (r) => {
  if (!r) return null;
  try {
    return coder.decode(["string"], r)[0];
  } catch {
    // Old tokens (MKR-style) return bytes32.
    try {
      const bytes = Uint8Array.from(r.slice(2, 66).match(/../g), (h) => parseInt(h, 16));
      return new TextDecoder().decode(bytes).replace(/\0+$/, "") || null;
    } catch {
      return null;
    }
  }
};

/** name / symbol / decimals for many tokens in one Multicall3 round-trip. */
export async function readTokensMetadata(chain, addresses) {
  const list = [...new Set(addresses.map((a) => a.toLowerCase()))];
  if (!list.length) return {};
  const calls = list.flatMap((target) => ["name", "symbol", "decimals"].map((fn) => ({ target, data: erc20.encodeFunctionData(fn) })));
  const res = await multicall(chain, calls);
  const out = {};
  list.forEach((address, i) => {
    const [n, s, d] = res.slice(i * 3, i * 3 + 3);
    if (!s && !d) return; // not an ERC-20
    let decimals = 18;
    try {
      decimals = d ? Number(coder.decode(["uint8"], d)[0]) : 18;
    } catch {}
    out[address] = { address, name: decodeString(n) || "Unknown token", symbol: decodeString(s) || "???", decimals, logo: null };
  });
  return out;
}

/** Reads name/symbol/decimals from an ERC-20 contract (custom token import). */
export async function readTokenMetadata(chain, address) {
  const c = new Contract(address, ERC20_ABI, getProvider(chain));
  const [name, symbol, decimals] = await Promise.all([c.name(), c.symbol(), c.decimals()]);
  return { address, name, symbol, decimals: Number(decimals) };
}
