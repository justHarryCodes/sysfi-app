// lib/dao/actions.js — the web's take on useDAOContract's get*Params and
// useLaunchDAO.getCreateDAOTxParams: each builder returns the props for
// <ActionTxSheet> (title, details, steps). Steps are plain { to, data, value }
// requests, or async builders for ones that depend on an earlier step.
import { formatUnits } from "ethers";
import { formatBalance } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";
import { readAllowance } from "./chain";
import {
  ACTION_LABELS,
  PaymentMethod,
  ProtocolAction,
  ProposalType,
  VOTE_LABELS,
  ZERO_ADDRESS,
  call,
  daoIface,
  factoryIface,
  genreOf,
  tokenIface,
} from "./contracts";

const amountOf = (raw, token) => `${formatBalance(formatUnits(raw, token.decimals))} ${token.symbol}`;

export const voteAction = (info, p, option, weightLabel) => ({
  title: `Vote ${VOTE_LABELS[option]}`,
  description: `On proposal #${p.id} in ${info.name}. Votes are final.`,
  details: [
    { label: "Proposal", value: p.title },
    { label: "Your vote", value: VOTE_LABELS[option] },
    ...(weightLabel ? [{ label: "Vote weight", value: weightLabel }] : []),
  ],
  steps: [{ label: "Cast vote", request: call(daoIface, info.address, "vote", [p.id, option]) }],
});

export const finalizeAction = (info, p) => ({
  title: "Finalize proposal",
  description: "Counts the votes. If it passed, it's queued for the timelock; otherwise it fails.",
  details: [{ label: "Proposal", value: `#${p.id} · ${p.title}` }],
  steps: [{ label: "Finalize voting", request: call(daoIface, info.address, "finalizeProposal", [p.id]) }],
});

export const executeAction = (info, p) => ({
  title: "Execute proposal",
  description:
    p.proposalType === ProposalType.FUNDING
      ? `Sends ${amountOf(p.amount, info.token)} from the treasury to ${formatAddress(p.recipient, 6)}.`
      : p.proposalType === ProposalType.PROTOCOL_UPGRADE
        ? `Applies: ${ACTION_LABELS[p.protocolAction]}.`
        : "Marks this proposal as executed on-chain.",
  details: [{ label: "Proposal", value: `#${p.id} · ${p.title}` }],
  steps: [{ label: "Execute", request: call(daoIface, info.address, "executeProposal", [p.id]) }],
});

export const cancelAction = (info, p) => ({
  title: "Cancel proposal",
  description: "This can't be undone. Votes already cast are discarded.",
  details: [{ label: "Proposal", value: `#${p.id} · ${p.title}` }],
  tone: "danger",
  steps: [{ label: "Cancel proposal", request: call(daoIface, info.address, "cancelProposal", [p.id]) }],
});

/** form: { type, title, description, amount (raw), recipient, action, newValue (raw), newToken } */
export function proposeAction(info, form) {
  const base = { title: "Create proposal", description: `Opens a ${info.votingPeriodHours}-hour vote in ${info.name}.` };
  const details = [
    { label: "Type", value: form.type === ProposalType.FUNDING ? "Funding" : form.type === ProposalType.PROTOCOL_UPGRADE ? "Protocol Upgrade" : "Generic" },
    { label: "Title", value: form.title },
  ];
  let request;
  if (form.type === ProposalType.FUNDING) {
    details.push({ label: "Amount", value: amountOf(form.amount, info.token) }, { label: "Recipient", value: formatAddress(form.recipient, 6) });
    request = call(daoIface, info.address, "createFundingProposal", [form.title, form.description, form.amount, form.recipient]);
  } else if (form.type === ProposalType.PROTOCOL_UPGRADE) {
    details.push({ label: "Change", value: describeProtocolChange(info, form.action, form.newValue, form.newToken) });
    request = call(daoIface, info.address, "createProtocolUpgradeProposal", [
      form.title,
      form.description,
      form.action,
      form.newValue,
      form.action === ProtocolAction.CHANGE_TOKEN ? form.newToken : ZERO_ADDRESS,
    ]);
  } else {
    request = call(daoIface, info.address, "createGenericProposal", [form.title, form.description]);
  }
  return { ...base, details, steps: [{ label: "Submit proposal", request }] };
}

