// lib/portfolio.js — the cross-chain grouping both the web and the mobile app
// use for the "All networks" view.
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupPortfolio } from "@/lib/portfolio";
import { indexRegistry } from "@/lib/assets";
import { getChainById } from "@/lib/config";

const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const reg = indexRegistry({
  assets: [
    { id: "eth", symbol: "ETH", name: "Ether", deployments: { 8453: { address: NATIVE, decimals: 18, native: true }, 42161: { address: NATIVE, decimals: 18, native: true } } },
    {
      id: "usdc",
      symbol: "USDC",
      name: "USD Coin",
      deployments: {
        8453: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
        42161: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      },
    },
  ],
});
const base = getChainById(8453);
const arb = getChainById(42161);
const usdcBase = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const usdcArb = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

test("groups the same asset across chains and prices it", () => {
  const { assets, totalUsd } = groupPortfolio({
    chains: [base, arb],
    reg,
    natives: [{ wei: (10n ** 18n).toString() }, { wei: (5n * 10n ** 17n).toString() }],
    erc20s: [{ [usdcBase]: "2500000" }, { [usdcArb]: "1500000", "0x000000000000000000000000000000000000dead": "999" }],
    nativePrices: { 8453: { usd: 3000 }, 42161: { usd: 3000 } },
    tokenPrices: [{ [usdcBase]: { price: 1 } }, { [usdcArb]: { price: 1 } }],
  });
  assert.deepEqual(assets.map((a) => a.asset.id), ["eth", "usdc"]); // by USD value
  const eth = assets[0];
  assert.equal(eth.amount, 1.5);
  assert.equal(eth.usd, 4500);
  assert.deepEqual(eth.chains.map((r) => r.chain.id), [8453, 42161]);
  const usdc = assets[1];
  assert.equal(usdc.amount, 4);
  assert.equal(usdc.usd, 4);
  assert.equal(totalUsd, 4504);
  assert.ok(!assets.some((a) => a.asset.id === "unknown"), "unlisted tokens are left out");
});

test("unpriced holdings count toward amounts but not the total", () => {
  const { assets, totalUsd } = groupPortfolio({
    chains: [base],
    reg,
    natives: [null],
    erc20s: [{ [usdcBase]: "1000000" }],
    nativePrices: {},
    tokenPrices: [null],
  });
  assert.equal(assets[0].amount, 1);
  assert.equal(assets[0].usd, null);
  assert.equal(totalUsd, null);
});

test("empty wallet and missing registry", () => {
  assert.deepEqual(groupPortfolio({ chains: [base], reg, natives: [{ wei: "0" }], erc20s: [{}], nativePrices: {}, tokenPrices: [] }), { assets: [], totalUsd: null });
  assert.deepEqual(groupPortfolio({ chains: [base], reg: null, natives: [], erc20s: [], nativePrices: {}, tokenPrices: [] }), { assets: [], totalUsd: null });
});

test("zeroNatives lists every chain's gas token at 0", () => {
  const polygon = getChainById(137); // no native entry in this registry → synthesized
  const { assets, totalUsd } = groupPortfolio({
    chains: [base, arb, polygon],
    reg,
    natives: [{ wei: "0" }, null, { wei: "0" }],
    erc20s: [{}, {}, {}],
    nativePrices: { 8453: { usd: 3000 }, 42161: { usd: 3000 } },
    tokenPrices: [],
    zeroNatives: true,
  });
  const eth = assets.find((a) => a.asset.symbol === "ETH");
  assert.equal(eth.amount, 0);
  assert.deepEqual(eth.chains.map((r) => r.chain.id).sort((a, b) => a - b), [8453, 42161]);
  const pol = assets.find((a) => a.asset.id === "native:137");
  assert.equal(pol.amount, 0);
  assert.equal(pol.chains[0].isNative, true);
  assert.equal(totalUsd, 0);
});
