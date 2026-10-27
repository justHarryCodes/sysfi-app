// lib/dao/contracts.js — DelegatedDAO + DAOFactory (contracts/*.sol), the
// same contracts the app talks to through abi/DAOCoreAbi.json and
// abi/DAOFactoryAbi.json. Human-readable ABIs, enums and the vote maths.
import { Interface } from "ethers";
import { getChainById } from "@/lib/config";

/**
 * DAOFactory deployment for a chain — set per chain as `daoFactory` in
 * lib/chains.js. Deploying governance to another chain is that one field.
 */
export const getFactoryAddress = (chainId) => getChainById(chainId)?.daoFactory ?? null;

const DAO_INFO_TUPLE =
  "tuple(address daoAddress, address tokenAddress, uint8 genre, string daoName, string imageUrl, uint256 threshold, uint256 quorum, uint256 votingPeriodHours, uint256 timelockPeriodHours, uint256 createdAt)";

export const FACTORY_ABI = [
  `function createDAO(uint256 quorum, uint256 threshold, uint256 votingPeriodHours, uint256 timelockPeriodHours, address tokenAddress, uint8 genre, string imgUrl, string daoName, uint8 paymentMethod) payable returns (address)`,
  "function ethDaoCreationFee() view returns (uint256)",
  "function tokenDaoCreationFee() view returns (uint256)",
  "function feeToken() view returns (address)",
  "function minTimelockHours() view returns (uint256)",
  "function getTotalDAOs() view returns (uint256)",
  `function getDAO(address daoAddr) view returns (${DAO_INFO_TUPLE})`,
  "event DAOCreated(address indexed daoAddress, address indexed creator, address tokenAddress, uint8 genre, string daoName, uint8 paymentMethod, uint256 threshold, uint256 timelockPeriodHours)",
];

const PROPOSAL_TUPLE =
  "tuple(uint256 id, string title, string description, uint256 amount, address recipient, uint8 proposalType, uint8 protocolAction, uint256 newValue, address newTokenAddress, uint256 forVotes, uint256 againstVotes, uint256 abstainVotes, uint8 status, uint256 timestamp, uint256 queuedTimestamp, address creator)";

export const DAO_ABI = [
  "function owner() view returns (address)",
  "function token() view returns (address)",
  "function name() view returns (string)",
  "function imageUrl() view returns (string)",
  "function quorumPercentage() view returns (uint256)",
  "function proposalThreshold() view returns (uint256)",
  "function votingPeriodHours() view returns (uint256)",
  "function timelockPeriodHours() view returns (uint256)",
  "function proposalCount() view returns (uint256)",
  `function getProposal(uint256 id) view returns (${PROPOSAL_TUPLE})`,
  "function votesCast(address, uint256) view returns (uint8)",
  "function hasVotedIndependently(address, uint256) view returns (bool)",
  "function canExecute(uint256 id) view returns (bool)",
  "function delegatorDelegatee(address) view returns (address)",
  "function delegatorBalance(address) view returns (uint256)",
  "function delegateeDelegatorCount(address) view returns (uint256)",
  "function delegateeVotesReceived(address) view returns (uint256)",
  "function createFundingProposal(string title, string description, uint256 amount, address recipient)",
  "function createGenericProposal(string title, string description)",
  "function createProtocolUpgradeProposal(string title, string description, uint8 action, uint256 newValue, address newTokenAddress)",
  "function vote(uint256 id, uint8 option)",
  "function finalizeProposal(uint256 id)",
  "function executeProposal(uint256 id)",
  "function cancelProposal(uint256 id)",
  "function delegate(address delegatee)",
  "function undelegate()",
];

export const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

export const daoIface = new Interface(DAO_ABI);
export const factoryIface = new Interface(FACTORY_ABI);
export const tokenIface = new Interface(TOKEN_ABI);

