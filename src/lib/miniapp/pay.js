// lib/miniapp/pay.js — tribe.pay({ to, asset, amount, chainId }): a mini-app
// asks for a payment; Tribe works out how. Builds an <ActionTxSheet> spec.
//
//   1. resolve the asset in the registry ("usdc" or { chainId, address })
//   2. enough of it on the destination chain → plain transfer
//   3. otherwise bridge the same asset from the chain where the user holds
//      the most, delivered straight to the recipient (LI.FI). The quote is
//      re-sized once so the recipient gets at least `amount`.
// Different-asset payments (pay a USDC invoice with ETH) aren't offered yet.
import { formatUnits, isAddress, parseUnits } from "ethers";
import { getChainById } from "@/lib/config";
import { buildTransfer } from "@/lib/chain/tx";
import { readAllowance } from "@/lib/dao/chain";
import { call, tokenIface } from "@/lib/dao/contracts";
import { assetOf } from "@/lib/assets";
import { getSwapQuote } from "@/lib/swap/api";
import { formatBalance } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";

const bad = (message, code = -32602) => Object.assign(new Error(message), { code });

/** The token record a payment sends on `chainId` (Arc's USDC → its ERC-20 interface). */
function tokenOn(asset, chainId) {
  const d = asset.deployments[chainId];
  if (!d) return null;
  if (d.native && d.erc20) return { address: d.erc20.address, decimals: d.erc20.decimals, isNative: false, chainId, symbol: d.symbol ?? asset.symbol };
  return { address: d.address, decimals: d.decimals, isNative: !!d.native, chainId, symbol: d.symbol ?? asset.symbol };
}

/**
 * @param req   { to, asset, amount, chainId, memo }
 * @param ctx   { reg, sources (holdingsAsTokens), owner, appName, defaultChainId }
 * @returns     { spec, chainId, crossChain }
 */
export async function buildPayment(req, ctx) {
  const { reg, sources, owner, appName, defaultChainId } = ctx;
  if (!isAddress(req?.to)) throw bad("tribe.pay: `to` must be an address");
  const asset =
    typeof req.asset === "string" ? reg.byId.get(req.asset.toLowerCase()) : req.asset?.chainId ? assetOf(reg, req.asset.chainId, req.asset.address) : null;
  if (!asset) throw bad("tribe.pay: unknown asset — use a registry id (e.g. \"usdc\") or { chainId, address }");
  const destId = Number(req.chainId ?? req.asset?.chainId ?? defaultChainId);
  const dest = getChainById(destId);
  const destToken = tokenOn(asset, destId);
  if (!dest || !destToken) throw bad(`tribe.pay: ${asset.symbol} isn't available on chain ${destId}`);

  let amountRaw;
  try {
    amountRaw = parseUnits(String(req.amount), destToken.decimals);
  } catch {
    throw bad("tribe.pay: invalid amount");
  }
  if (amountRaw <= 0n) throw bad("tribe.pay: amount must be positive");
  const human = `${formatBalance(formatUnits(amountRaw, destToken.decimals))} ${asset.symbol}`;
  const memo = req.memo ? String(req.memo).slice(0, 140) : null;
  const details = [
    { label: "To", value: formatAddress(req.to, 6) },
    { label: "Amount", value: human },
    { label: "Network", value: dest.name },
    ...(memo ? [{ label: "For", value: memo }] : []),
  ];

  // Holdings of this asset, per chain, in each chain's units.
  const held = sources.filter((s) => s.assetId === asset.id);
  const local = held.find((s) => s.chainId === destId);
  if (local && local.raw >= amountRaw) {
    const request = buildTransfer({ from: owner, to: req.to, amount: formatUnits(amountRaw, destToken.decimals), token: destToken });
    return {
      chainId: destId,
      crossChain: false,
      spec: { chain: dest, title: `Pay ${human}`, description: `${appName} is requesting a payment.`, details, steps: [{ label: `Send ${human}`, request }] },
    };
  }

  // Bridge the same asset from wherever the user holds the most of it.
  const candidates = held
    .filter((s) => s.chainId !== destId && getChainById(s.chainId)?.swap)
    .map((s) => ({ s, needed: (amountRaw * 10n ** BigInt(s.decimals)) / 10n ** BigInt(destToken.decimals) }))
    .filter(({ s, needed }) => s.raw >= needed)
    .sort((a, b) => (b.s.usd ?? 0) - (a.s.usd ?? 0));
  if (!candidates.length) throw Object.assign(new Error(`Not enough ${asset.symbol} on any network to pay ${human}.`), { code: 4001, reason: "INSUFFICIENT" });

  const { s: src, needed } = candidates[0];
  const srcChain = getChainById(src.chainId);
  const quoteFor = (fromRaw) =>
    getSwapQuote({ chainId: destId, sell: src, buy: destToken, sellAmount: fromRaw, taker: owner, recipient: req.to, slippage: 0.005 });
  let fromRaw = (needed * 1005n) / 1000n; // bridge fees
  let quote = await quoteFor(fromRaw);
  if (BigInt(quote.minBuyAmount ?? 0) < amountRaw) {
    fromRaw = (fromRaw * amountRaw * 1003n) / (BigInt(quote.minBuyAmount || 1) * 1000n);
    if (fromRaw > src.raw) throw Object.assign(new Error(`Not enough ${asset.symbol} on ${srcChain.name} to cover bridge fees.`), { code: 4001 });
    quote = await quoteFor(fromRaw);
  }
  if (!quote.transaction) throw new Error("The bridge didn't return a transaction. Try again.");

  const steps = [];
  if (!src.isNative && quote.allowanceTarget) {
    const allowance = await readAllowance(srcChain, src.address, owner, quote.allowanceTarget);
    if (allowance < fromRaw) steps.push({ label: `Allow LI.FI to spend ${asset.symbol} on ${srcChain.shortName}`, request: call(tokenIface, src.address, "approve", [quote.allowanceTarget, fromRaw]) });
  }
  steps.push({ label: `Bridge to ${dest.shortName} and pay`, request: { to: quote.transaction.to, data: quote.transaction.data, value: BigInt(quote.transaction.value ?? 0) } });
  return {
    chainId: destId,
    crossChain: true,
    spec: {
      chain: srcChain,
      title: `Pay ${human}`,
      description: `${appName} is requesting a payment. You pay from ${srcChain.name}; it arrives on ${dest.name}${quote.etaSec ? ` in about ${Math.max(1, Math.round(quote.etaSec / 60))} min` : ""}.`,
      details: [...details, { label: "You send", value: `${formatBalance(formatUnits(fromRaw, src.decimals))} ${asset.symbol} on ${srcChain.shortName}` }, { label: "Recipient gets at least", value: `${formatBalance(formatUnits(BigInt(quote.minBuyAmount), destToken.decimals))} ${asset.symbol}` }],
      steps,
    },
  };
}
