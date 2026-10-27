// lib/dao/chain.js — reads straight from the DelegatedDAO / DAOFactory
// contracts, port of useDAOContract's fetchDAOInfo / fetchProposals /
// fetchUserInfo and useLaunchDAO's fee + token lookups. The provider batches
// calls issued in the same tick into one JSON-RPC request.
import { Contract, getAddress } from "ethers";
import { getProvider } from "@/lib/chain/rpc";
import { DAO_ABI, FACTORY_ABI, TOKEN_ABI, ZERO_ADDRESS, getFactoryAddress } from "./contracts";

const dao = (chain, address) => new Contract(address, DAO_ABI, getProvider(chain));
const erc20 = (chain, address) => new Contract(address, TOKEN_ABI, getProvider(chain));

/** Governance token metadata; tolerates tokens without name(). */
export async function readToken(chain, address) {
  const c = erc20(chain, address);
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    c.name().catch(() => ""),
    c.symbol().catch(() => "TOKEN"),
    c.decimals().catch(() => 18n),
    c.totalSupply(),
  ]);
  return { address: getAddress(address), name, symbol, decimals: Number(decimals), totalSupply };
}

/** DAO settings + governance token + treasury (the DAO's own token balance). */
export async function readDao(chain, address) {
  const provider = getProvider(chain);
  const code = await provider.getCode(address);
  if (!code || code === "0x") throw Object.assign(new Error("No DAO contract at this address."), { code: "NOT_A_DAO" });

  const c = dao(chain, address);
  const [owner, tokenAddress, name, imageUrl, quorum, threshold, votingHours, timelockHours, proposalCount] = await Promise.all([
    c.owner(),
    c.token(),
    c.name(),
    c.imageUrl(),
    c.quorumPercentage(),
    c.proposalThreshold(),
    c.votingPeriodHours(),
    c.timelockPeriodHours(),
    c.proposalCount(),
  ]);
  const [token, treasury] = await Promise.all([readToken(chain, tokenAddress), erc20(chain, tokenAddress).balanceOf(address)]);

  return {
    address: getAddress(address),
    chainId: chain.id,
    owner,
    name,
    imageUrl,
    quorumPercentage: Number(quorum),
    proposalThreshold: threshold,
    votingPeriodHours: Number(votingHours),
    timelockPeriodHours: Number(timelockHours),
    proposalCount: Number(proposalCount),
    token,
    treasury,
  };
}

const shapeProposal = (p) => ({
  id: Number(p.id),
  title: p.title,
  description: p.description,
  amount: p.amount,
  recipient: p.recipient,
  proposalType: Number(p.proposalType),
  protocolAction: Number(p.protocolAction),
  newValue: p.newValue,
  newTokenAddress: p.newTokenAddress,
  forVotes: p.forVotes,
  againstVotes: p.againstVotes,
  abstainVotes: p.abstainVotes,
  status: Number(p.status),
  timestamp: Number(p.timestamp),
  queuedTimestamp: Number(p.queuedTimestamp),
  creator: p.creator,
});

/** Every proposal, newest first (ids run 1..proposalCount). */
export async function readProposals(chain, address, count) {
  if (!count) return [];
  const c = dao(chain, address);
  const ids = Array.from({ length: count }, (_, i) => count - i);
  const rows = await Promise.all(ids.map((id) => c.getProposal(id)));
  return rows.map(shapeProposal);
}

export async function readProposal(chain, address, id) {
  return shapeProposal(await dao(chain, address).getProposal(id));
}

/**
 * The connected account's standing in a DAO: own balance, delegation in
 * either direction, and its ballot on each of `proposalIds`.
 */
export async function readMember(chain, info, user, proposalIds = []) {
  const c = dao(chain, info.address);
  const t = erc20(chain, info.token.address);
  const [balance, delegatee, delegatedAmount, delegatorCount, votesReceived, ...ballots] = await Promise.all([
    t.balanceOf(user),
    c.delegatorDelegatee(user),
    c.delegatorBalance(user),
    c.delegateeDelegatorCount(user),
    c.delegateeVotesReceived(user),
    ...proposalIds.map((id) => c.votesCast(user, id)),
  ]);
  const votes = {};
  proposalIds.forEach((id, i) => {
    if (Number(ballots[i])) votes[id] = Number(ballots[i]);
  });
  const isDelegating = delegatee !== ZERO_ADDRESS;
  return {
    address: getAddress(user),
    balance,
    delegatee: isDelegating ? delegatee : null,
    delegatedAmount,
    delegatorCount: Number(delegatorCount),
    votesReceived,
    // onlyInvestor: holds tokens, or has tokens parked with a delegate.
    isHolder: balance > 0n || delegatedAmount > 0n,
    canPropose: balance > 0n && balance >= info.proposalThreshold,
    votes,
  };
}

export const readCanExecute = (chain, address, id) => dao(chain, address).canExecute(id);

export const readAllowance = (chain, token, owner, spender) => erc20(chain, token).allowance(owner, spender);

/** DAOFactory fees + minimum timelock (useLaunchDAO.fetchCreationFees). */
export async function readFactoryFees(chain) {
  const address = getFactoryAddress(chain.id);
  if (!address) return null;
  const f = new Contract(address, FACTORY_ABI, getProvider(chain));
  const [ethFee, tokenFee, minTimelock, feeToken] = await Promise.all([
    f.ethDaoCreationFee(),
    f.tokenDaoCreationFee(),
    f.minTimelockHours(),
    f.feeToken(),
  ]);
  const hasFeeToken = feeToken && feeToken !== ZERO_ADDRESS;
  const feeTokenMeta = hasFeeToken ? await readToken(chain, feeToken).catch(() => null) : null;
  return { factory: address, ethFee, tokenFee, minTimelock: Number(minTimelock), feeToken: feeTokenMeta };
}
