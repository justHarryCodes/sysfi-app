// lib/swap/actions.js — <ActionTxSheet> spec for a swap (SwapConfirmModal's
// approve → swap). Approves exactly the amount being sold — the app grants an
// unlimited (MaxUint256) allowance, which leaves the whole balance exposed to
// the spender if it's ever compromised.
import { formatUnits } from "ethers";
import { formatBalance } from "@/lib/format";
import { readAllowance } from "@/lib/dao/chain";
import { call, tokenIface } from "@/lib/dao/contracts";

const amt = (raw, t) => `${formatBalance(formatUnits(BigInt(raw), t.decimals))} ${t.symbol}`;

/** "WETH → USDG → cbBTC" and the venues the router goes through. */
export function describeRoute(quote) {
  const tokens = quote?.route?.tokens?.map((t) => t.symbol) ?? [];
  const sources = [...new Set((quote?.route?.fills ?? []).map((f) => f.source.replace(/_/g, " ")))];
  return { path: tokens.join(" → "), sources };
}

/**
 * `chain` is where the user signs (the sell token's chain); for cross-chain
 * trades `toChain` is where the bought token arrives.
 */
export async function swapAction(chain, quote, sell, buy, owner, { side, toChain }) {
  const steps = [];
  const spender = quote.issues?.allowance?.spender ?? quote.allowanceTarget;
  if (!sell.isNative && spender) {
    const allowance = await readAllowance(chain, sell.address, owner, spender);
    if (allowance < BigInt(quote.sellAmount)) {
      steps.push({ label: `Allow ${quote.router === "lifi" ? "LI.FI" : "0x"} to spend ${amt(quote.sellAmount, sell)}`, request: call(tokenIface, sell.address, "approve", [spender, BigInt(quote.sellAmount)]) });
    }
  }
  const tx = quote.transaction;
  steps.push({ label: side === "buy" ? `Buy ${buy.symbol}` : `Sell ${sell.symbol}`, request: { to: tx.to, data: tx.data, value: BigInt(tx.value ?? 0) } });

  const { path, sources } = describeRoute(quote);
  return {
    chain, // ActionTxSheet signs on the source chain
    title: side === "buy" ? `Buy ${buy.symbol}` : `Sell ${sell.symbol}`,
    description: quote.crossChain
      ? `Sent from ${chain.name}, delivered on ${toChain?.name}${quote.etaSec ? ` in about ${Math.max(1, Math.round(quote.etaSec / 60))} min` : ""}. You'll get at least the minimum below, or your funds are refunded.`
      : "Prices move — you'll get at least the minimum below or the swap reverts.",
    details: [
      { label: "You pay", value: amt(quote.sellAmount, sell) },
      { label: "You receive", value: `≈ ${amt(quote.buyAmount, buy)}` },
      { label: "Minimum received", value: amt(quote.minBuyAmount, buy) },
      ...(quote.fees?.integratorFee?.amount ? [{ label: "Sysfi fee (0.3%)", value: amt(quote.fees.integratorFee.amount, buy) }] : []),
      ...(path ? [{ label: "Route", value: `${path}${sources.length ? ` · ${sources.join(", ")}` : ""}` }] : []),
    ],
    steps,
  };
}