/** "Quorum → 60%", "Voting period → 7 days" … from the on-chain encoding. */
export function describeProtocolChange(info, action, newValue, newToken) {
  const v = BigInt(newValue ?? 0n);
  switch (Number(action)) {
    case ProtocolAction.CHANGE_THRESHOLD:
      return `Proposal threshold → ${amountOf(v, info.token)}`;
    case ProtocolAction.CHANGE_TOKEN:
      return `Governance token → ${formatAddress(newToken, 6)}`;
    case ProtocolAction.CHANGE_QUORUM:
      return `Quorum → ${v}%`;
    case ProtocolAction.CHANGE_TIMELOCK:
      return `Timelock → ${hoursLabel(Number(v))}`;
    case ProtocolAction.CHANGE_VOTING_PERIOD:
      return `Voting period → ${hoursLabel(Number(v))}`;
    default:
      return "Unknown change";
  }
}

export const hoursLabel = (h) => (h % 24 === 0 && h >= 24 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hour${h === 1 ? "" : "s"}`);

/**
 * delegate() pulls the whole balance into the DAO with transferFrom, so it
 * needs an allowance first. The approve step is skipped when it's already
 * enough (e.g. retrying after the approval went through).
 */
export async function delegateAction(chain, info, member, delegatee) {
  const balance = member.balance;
  const allowance = await readAllowance(chain, info.token.address, member.address, info.address);
  const steps = [];
  if (allowance < balance) {
    steps.push({ label: `Allow the DAO to hold your ${info.token.symbol}`, request: call(tokenIface, info.token.address, "approve", [info.address, balance]) });
  }
  steps.push({ label: "Delegate votes", request: call(daoIface, info.address, "delegate", [delegatee]) });
  return {
    title: "Delegate voting power",
    description: `Your ${amountOf(balance, info.token)} moves into the DAO contract and ${formatAddress(delegatee, 4)} votes with it. Revoke any time to get it back.`,
    details: [
      { label: "Delegate", value: formatAddress(delegatee, 6) },
      { label: "Amount", value: amountOf(balance, info.token) },
    ],
    steps,
  };
}

export const undelegateAction = (info, member) => ({
  title: "Revoke delegation",
  description: `Returns ${amountOf(member.delegatedAmount, info.token)} to your wallet and lets you vote yourself again.`,
  details: [{ label: "Currently delegated to", value: formatAddress(member.delegatee, 6) }],
  steps: [{ label: "Revoke delegation", request: call(daoIface, info.address, "undelegate") }],
});

/**
 * createDAO through the factory. Paying in the fee token adds an approve()
 * when the allowance is short (LaunchDaoScreen.proceedWithTransaction).
 * params: { name, genre, imageUrl, token (meta), quorum, threshold (raw), votingHours, timelockHours, payment }
 */
export async function launchAction(chain, fees, owner, params) {
  const steps = [];
  const payInToken = params.payment === PaymentMethod.TOKEN;
  if (payInToken) {
    const allowance = await readAllowance(chain, fees.feeToken.address, owner, fees.factory);
    if (allowance < fees.tokenFee) {
      steps.push({ label: `Approve ${fees.feeToken.symbol} creation fee`, request: call(tokenIface, fees.feeToken.address, "approve", [fees.factory, fees.tokenFee]) });
    }
  }
  steps.push({
    label: "Deploy DAO",
    request: call(
      factoryIface,
      fees.factory,
      "createDAO",
      [params.quorum, params.threshold, params.votingHours, params.timelockHours, params.token.address, params.genre, params.imageUrl || "", params.name, params.payment],
      payInToken ? 0n : fees.ethFee,
    ),
  });
  return {
    title: "Launch DAO",
    description: `Deploys "${params.name}" on ${chain.name}.`,
    details: [
      { label: "Genre", value: genreOf(params.genre).label },
      { label: "Governance token", value: `${params.token.symbol} · ${formatAddress(params.token.address, 4)}` },
      { label: "Quorum", value: `${params.quorum}%` },
      { label: "Proposal threshold", value: amountOf(params.threshold, params.token) },
      { label: "Voting period", value: hoursLabel(params.votingHours) },
      { label: "Timelock", value: hoursLabel(params.timelockHours) },
      {
        label: "Creation fee",
        value: payInToken ? amountOf(fees.tokenFee, fees.feeToken) : `${formatBalance(formatUnits(fees.ethFee, chain.decimals))} ${chain.symbol}`,
      },
    ],
    steps,
  };
}

/** DAO address from a createDAO receipt's DAOCreated log. */
export function daoFromReceipt(receipt) {
  for (const log of receipt?.logs ?? []) {
    try {
      const parsed = factoryIface.parseLog(log);
      if (parsed?.name === "DAOCreated") return parsed.args.daoAddress;
    } catch {}
  }
  return null;
}
