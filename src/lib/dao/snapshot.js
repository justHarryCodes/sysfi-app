// lib/dao/snapshot.js — DAO page data from our backend, which the indexer keeps
// in step with the chain (it re-reads a DAO whenever the DAO emits an event).
// One request instead of ~15 RPC calls + one per proposal.
//
// Shared by the web app and the mobile app (metro maps "@/lib/*" here). The
// callers decide the fallback: every function returns null when the backend
// can't answer — unreachable, slow, not indexed yet, incomplete — and the
// caller then reads the chain itself.
//
// Interactions (vote, propose, delegate, execute…) are signed and sent by the
// apps, never the backend. Right after one, call preferChain(): for a short
// while that DAO is read straight from the chain, so the result shows before
// the indexer has caught up.
import { getAddress } from "ethers";
import { APP_CONFIG } from "@/lib/config";

const TIMEOUT_MS = 4000;
const CHAIN_AFTER_TX_MS = 90_000;

const key = (chainId, address) => `${chainId}:${String(address).toLowerCase()}`;
const chainUntil = new Map();

/** After an interaction: read this DAO from the chain for the next `ms`. */
export function preferChain(chainId, address, ms = CHAIN_AFTER_TX_MS) {
  if (address) chainUntil.set(key(chainId, address), Date.now() + ms);
}

export const prefersChain = (chainId, address) => (chainUntil.get(key(chainId, address)) ?? 0) > Date.now();

const checksum = (a) => {
  try {
    return a ? getAddress(a) : a;
  } catch {
    return a;
  }
};
const str = (v, d = "0") => (v === null || v === undefined || v === "" ? d : String(v));

async function getData(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${APP_CONFIG.BACKEND_URL}${path}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success === false ? null : json?.data ?? null;
  } catch {
    return null; // unreachable or too slow → caller reads the chain
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The DAO's settings, governance token and treasury, big numbers as decimal
 * strings — or null. Also carries the backend record (offChain profile,
 * creator, indexing info).
 */
export async function fetchDaoSnapshot(chainId, address) {
  const d = await getData(`/daos/${chainId}/${address}`);
  if (!d || !d.state_updated_at || d.owner == null) return null; // listed, but page data not indexed yet
  return {
    address: checksum(d.dao_address),
    chainId: Number(d.chain_id),
    owner: checksum(d.owner),
    name: d.dao_name,
    imageUrl: d.image_url ?? "",
    quorumPercentage: Number(d.quorum),
    proposalThreshold: str(d.threshold),
    votingPeriodHours: Number(d.voting_period_hours),
    timelockPeriodHours: Number(d.timelock_period_hours),
    proposalCount: Number(d.proposal_count ?? 0),
    token: {
      address: checksum(d.token_address),
      name: d.token_name ?? "",
      symbol: d.token_symbol ?? "TOKEN",
      decimals: Number(d.token_decimals ?? 18),
      totalSupply: str(d.token_total_supply),
    },
    treasury: str(d.treasury),
    creator: checksum(d.creator ?? d.offChain?.creator ?? null),
    offChain: d.offChain ?? null,
    stateBlock: d.state_block == null ? null : Number(d.state_block),
    stateUpdatedAt: d.state_updated_at,
  };
}

/**
 * Every proposal, newest first, big numbers as decimal strings — or null,
 * also when the backend has fewer than `expectedCount` (still catching up).
 */
export async function fetchProposalsSnapshot(chainId, address, expectedCount) {
  const rows = await getData(`/daos/${chainId}/${address}/proposals`);
  if (!Array.isArray(rows)) return null;
  if (expectedCount !== undefined && rows.length < Number(expectedCount)) return null;
  return rows.map((p) => ({
    id: Number(p.proposal_id),
    title: p.title,
    description: p.description,
    amount: str(p.amount),
    recipient: checksum(p.recipient),
    proposalType: Number(p.proposal_type),
    protocolAction: Number(p.protocol_action),
    newValue: str(p.new_value),
    newTokenAddress: checksum(p.new_token_address),
    forVotes: str(p.for_votes),
    againstVotes: str(p.against_votes),
    abstainVotes: str(p.abstain_votes),
    status: Number(p.status),
    timestamp: Number(p.created_ts),
    queuedTimestamp: Number(p.queued_ts),
    creator: checksum(p.creator),
  }));
}

