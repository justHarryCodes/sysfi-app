"use client";
// Proposal detail — port of ProposalDetailScreen: status, description,
// funding / protocol details, results, quorum, timeline and actions.
// Fixes vs the app: cancel shows for the proposal's creator (the app compared
// against a field that doesn't exist), finalize uses the DAO's real voting
// period (the app fell back to 72h on cards), and votes honour token decimals.
import { useParams } from "next/navigation";
import { formatUnits } from "ethers";
import {
  IoPersonOutline,
  IoTimeOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoRemoveCircle,
  IoAlertCircle,
  IoPodiumOutline,
  IoFlag,
  IoPlay,
  IoCheckmarkDone,
  IoRefresh,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import { StatusBadge, TypeBadge, VoteBar, tally, timeLeft, voteEndsAt, voteOptionMeta } from "@/components/dao/DaoUi";
import { myVoteWeight, proposalPermissions, useRouteDao } from "@/components/dao/DaoScreen";
import { useActionSheet } from "@/components/wallet/useActionSheet";
import { useNow } from "@/hooks/useNow";
import { explorerAddress } from "@/lib/config";
import { formatBalance } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";
import { ProposalStatus, ProposalType, VOTE_LABELS, VoteOption, displayVotes, formatVotes, requiredQuorumWeight } from "@/lib/dao/contracts";
import { cancelAction, describeProtocolChange, executeAction, finalizeAction, hoursLabel, voteAction } from "@/lib/dao/actions";

const fmtDate = (sec) =>
  new Date(sec * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

function Card({ title, children, right }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="font-bold text-text">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function TimelineItem({ state, title, sub, last }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span className="absolute left-[5px] top-4 h-full w-0.5 bg-border" />}
      <span
        className={`relative mt-1 h-3 w-3 shrink-0 rounded-full ${state === "done" ? "bg-up" : state === "current" ? "bg-primary ring-4 ring-primary/20" : "bg-border"}`}
      />
      <span>
        <span className="block text-sm font-semibold text-text">{title}</span>
        <span className="block text-xs text-text-secondary">{sub}</span>
      </span>
    </li>
  );
}

export default function ProposalScreen() {
  const { id } = useParams();
  const { chain, valid, info, proposals, member, refresh } = useRouteDao();
  const now = useNow(30_000);
  const { sheet, run } = useActionSheet(chain, refresh);
  const pid = Number(id);
  const back = valid ? `/daos/${chain.id}/${info.data?.address ?? ""}?tab=active` : "/daos";

  if (!valid || info.isError) {
    return (
      <>
        <PageHeader title="Proposal" backHref="/daos" />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">Couldn&apos;t load this DAO.</p>
      </>
    );
  }
  const p = proposals.data?.find((x) => x.id === pid);
  if (info.isPending || (proposals.isPending && !p)) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-sm text-text-secondary">
        <Spinner size={32} className="text-primary" />
        Loading proposal…
      </div>
    );
  }
  if (!p) {
    return (
      <>
        <PageHeader title="Proposal" backHref={back} />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">Proposal #{id} doesn&apos;t exist in this DAO.</p>
      </>
    );
  }

  const dao = info.data;
  const m = member.data;
  const d = dao.token.decimals;
  const t = tally(p, d);
  const perm = proposalPermissions(p, dao, m, now);
  const endsAt = voteEndsAt(p, dao);
  const quorumWeight = requiredQuorumWeight(dao.token.totalSupply, dao.quorumPercentage);
  const quorumVotes = displayVotes(quorumWeight, d);
  const quorumMet = p.forVotes >= quorumWeight;
  const passing = quorumMet && p.forVotes > p.againstVotes;
  const weight = displayVotes(myVoteWeight(m), d);
  const queued = p.status === ProposalStatus.QUEUED || p.status === ProposalStatus.EXECUTED;

  // Why the vote buttons aren't there (only while voting is open).
  const voteBlock =
    p.status !== ProposalStatus.ACTIVE || perm.ended || !now
      ? null
      : perm.ballot
        ? null
        : !m
          ? "Connect a wallet to vote."
          : m.delegatee
            ? `You've delegated your votes to ${formatAddress(m.delegatee, 4)}. Revoke on My Stats to vote yourself.`
            : m.balance === 0n
              ? `Hold ${dao.token.symbol} to vote on this proposal.`
              : null;

  return (
    <>
      <PageHeader
        title={`Proposal #${p.id}`}
        subtitle={dao.name}
        backHref={back}
      />
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 md:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={p.status} />
          <TypeBadge type={p.proposalType} />
          {perm.ballot ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-up/10 px-2 py-0.5 text-[11px] font-bold text-up">
              <IoCheckmarkDone size={12} /> You voted {VOTE_LABELS[perm.ballot]}
            </span>
          ) : null}
          <button type="button" onClick={refresh} aria-label="Refresh" className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-hover hover:text-text">
            {proposals.isFetching ? <Spinner size={16} className="text-primary" /> : <IoRefresh size={18} />}
          </button>
        </div>

        <h2 className="text-2xl font-extrabold leading-tight tracking-[-0.3px] text-text">{p.title}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
          <a href={explorerAddress(chain, p.creator)} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-text">
            <IoPersonOutline size={15} /> {formatAddress(p.creator, 4)}
          </a>
          <span className="flex items-center gap-1">
            <IoTimeOutline size={15} /> {fmtDate(p.timestamp)}
          </span>
        </div>

        <Card title="Description">
          <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-text">{p.description}</p>
        </Card>

        {p.proposalType === ProposalType.FUNDING && (
          <Card title="Funding Request">
            <p className="text-xs text-text-secondary">Amount</p>
            <p className="mb-3 text-xl font-extrabold text-primary">
              {formatBalance(formatUnits(p.amount, d))} {dao.token.symbol}
            </p>
            <p className="text-xs text-text-secondary">Recipient</p>
            <a href={explorerAddress(chain, p.recipient)} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-text hover:text-primary">
              {p.recipient}
            </a>
            {p.status === ProposalStatus.QUEUED && dao.treasury < p.amount && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-neutral">
                <IoAlertCircle size={16} /> The treasury currently holds less than this — execution will fail until it&apos;s topped up.
              </p>
            )}
          </Card>
        )}

        {p.proposalType === ProposalType.PROTOCOL_UPGRADE && (
          <Card title="Protocol Change">
            <p className="text-[15px] font-semibold text-text">{describeProtocolChange(dao, p.protocolAction, p.newValue, p.newTokenAddress)}</p>
          </Card>
        )}

        <Card
          title="Voting Results"
          right={p.status === ProposalStatus.ACTIVE && now ? <span className="text-sm font-semibold text-primary">{perm.ended ? "Voting ended" : timeLeft(endsAt - now)}</span> : null}
        >
          <VoteBar t={t} height={10} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { Icon: IoCheckmarkCircle, cls: "text-up", label: "For", v: t.for, pct: t.forPct },
              { Icon: IoCloseCircle, cls: "text-down", label: "Against", v: t.against, pct: t.againstPct },
              { Icon: IoRemoveCircle, cls: "text-neutral", label: "Abstain", v: t.abstain, pct: t.abstainPct },
            ].map((r) => (
              <div key={r.label}>
                <span className="flex items-center justify-center gap-1 text-sm font-semibold text-text-secondary">
                  <r.Icon size={18} className={r.cls} /> {r.label}
                </span>
                <p className="text-xl font-extrabold tabular-nums text-text">{formatVotes(r.v)}</p>
                <p className="text-xs text-text-tertiary">{r.pct.toFixed(1)}%</p>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-divider pt-3 text-center text-sm text-text-secondary">{formatVotes(t.total)} total votes</p>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <IoPodiumOutline size={18} className="text-primary" /> Quorum
            </span>
          }
        >
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-text-secondary">Required &quot;For&quot; votes</span>
            <span className="font-bold text-text">
              {formatVotes(quorumVotes)} ({dao.quorumPercentage}% of √supply)
            </span>
          </div>
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-text-secondary">Current &quot;For&quot; votes</span>
            <span className={`font-bold ${quorumMet ? "text-up" : "text-text"}`}>{formatVotes(t.for)}</span>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-border">
            <span className="block h-full rounded-full bg-up" style={{ width: `${Math.min(100, quorumVotes > 0 ? (t.for / quorumVotes) * 100 : 100)}%` }} />
          </div>
          <p className={`flex items-center gap-1.5 text-sm font-semibold ${quorumMet ? "text-up" : "text-neutral"}`}>
            {quorumMet ? <IoCheckmarkCircle size={16} /> : <IoAlertCircle size={16} />}
            {quorumMet ? (passing ? "Quorum met — passing" : "Quorum met, but Against leads") : "Quorum not met yet"}
          </p>
          <p className="mt-2 text-xs text-text-tertiary">
            To pass, &quot;For&quot; needs at least the quorum and more votes than &quot;Against&quot;. Abstain counts toward turnout only.
          </p>
        </Card>

        <Card title="Timeline">
          <ol>
            <TimelineItem state="done" title="Created" sub={fmtDate(p.timestamp)} />
            <TimelineItem
              state={p.status === ProposalStatus.ACTIVE && !perm.ended ? "current" : "done"}
              title="Voting period"
              sub={`${hoursLabel(dao.votingPeriodHours)} · ${perm.ended || p.status !== ProposalStatus.ACTIVE ? `ended ${fmtDate(endsAt / 1000)}` : `ends ${fmtDate(endsAt / 1000)}`}`}
              last={!queued && p.status !== ProposalStatus.FAILED && p.status !== ProposalStatus.CANCELLED}
            />
            {p.status === ProposalStatus.FAILED && <TimelineItem state="done" title="Failed" sub="Didn't reach quorum or majority" last />}
            {p.status === ProposalStatus.CANCELLED && <TimelineItem state="done" title="Cancelled" sub="Withdrawn by its creator" last />}
            {queued && (
              <TimelineItem
                state={p.status === ProposalStatus.EXECUTED || (now && now >= perm.execAt) ? "done" : "current"}
                title="Queued (timelock)"
                sub={`${hoursLabel(dao.timelockPeriodHours)} · executable ${fmtDate(perm.execAt / 1000)}`}
                last={p.status !== ProposalStatus.EXECUTED}
              />
            )}
            {p.status === ProposalStatus.EXECUTED && <TimelineItem state="done" title="Executed" sub="Completed on-chain" last />}
          </ol>
          <p className="mt-4 text-xs text-text-tertiary">
            After voting ends, anyone holding {dao.token.symbol} can finalize. A passed proposal waits {hoursLabel(dao.timelockPeriodHours)} before it can be executed.
          </p>
        </Card>

        {/* Actions */}
        <div className="space-y-3 pb-6">
          {perm.canVote && now ? (
            <>
              <p className="text-center text-sm text-text-secondary">Your vote carries ≈ {formatVotes(weight)} votes</p>
              <div className="grid grid-cols-3 gap-2">
                {[VoteOption.FOR, VoteOption.AGAINST, VoteOption.ABSTAIN].map((opt) => {
                  const o = voteOptionMeta[opt];
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => run(voteAction(dao, p, opt, `≈ ${formatVotes(weight)} votes`))}
                      className={`flex h-12 items-center justify-center gap-1.5 rounded-xl font-bold hover:opacity-90 ${o.cls}`}
                    >
                      <o.Icon size={18} /> {o.label}
                    </button>
                  );
                })}
              </div>
            </>
          ) : voteBlock ? (
            <p className="rounded-xl bg-hover p-3 text-center text-sm text-text-secondary">{voteBlock}</p>
          ) : null}

          {perm.canFinalize && now && (
            <button type="button" onClick={() => run(finalizeAction(dao, p))} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-on-primary hover:opacity-90">
              <IoFlag size={18} /> Finalize proposal
            </button>
          )}
          {p.status === ProposalStatus.QUEUED && now && now < perm.execAt && (
            <p className="rounded-xl bg-hover p-3 text-center text-sm text-text-secondary">Executable in {timeLeft(perm.execAt - now).replace(" left", "")}.</p>
          )}
          {perm.canExecute && now && (
            <button type="button" onClick={() => run(executeAction(dao, p))} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-up font-bold text-white hover:opacity-90">
              <IoPlay size={18} /> Execute proposal
            </button>
          )}
          {perm.canCancel && (
            <button type="button" onClick={() => run(cancelAction(dao, p))} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-error/30 font-bold text-error hover:bg-error/[0.06]">
              <IoCloseCircle size={18} /> Cancel proposal
            </button>
          )}
        </div>
      </div>
      {sheet}
    </>
  );
}
