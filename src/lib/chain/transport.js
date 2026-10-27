// lib/chain/transport.js — public RPCs first, Alchemy only when they're slow
// or failing. An ethers JsonRpcProvider whose `_send` (the documented
// override point) spreads requests over a chain's endpoints:
//
//   reads    healthiest public endpoint; if it hasn't answered within
//            HEDGE_MS, race the fallback (Alchemy, else the next public
//            node) and take whichever answers first
//   failures network errors, HTTP 429/5xx and rate-limit JSON-RPC errors
//            put the endpoint in a cooldown and move to the next one.
//            Contract errors (reverts, insufficient funds) are real answers
//            and pass straight through.
//   writes   eth_sendRawTransaction is never raced — it fails over only on
//            transport errors, and "already known" from a second node
//            counts as success
//   alchemy_* indexer methods go to Alchemy only
import { JsonRpcProvider, Network, keccak256 } from "ethers";
import { alchemyUrl } from "@/lib/config";

const HEDGE_MS = 2500; // "too much delay" before the fallback joins in
const ATTEMPT_TIMEOUT_MS = 10_000;
const COOLDOWN_MS = 30_000;

const RATE_LIMIT = /rate.?limit|too many requests|limit exceeded|exceeded.*(quota|capacity)|throttl|upstream|temporar|try again later|capacity/i;

