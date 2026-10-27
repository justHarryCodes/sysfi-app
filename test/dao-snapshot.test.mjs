// lib/dao/snapshot.js — DAO page data from the backend, shared by web + mobile.
// Every "can't answer" case must come back as null so the caller reads the chain.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getAddress } from "ethers";
import { fetchDaoSnapshot, fetchProposalsSnapshot, preferChain, prefersChain } from "@/lib/dao/snapshot";

const DAO = "0xa6ad000000000000000000000000000000000001";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const respond = (status, body) => async (url) => {
  respond.last = String(url);
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};

const row = {
  dao_address: DAO, chain_id: 4663, owner: "0xc0ffee0000000000000000000000000000000001", dao_name: "DOMS", image_url: "https://img",
  quorum: 51, threshold: "1000000000000000000000", voting_period_hours: 72, timelock_period_hours: 24, proposal_count: 2,
  token_address: "0xaa00000000000000000000000000000000000002", token_name: "Doms", token_symbol: "DOM", token_decimals: 18,
  token_total_supply: "1000000000000000000000000", treasury: "5000", creator: null, state_block: "123", state_updated_at: "2026-10-27T10:00:00Z",
  offChain: { description: "hi", creator: "0xc0ffee0000000000000000000000000000000001" },
};

test("maps the backend record to the page shape (strings for big numbers, checksummed addresses)", async () => {
  globalThis.fetch = respond(200, { success: true, data: row });
  const s = await fetchDaoSnapshot(4663, DAO);
  assert.match(respond.last, /\/daos\/4663\/0xa6ad/);
  assert.equal(s.name, "DOMS");
  assert.equal(s.owner, getAddress(row.owner));
  assert.equal(s.proposalThreshold, "1000000000000000000000");
  assert.equal(s.token.symbol, "DOM");
  assert.equal(s.token.totalSupply, "1000000000000000000000000");
  assert.equal(s.treasury, "5000");
  assert.equal(s.proposalCount, 2);
  assert.equal(s.creator, getAddress(row.owner), "falls back to the profile's creator");
  assert.equal(s.stateBlock, 123);
});

test("null whenever the backend can't answer → caller reads the chain", async () => {
  globalThis.fetch = respond(404, { success: false, error: "DAO not found" });
  assert.equal(await fetchDaoSnapshot(4663, DAO), null, "not indexed");
  globalThis.fetch = respond(200, { success: true, data: { ...row, state_updated_at: null, owner: null } });
  assert.equal(await fetchDaoSnapshot(4663, DAO), null, "listed but no page data yet");
  globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
  assert.equal(await fetchDaoSnapshot(4663, DAO), null, "unreachable");
  globalThis.fetch = respond(500, { success: false });
  assert.equal(await fetchProposalsSnapshot(4663, DAO), null, "server error");
});

test("proposals: mapped newest first; fewer than expected → null (still catching up)", async () => {
  const p = (id) => ({
    proposal_id: id, title: `P${id}`, description: "d", amount: "10", recipient: "0x0000000000000000000000000000000000000000", proposal_type: 0,
    protocol_action: 0, new_value: "0", new_token_address: "0x0000000000000000000000000000000000000000", for_votes: "700", against_votes: "1",
    abstain_votes: "0", status: 0, created_ts: "1700000000", queued_ts: "0", creator: "0xc0ffee0000000000000000000000000000000001",
  });
  globalThis.fetch = respond(200, { success: true, data: [p(2), p(1)] });
  const rows = await fetchProposalsSnapshot(4663, DAO, 2);
  assert.deepEqual(rows.map((r) => r.id), [2, 1]);
  assert.equal(rows[0].forVotes, "700");
  assert.equal(rows[0].timestamp, 1700000000);
  assert.equal(await fetchProposalsSnapshot(4663, DAO, 3), null);
});

test("after an interaction the DAO is read from the chain for a while", async () => {
  assert.equal(prefersChain(4663, DAO), false);
  preferChain(4663, DAO.toUpperCase().replace("0X", "0x"), 50);
  assert.equal(prefersChain(4663, DAO), true, "case-insensitive");
  assert.equal(prefersChain(8453, DAO), false, "per chain");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(prefersChain(4663, DAO), false, "window ends");
});
