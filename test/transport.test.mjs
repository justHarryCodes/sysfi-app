// The RPC transport keeps Alchemy as the last resort: every healthy public
// node first, Alchemy only after they fail; indexer calls try the backend
// proxy before Alchemy.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_ALCHEMY_KEY = "test-key";
const { ResilientProvider } = await import("../src/lib/chain/transport.js");

const realFetch = globalThis.fetch;
let calls = [];
let behaviour = {}; // url-substring → "fail" | result
before(() => {
  globalThis.fetch = async (url, init) => {
    calls.push(url);
    const rule = Object.entries(behaviour).find(([k]) => url.includes(k))?.[1];
    if (rule === "fail") throw new TypeError("network error");
    const body = JSON.parse(init.body);
    const list = Array.isArray(body) ? body : [body];
    const answer = list.map((p) => ({ jsonrpc: "2.0", id: p.id, result: rule ?? "0x1" }));
    return { status: 200, json: async () => (Array.isArray(body) ? answer : answer[0]) };
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

const chain = () => ({ id: 8453, name: "Base", rpcs: ["https://public-a", "https://public-b"], alchemy: "base-mainnet" });
const send = (p, method = "eth_blockNumber") => p.send(method, []);

test("public nodes answer → Alchemy is never called", async () => {
  calls = [];
  behaviour = {};
  await send(new ResilientProvider(chain()));
  assert.ok(calls.every((u) => !u.includes("alchemy.com")), calls.join(", "));
});

test("Alchemy only after every public node failed", async () => {
  calls = [];
  behaviour = { "public-a": "fail", "public-b": "fail", "alchemy.com": "0x2a" };
  const r = await send(new ResilientProvider(chain()));
  assert.equal(r, "0x2a");
  const ia = calls.findIndex((u) => u.includes("public-a"));
  const ib = calls.findIndex((u) => u.includes("public-b"));
  const ix = calls.findIndex((u) => u.includes("alchemy.com"));
  assert.ok(ia >= 0 && ib >= 0 && ix > ia && ix > ib, calls.join(", "));
});

test("second public node rescues the first → still no Alchemy", async () => {
  calls = [];
  behaviour = { "public-a": "fail" };
  await send(new ResilientProvider(chain()));
  assert.ok(calls.some((u) => u.includes("public-b")));
  assert.ok(calls.every((u) => !u.includes("alchemy.com")));
});
