"use client";
// hooks/daos.js — cached DAO data, the web side of useDaoFactory (list),
// useDAOContract (DAO + proposals + member) and useLaunchDAO (fees).
// The DAO page reads our backend first (lib/dao/snapshot.js — the indexer
// keeps it current) and the chain when the backend can't answer or right
// after this user interacted with the DAO. Member data (balance, delegation,
// ballots) and every transaction stay client-side, on-chain.
//   ["public", "dao", …]        list, contract state, proposals — same for everyone
//   ["user", uid, "dao", …]     the signed-in account's balance, delegation, ballots
// On-chain values stay as BigInt; IndexedDB structured clone keeps them intact.
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { invalidateEverywhere } from "@/lib/cache/queryClient";
import { getChainById } from "@/lib/config";
import { getDaoRecord, getDaos } from "@/lib/dao/api";
import { getFactoryAddress } from "@/lib/dao/contracts";
import { readDao, readFactoryFees, readMember, readProposals } from "@/lib/dao/chain";
import { fetchDaoSnapshot, fetchProposalsSnapshot, preferChain, prefersChain } from "@/lib/dao/snapshot";
import { useErc20Raw } from "@/hooks/wallet";

const SEC = 1000;
const MIN = 60 * SEC;
const lc = (a) => a?.toLowerCase();

export const daoKeys = {
  list: (chainId) => ["public", "dao", "list", chainId],
  one: (chainId, address) => ["public", "dao", chainId, lc(address)],
  info: (chainId, address) => ["public", "dao", chainId, lc(address), "info"],
  record: (chainId, address) => ["public", "dao", chainId, lc(address), "record"],
  proposals: (chainId, address) => ["public", "dao", chainId, lc(address), "proposals"],
  member: (uid, chainId, address) => ["user", uid, "dao", chainId, lc(address)],
  fees: (chainId) => ["public", "dao", "fees", chainId],
};

const noRetryMissing = (count, err) => err?.code !== "NOT_A_DAO" && count < 2;

/** Backend snapshot (decimal strings) → the same shape readDao returns (BigInts). */
const daoFromSnapshot = (s) => ({
  address: s.address,
  chainId: s.chainId,
  owner: s.owner,
  name: s.name,
  imageUrl: s.imageUrl,
  quorumPercentage: s.quorumPercentage,
  proposalThreshold: BigInt(s.proposalThreshold),
  votingPeriodHours: s.votingPeriodHours,
  timelockPeriodHours: s.timelockPeriodHours,
  proposalCount: s.proposalCount,
  token: { ...s.token, totalSupply: BigInt(s.token.totalSupply) },
  treasury: BigInt(s.treasury),
  source: "backend",
});

const proposalFromSnapshot = (p) => ({
  ...p,
  amount: BigInt(p.amount),
  newValue: BigInt(p.newValue),
  forVotes: BigInt(p.forVotes),
  againstVotes: BigInt(p.againstVotes),
  abstainVotes: BigInt(p.abstainVotes),
});

/** Backend first; the chain when it can't answer or right after an interaction. */
async function loadDao(chain, address) {
  if (!prefersChain(chain.id, address)) {
    const snap = await fetchDaoSnapshot(chain.id, address);
    if (snap) return daoFromSnapshot(snap);
  }
  return { ...(await readDao(chain, address)), source: "chain" };
}

async function loadProposals(chain, address, count) {
  if (!count) return [];
  if (!prefersChain(chain.id, address)) {
    const rows = await fetchProposalsSnapshot(chain.id, address, count);
    if (rows) return rows.map(proposalFromSnapshot);
  }
  return readProposals(chain, address, count);
}

/** Every DAO on a chain. Polls like the app's 20 s loop, but only while visible. */
export const useDaoList = (chainId) =>
  useQuery({
    queryKey: daoKeys.list(chainId),
    queryFn: () => getDaos(chainId),
    enabled: !!getFactoryAddress(chainId),
    staleTime: 20 * SEC,
    refetchInterval: 60 * SEC,
  });

/** Off-chain record from the backend (description + links). Optional. */
export const useDaoRecord = (chainId, address) =>
  useQuery({
    queryKey: daoKeys.record(chainId, address),
    queryFn: () => getDaoRecord(chainId, address).catch(() => null),
    staleTime: 10 * MIN,
  });

/** Contract settings, governance token and treasury. */
export function useDaoInfo(chainId, address) {
  const chain = getChainById(chainId);
  return useQuery({
    queryKey: daoKeys.info(chainId, address),
    queryFn: () => loadDao(chain, address),
    enabled: !!(chain && address),
    staleTime: MIN,
    retry: noRetryMissing,
  });
}

/** All proposals, newest first. Re-read whenever the count moves. */
export function useProposals(chainId, address, count) {
  const chain = getChainById(chainId);
  return useQuery({
    queryKey: [...daoKeys.proposals(chainId, address), count],
    queryFn: () => loadProposals(chain, address, count),
    enabled: !!(chain && address) && count !== undefined,
    staleTime: 30 * SEC,
    refetchInterval: 60 * SEC,
    placeholderData: (prev) => prev,
  });
}

/** The signed-in wallet's standing (balance, delegation, ballots on `proposalIds`). */
export function useDaoMember(chainId, info, proposalIds) {
  const { user } = useAuth();
  const { address: me } = useWallet();
  const chain = getChainById(chainId);
  return useQuery({
    queryKey: [...daoKeys.member(user?.uid, chainId, info?.address), me, proposalIds?.join(",")],
    queryFn: () => readMember(chain, info, me, proposalIds),
    enabled: !!(chain && info && me && user?.uid),
    staleTime: 20 * SEC,
    placeholderData: (prev) => prev,
  });
}

/** One hook for a DAO screen: info + proposals + member, plus a refresher. */
export function useDao(chainId, address) {
  const info = useDaoInfo(chainId, address);
  const proposals = useProposals(chainId, address, info.data?.proposalCount);
  const ids = useMemo(() => (proposals.data || []).map((p) => p.id), [proposals.data]);
  const member = useDaoMember(chainId, info.data, ids);
  const refresh = useRefreshDao(chainId, address);
  return { info, proposals, member, refresh };
}

/**
 * Re-read a DAO everywhere after a transaction (all tabs) — from the chain:
 * the indexer needs a few blocks to catch up with what this user just did.
 */
export function useRefreshDao(chainId, address) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useCallback(async () => {
    preferChain(chainId, address);
    await Promise.all([
      invalidateEverywhere(qc, daoKeys.one(chainId, address)),
      invalidateEverywhere(qc, daoKeys.member(user?.uid, chainId, address)),
    ]);
  }, [qc, chainId, address, user?.uid]);
}

/** DAOFactory creation fees on a chain. */
export function useFactoryFees(chainId) {
  const chain = getChainById(chainId);
  return useQuery({
    queryKey: daoKeys.fees(chainId),
    queryFn: () => readFactoryFees(chain),
    enabled: !!chain,
    staleTime: 10 * MIN,
  });
}

/**
 * Governance-token addresses the wallet holds — the web version of
 * useMyDAOs (DAOs whose token you hold). Lowercase set.
 */
export function useHeldTokenSet() {
  const erc20 = useErc20Raw();
  return useMemo(() => new Set(Object.keys(erc20.data || {})), [erc20.data]);
}
