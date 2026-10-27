// lib/swap/api.js — same-chain swaps through the backend, one router per chain
// (lib/chains.js swap.router):
//   "0x"    /swap/price while typing, /swap/quote (AllowanceHolder) on submit —
//           crypto-wallet/hooks/useSwap.js; the backend adds a 0.3% fee
//   "lifi"  /lifi/quote with fromChain = toChain — for chains 0x doesn't serve
//           (Arc); the backend applies LI.FI's integrator fee when enabled
// Both are normalised to the 0x quote shape the order ticket reads:
//   { sellAmount, buyAmount, minBuyAmount, allowanceTarget, transaction,
//     route: { tokens, fills }, fees, totalNetworkFee, liquidityAvailable }
import { api } from "@/lib/api";
import { NATIVE_TOKEN_ADDRESS, getChainById } from "@/lib/config";

export const TRIBE_FEE_BPS = 30;

const ZERO = "0x0000000000000000000000000000000000000000";
// LI.FI quotes need a sender; for indicative prices before a wallet exists.
const PLACEHOLDER_TAKER = "0x0000000000000000000000000000000000000001";

/**
 * 0x refuses some tokens outright (tokenized equities: "not authorized for
 * trade due to legal restrictions"). Surface that as its own code so the UI
 * can explain instead of showing a generic failure.
 */
function wrap(err) {
  let name = null;
  try {
    const d = err?.body?.details;
    name = (typeof d === "string" ? JSON.parse(d) : d)?.name ?? null;
  } catch {}
  if (name?.endsWith("NOT_AUTHORIZED_FOR_TRADE")) return Object.assign(new Error(err.message), { code: "RESTRICTED", side: name.startsWith("BUY") ? "buy" : "sell" });
  if (/insufficient.*liquidity|no liquidity|no available quotes|no route/i.test(err?.message ?? "")) return Object.assign(new Error("Not enough liquidity for this trade."), { code: "NO_LIQUIDITY" });
  return err;
}

// ─── 0x ───────────────────────────────────────────────────────────────────────

const zxParams = ({ chainId, sell, buy, sellAmount, taker, slippage }) => ({
  chainId,
  sellToken: sell.isNative ? NATIVE_TOKEN_ADDRESS : sell.address,
  buyToken: buy.isNative ? NATIVE_TOKEN_ADDRESS : buy.address,
  sellAmount: sellAmount.toString(),
  slippagePercentage: slippage,
  taker,
});

// ─── LI.FI ────────────────────────────────────────────────────────────────────

async function lifiQuote({ chainId, sell, buy, sellAmount, taker, slippage, recipient }) {
  const fromChain = sell.chainId ?? chainId;
  const toChain = buy.chainId ?? chainId;
  const q = await api.publicGet("/lifi/quote", {
    fromChain,
    toChain,
    fromToken: sell.isNative ? ZERO : sell.address,
    toToken: buy.isNative ? ZERO : buy.address,
    fromAmount: sellAmount.toString(),
    fromAddress: taker || PLACEHOLDER_TAKER,
    toAddress: recipient, // payments: deliver to someone else
    slippage,
  });
  const est = q.estimate ?? {};
  const tx = q.transactionRequest ?? {};
  const steps = q.includedSteps?.length ? q.includedSteps : [q];
  const gasWei = (est.gasCosts ?? []).reduce((s, g) => s + BigInt(g.amount ?? 0), 0n);
  return {
    router: "lifi",
    fromChain,
    toChain,
    crossChain: fromChain !== toChain,
    etaSec: est.executionDuration ?? null,
    tool: q.toolDetails?.name ?? q.tool ?? null,
    sellAmount: q.action?.fromAmount ?? sellAmount.toString(),
    buyAmount: est.toAmount,
    minBuyAmount: est.toAmountMin,
    allowanceTarget: sell.isNative ? null : est.approvalAddress ?? null,
    transaction: tx.to ? { to: tx.to, data: tx.data, value: tx.value ?? "0x0", gas: tx.gasLimit } : null,
    route: {
      tokens: [{ symbol: sell.symbol }, { symbol: buy.symbol }],
      fills: steps.map((s) => ({ source: s.toolDetails?.name ?? s.tool ?? "LI.FI" })),
    },
    // LI.FI reports fees in USD; the ticket shows them as one line.
    feesUsd: (est.feeCosts ?? []).reduce((s, f) => s + Number(f.amountUSD ?? 0), 0),
    totalNetworkFee: gasWei ? gasWei.toString() : null,
    liquidityAvailable: true,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const routerOf = (chainId) => getChainById(chainId)?.swap?.router ?? "0x";
export const getBridgeStatus = ({ txHash, fromChain, toChain }) => api.publicGet("/lifi/status", { txHash, fromChain, toChain });

/** Different chains → LI.FI bridge+swap; same chain → that chain's router. */
const wantsLifi = (p) => (p.sell.chainId ?? p.chainId) !== (p.buy.chainId ?? p.chainId) || routerOf(p.chainId) === "lifi";

export const getSwapTokens = async (chainId) => (await api.publicGet("/swap/tokens", { chainId })).tokens;

export async function getSwapPrice(p) {
  try {
    if (wantsLifi(p)) return await lifiQuote(p);
    return { router: "0x", ...(await api.publicGet("/swap/price", zxParams(p))) };
  } catch (e) {
    throw wrap(e);
  }
}

export async function getSwapQuote(p) {
  try {
    if (wantsLifi(p)) return await lifiQuote(p);
    return { router: "0x", ...(await api.publicGet("/swap/quote", zxParams(p))) };
  } catch (e) {
    throw wrap(e);
  }
}
