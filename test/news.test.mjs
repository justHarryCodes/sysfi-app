// News on the device: timeline blending (web + mobile share it) and the
// card display helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { blendTimeline, cardsNeeded } from "../src/lib/news/blend.js";
import { domainOf, insightMetric, monogram, topicLabel, usdShort } from "../src/lib/news/format.js";

const posts = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
const cards = (n) => Array.from({ length: n }, (_, i) => (i % 3 === 2 ? { type: "insight", key: `insight:i${i}` } : { type: "story", key: `story:s${i}` }));
const shape = (items) => items.map((x) => (x.type === "post" ? "P" : x.type === "story" ? "S" : "I")).join("");

test("busy feed: a card after every 4 posts, never first, never same kind twice", () => {
  const out = blendTimeline(posts(16), cards(6));
  assert.equal(shape(out), "PPPPSPPPPSPPPPIPPPPS");
  for (let i = 1; i < out.length; i++) if (out[i].type !== "post") assert.notEqual(out[i].type, out[i - 1].type);
});

test("cold start: alternate, then the rest of the news; empty feed = all news", () => {
  assert.equal(shape(blendTimeline(posts(2), cards(5))), "PSPSISS");
  assert.equal(blendTimeline([], cards(4)).length, 4);
  assert.equal(shape(blendTimeline(posts(3), [])), "PPP");
});

test("cards needed grows with the feed", () => {
  assert.equal(cardsNeeded(0), 10);
  assert.equal(cardsNeeded(20), 5);
  assert.equal(cardsNeeded(40), 10);
});

test("display helpers", () => {
  assert.equal(domainOf("https://www.coindesk.com/markets/x"), "coindesk.com");
  assert.equal(domainOf("nope"), "");
  assert.equal(monogram("CoinDesk"), "CD");
  assert.equal(monogram("Decrypt"), "D");
  assert.equal(monogram("The Block"), "TB");
  assert.equal(monogram(""), "N");
  assert.equal(topicLabel(["markets", "etf"]), "Markets");
  assert.equal(topicLabel([]), null);
  assert.deepEqual(insightMetric({ kind: "protocol_tvl", data: { change1d: 12.4 } }), { value: "12%", direction: "up", label: "TVL · 24h" });
  assert.deepEqual(insightMetric({ kind: "chain_tvl", data: { change1d: -8.25 } }), { value: "8.3%", direction: "down", label: "TVL · 24h" });
  assert.deepEqual(insightMetric({ kind: "hack", data: { amount: 12.5e6 } }), { value: "$12.5M", direction: "down", label: "Lost" });
  assert.equal(insightMetric({ kind: "dex_volume", data: {} }), null);
  assert.equal(usdShort(2.1e9), "$2.1B");
});