/** Builds a { to, data, value } request for a contract call. */
export const call = (iface, to, fn, args = [], value = 0n) => ({ to, data: iface.encodeFunctionData(fn, args), value });

// ─── Enums (DelegatedDAO.sol) ────────────────────────────────────────────────

export const ProposalStatus = { ACTIVE: 0, PASSED: 1, FAILED: 2, QUEUED: 3, EXECUTED: 4, CANCELLED: 5 };
export const VoteOption = { NONE: 0, FOR: 1, AGAINST: 2, ABSTAIN: 3 };
export const ProposalType = { FUNDING: 0, GENERIC: 1, PROTOCOL_UPGRADE: 2 };
export const ProtocolAction = { CHANGE_THRESHOLD: 0, CHANGE_TOKEN: 1, CHANGE_QUORUM: 2, CHANGE_TIMELOCK: 3, CHANGE_VOTING_PERIOD: 4 };
export const PaymentMethod = { ETH: 0, TOKEN: 1 };

export const STATUS_META = {
  0: { label: "Active", color: "#3B82F6" },
  1: { label: "Passed", color: "#10B981" },
  2: { label: "Failed", color: "#EF4444" },
  3: { label: "Queued", color: "#F59E0B" },
  4: { label: "Executed", color: "var(--primary)" },
  5: { label: "Cancelled", color: "#6B7280" },
};
export const TYPE_LABELS = { 0: "Funding", 1: "Generic", 2: "Protocol Upgrade" };
export const VOTE_LABELS = { 1: "For", 2: "Against", 3: "Abstain" };
export const ACTION_LABELS = {
  0: "Change Proposal Threshold",
  1: "Change Governance Token",
  2: "Change Quorum Percentage",
  3: "Change Timelock Period",
  4: "Change Voting Period",
};

// ─── Genres (DAOFactory.Genre) — colours from the app's DAOCard ──────────────

export const GENRES = [
  { id: 0, label: "NFT", color: "#8B5CF6" },
  { id: 1, label: "Gaming", color: "#10B981" },
  { id: 2, label: "Community", color: "#F59E0B" },
  { id: 3, label: "DeFi", color: "#3B82F6" },
  { id: 4, label: "AI", color: "#EF4444" },
  { id: 5, label: "Degen", color: "#F97316" },
  { id: 6, label: "Memecoin", color: "#84CC16" },
  { id: 7, label: "RWA", color: "#6366F1" },
  { id: 8, label: "DePIN", color: "#EC4899" },
  { id: 9, label: "SocialFi", color: "#14B8A6" },
  { id: 10, label: "Metaverse", color: "#A855F7" },
  { id: 11, label: "Other", color: "#6B7280" },
];
export const genreOf = (id) => GENRES[Number(id)] ?? GENRES[11];

// ─── Vote maths ──────────────────────────────────────────────────────────────
// vote() weighs a ballot as Math.sqrt(balance in base units), so a weight is
// √(tokens × 10^decimals) = √tokens × 10^(decimals/2). The app divides by a
// fixed 1e9, which is only right for 18-decimal tokens.

/** Integer square root (Babylonian), matching OpenZeppelin Math.sqrt rounding down. */
export function isqrt(n) {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/** On-chain vote weight → human "votes" (√tokens). */
export const displayVotes = (weight, decimals = 18) => Number(weight ?? 0n) / 10 ** (decimals / 2);

/** finalizeProposal's bar: (√totalSupply × quorum%) / 100, in vote-weight units. */
export const requiredQuorumWeight = (totalSupply, quorumPercentage) =>
  (isqrt(BigInt(totalSupply ?? 0n)) * BigInt(quorumPercentage ?? 0)) / 100n;

/** Weight a holder's own ballot would carry right now. */
export const ownVoteWeight = (balance) => isqrt(BigInt(balance ?? 0n));

export const formatVotes = (n) =>
  n === 0 ? "0" : n < 0.01 ? "< 0.01" : n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 });

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
