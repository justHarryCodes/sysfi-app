// lib/dao/api.js — port of crypto-wallet/services/api/daoAPI.js (backend:
// api/v1/daos). The backend serves list rows from Redis/Postgres
// (snake_case) or straight from the factory (camelCase); `normaliseDao`
// folds both into one shape.
import { api } from "@/lib/api";

const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));

export function normaliseDao(r) {
  const address = r.daoAddress ?? r.dao_address ?? r.address;
  const created = r.createdAt ?? r.created_at;
  return {
    address,
    chainId: num(r.chainId ?? r.chain_id),
    name: r.daoName ?? r.dao_name ?? "Untitled DAO",
    imageUrl: r.imageUrl ?? r.image_url ?? "",
    genreId: num(r.genreId ?? r.genre_id) ?? (typeof r.genre === "number" ? r.genre : 11),
    tokenAddress: r.tokenAddress ?? r.token_address ?? null,
    quorum: num(r.quorum),
    threshold: r.threshold ?? null,
    votingPeriodHours: num(r.votingPeriodHours ?? r.voting_period_hours),
    timelockPeriodHours: num(r.timelockPeriodHours ?? r.timelock_period_hours),
    // Unix seconds — a number from the factory, a numeric string from Postgres.
    createdAt: /^\d+$/.test(String(created ?? "")) ? Number(created) * 1000 : created ? Date.parse(created) : null,
    offChain: r.offChain ?? null,
  };
}

/** Every DAO the backend has indexed for a chain (useDaoFactory: full fetch, no cursor). */
export const getDaos = async (chainId, limit = 500) =>
  ((await api.publicGet(`/daos/chain/${chainId}`, { offset: 0, limit })) || []).map(normaliseDao);

/** Cached record + off-chain metadata (description, links, creator). */
export const getDaoRecord = async (chainId, address) => {
  const r = await api.publicGet(`/daos/${chainId}/${address}`);
  return r ? normaliseDao(r) : null;
};

/**
 * Tells the backend about a freshly deployed DAO so it shows up in lists
 * straight away. Best-effort: the backend's chain sync finds it regardless.
 */
export const registerDao = ({ address, chainId, txHash, creator, offChain }) =>
  api
    .post("/daos/register", { daoAddress: address, chainId, txHash, creator, offChainData: offChain })
    .catch(() => null);