/** AbortSignal.any with a fallback for browsers that predate it. */
function anySignal(signals) {
  if (typeof AbortSignal.any === "function") return AbortSignal.any(signals);
  const ctrl = new AbortController();
  for (const s of signals) {
    if (s.aborted) return ctrl.abort(s.reason), ctrl.signal;
    s.addEventListener("abort", () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}
/**
 * AbortSignal.timeout with a fallback for runtimes that lack it. React Native
 * (Hermes) has neither AbortSignal.timeout nor DOMException, so the reason is
 * a plain Error named like the DOM one (#post checks the name).
 */
const timeoutSignal = (ms) => {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(Object.assign(new Error("timeout"), { name: "TimeoutError" })), ms);
  return ctrl.signal;
};

class TransportError extends Error {
  constructor(message, endpoint) {
    super(message);
    this.code = "RPC_UNAVAILABLE";
    this.endpoint = endpoint;
  }
}

export class ResilientProvider extends JsonRpcProvider {
  #endpoints;
  #alchemy;

  constructor(chain) {
    const network = Network.from(chain.id);
    const publics = chain.rpcs ?? [];
    const alchemy = alchemyUrl(chain);
    // Public nodes cap batch sizes; keep batches small.
    super(publics[0] ?? alchemy, network, { staticNetwork: network, batchMaxCount: 10, batchStallTime: 8 });
    this.#endpoints = publics.map((url) => ({ url, kind: "public", fails: 0, until: 0, ms: 800 }));
    this.#alchemy = alchemy ? { url: alchemy, kind: "alchemy", fails: 0, until: 0, ms: 800 } : null;
    this.chainConfig = chain;
  }

  /** True when alchemy_* indexer methods are available on this chain. */
  get hasIndexer() {
    return !!this.#alchemy;
  }

  /** Public endpoints that aren't cooling down, fastest first; then the rest. */
  #ranked() {
    const now = Date.now();
    const healthy = this.#endpoints.filter((e) => e.until <= now).sort((a, b) => a.ms - b.ms);
    const cooling = this.#endpoints.filter((e) => e.until > now).sort((a, b) => a.until - b.until);
    return [...healthy, ...cooling];
  }

  #penalise(e) {
    e.fails += 1;
    e.until = Date.now() + COOLDOWN_MS * Math.min(e.fails, 6);
  }

  async #post(e, payload, signal) {
    const started = performance.now();
    let res;
    try {
      res = await fetch(e.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: anySignal([signal, timeoutSignal(ATTEMPT_TIMEOUT_MS)]),
      });
    } catch (err) {
      if (signal.aborted) throw err;
      this.#penalise(e);
      throw new TransportError(err?.name === "TimeoutError" ? "timeout" : "network error", e.kind);
    }
    if (res.status === 429 || res.status >= 500 || res.status === 403 || res.status === 401) {
      this.#penalise(e);
      throw new TransportError(`HTTP ${res.status}`, e.kind);
    }
    let json;
    try {
      json = await res.json();
    } catch {
      this.#penalise(e);
      throw new TransportError("bad response", e.kind);
    }
    const items = Array.isArray(json) ? json : [json];
    // A batch answered as one error object, or per-item throttling.
    if (!Array.isArray(json) && Array.isArray(payload)) {
      this.#penalise(e);
      throw new TransportError(json?.error?.message || "batch rejected", e.kind);
    }
    if (items.some((r) => r?.error && (r.error.code === -32005 || r.error.code === 429 || RATE_LIMIT.test(r.error.message ?? "")))) {
      this.#penalise(e);
      throw new TransportError("rate limited", e.kind);
    }
    // Healthy: decay failures and track latency (EWMA).
    e.fails = 0;
    e.until = 0;
    e.ms = e.ms * 0.7 + (performance.now() - started) * 0.3;
    return items;
  }

  /** Try endpoints in order; after HEDGE_MS start the next one in parallel. */
  async #hedged(order, payload) {
    const ctrl = new AbortController();
    let lastErr;
    try {
      return await new Promise((resolve, reject) => {
        let next = 0;
        let pending = 0;
        let done = false;
        let timer;
        const launch = () => {
          if (done || next >= order.length) return;
          const e = order[next++];
          pending += 1;
          this.#post(e, payload, ctrl.signal).then(
            (r) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve(r);
            },
            (err) => {
              pending -= 1;
              lastErr = err;
              if (done) return;
              clearTimeout(timer);
              if (next < order.length) launch();
              else if (pending === 0) reject(lastErr);
            },
          );
          if (next < order.length) {
            clearTimeout(timer);
            timer = setTimeout(launch, HEDGE_MS);
          }
        };
        launch();
      });
    } finally {
      ctrl.abort(); // cancel the losers
    }
  }

  async _send(payload) {
    const list = Array.isArray(payload) ? payload : [payload];
    const indexer = list.filter((p) => p.method.startsWith("alchemy_"));
    if (!indexer.length) return this.#sendPublic(list, payload);
    if (indexer.length === list.length) return this.#sendIndexer(payload);

    // ethers batches whatever is in flight together; never let an indexer
    // call drag ordinary reads to Alchemy (or fail them when Alchemy refuses
    // the chain). Split, and turn an indexer failure into per-item errors so
    // only those callers reject.
    const rest = list.filter((p) => !p.method.startsWith("alchemy_"));
    const [a, b] = await Promise.all([
      this.#sendIndexer(indexer).catch((err) => indexer.map((p) => ({ id: p.id, jsonrpc: "2.0", error: { code: -32603, message: err.message } }))),
      this.#sendPublic(rest, rest),
    ]);
    const byId = new Map([...a, ...b].map((r) => [r.id, r]));
    return list.map((p) => byId.get(p.id) ?? { id: p.id, jsonrpc: "2.0", error: { code: -32603, message: "missing response" } });
  }

  #sendIndexer(payload) {
    if (!this.#alchemy) throw Object.assign(new Error(`No indexer for ${this.chainConfig.name}`), { code: "NO_INDEXER" });
    return this.#post(this.#alchemy, payload, new AbortController().signal);
  }

  #sendPublic(list, payload) {
    const publics = this.#ranked();
    // Fallback order: Alchemy right after the best public node (it's the
    // reliable one), then the remaining public nodes.
    const order = this.#alchemy ? [publics[0], this.#alchemy, ...publics.slice(1)].filter(Boolean) : publics;
    if (!order.length) throw Object.assign(new Error(`No RPC configured for ${this.chainConfig.name}`), { code: "NO_RPC" });
    if (list.some((p) => p.method === "eth_sendRawTransaction")) return this.#sendRaw(order, list);
    return this.#hedged(order, payload);
  }

  /** Broadcast without racing; a retried tx that already landed is success. */
  async #sendRaw(order, list) {
    let lastErr;
    for (const e of order) {
      try {
        const items = await this.#post(e, list.length === 1 ? list[0] : list, new AbortController().signal);
        return items.map((r, i) => {
          const msg = r?.error?.message ?? "";
          if (r?.error && /already known|known transaction|alreadyknown|already imported/i.test(msg)) {
            return { id: r.id, result: keccak256(list[i].params[0]) };
          }
          return r;
        });
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
}
