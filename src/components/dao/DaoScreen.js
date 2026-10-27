"use client";
// DAO hub — port of DAODetailsScreen (DAODetailsHeader + TabBar) and its
// tabs: Overview (DAOInfoCard, DAOStatsGrid, GovernanceParamsCard,
// TreasuryCard), Active / Past proposals, and My Stats (UserStatisticsTab).
// Differences from the app:
//   • proposals are public on-chain, so every tab is readable; only actions
//     need the governance token
//   • My Stats adds delegate / revoke — the app has the params but no UI
//   • votes are scaled by the token's decimals, not a fixed 1e9
import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatUnits, isAddress } from "ethers";
import {
  IoArrowBack,
  IoShareSocialOutline,
  IoCopyOutline,
  IoCheckmark,
  IoOpenOutline,
  IoDocumentTextOutline,
  IoFlashOutline,
  IoWalletOutline,
  IoPeopleOutline,
  IoCheckmarkCircleOutline,
  IoBarChartOutline,
  IoTimeOutline,
  IoLockClosedOutline,
  IoWallet,
  IoAdd,
  IoArchiveOutline,
  IoFlagOutline,
  IoPlay,
  IoInformationCircle,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoArrowForward,
  IoGlobeOutline,
  IoLogoTwitter,
  IoLogoDiscord,
  IoPaperPlaneOutline,
  IoShieldCheckmark,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { DaoAvatar, GenreChip, ProposalCard, genreBanner, voteEndsAt, voteOptionMeta } from "@/components/dao/DaoUi";
import { useActionSheet } from "@/components/wallet/useActionSheet";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useWallet } from "@/contexts/WalletContext";
import { useDao, useDaoList, useDaoRecord } from "@/hooks/daos";
import { useNow } from "@/hooks/useNow";
import { explorerAddress, getChainById } from "@/lib/config";
import { formatBalance } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";
import { ProposalStatus, ProposalType, VoteOption, displayVotes, formatVotes, isqrt } from "@/lib/dao/contracts";
import { delegateAction, executeAction, finalizeAction, hoursLabel, undelegateAction, voteAction } from "@/lib/dao/actions";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "active", label: "Active" },
  { id: "past", label: "Past" },
  { id: "stats", label: "My Stats" },
];

/** Route params → chain + address, validated. */
export function useRouteDao() {
  const { chainId, address } = useParams();
  const chain = getChainById(chainId);
  const valid = !!chain && isAddress(address);
  const dao = useDao(valid ? chain.id : null, valid ? address : null);
  return { chain, address, valid, ...dao };
}

/** Per-proposal eligibility for the connected wallet (mirrors the contract's require()s). */
export function proposalPermissions(p, info, member, now) {
  const ended = now >= voteEndsAt(p, info);
  const isHolder = !!member?.isHolder;
  const execAt = (p.queuedTimestamp + info.timelockPeriodHours * 3600) * 1000;
  return {
    ended,
    execAt,
    ballot: member?.votes?.[p.id] ?? 0,
    canVote: p.status === ProposalStatus.ACTIVE && !ended && member?.balance > 0n && !member?.delegatee && !member?.votes?.[p.id],
    canFinalize: p.status === ProposalStatus.ACTIVE && ended && isHolder,
    canExecute: p.status === ProposalStatus.QUEUED && now >= execAt && isHolder,
    canCancel:
      (p.status === ProposalStatus.ACTIVE || p.status === ProposalStatus.QUEUED) &&
      !!member?.address &&
      p.creator.toLowerCase() === member.address.toLowerCase(),
  };
}

/** What one ballot weighs right now: √own balance + √delegated (before delegators vote themselves). */
export function myVoteWeight(member) {
  if (!member) return 0n;
  return isqrt(member.balance) + (member.delegatorCount > 0 ? isqrt(member.votesReceived) : 0n);
}

function CopyAddress({ address, chain }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-1.5">
      <span className="font-mono text-sm text-text">{formatAddress(address, 4)}</span>
      <button
        type="button"
        aria-label="Copy address"
        onClick={async () => {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className={`flex h-7 w-7 items-center justify-center rounded-lg ${copied ? "bg-up/10 text-up" : "bg-primary/10 text-primary"}`}
      >
        {copied ? <IoCheckmark size={13} /> : <IoCopyOutline size={13} />}
      </button>
      <a href={explorerAddress(chain, address)} target="_blank" rel="noreferrer" aria-label="View on explorer" className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <IoOpenOutline size={13} />
      </a>
    </span>
  );
}

function SectionTitle({ children }) {
  return <h3 className="mb-3 text-lg font-bold text-text">{children}</h3>;
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function DaoHero({ info, genreId, chain }) {
  const router = useRouter();
  const { showAlert } = useFeedback();
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: info.name, text: `${info.name} on Sysfi`, url });
      else {
        await navigator.clipboard.writeText(url);
        showAlert("Link copied", "Share it with anyone — the DAO page is public.");
      }
    } catch {}
  };
  return (
    <div className="relative h-56 overflow-hidden md:h-64">
      {info.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.imageUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-[2px]" />
      ) : (
        <Image src={genreBanner(genreId)} alt="" fill priority sizes="(min-width: 768px) 900px, 100vw" className="object-cover" placeholder="blur" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/5 to-black/75" />
      <div className="absolute inset-x-0 top-0 flex justify-between p-3">
        <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push("/daos"))} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50">
          <IoArrowBack size={20} />
        </button>
        <button type="button" aria-label="Share" onClick={share} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50">
          <IoShareSocialOutline size={20} />
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 md:p-5">
        {info.imageUrl ? (
          <DaoAvatar name={info.name} imageUrl={info.imageUrl} genreId={genreId} size={64} className="border-2 border-white/80" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary/25 text-primary backdrop-blur">
            <IoShieldCheckmark size={30} />
          </span>
        )}
        <div className="min-w-0 pb-0.5">
          <h1 className="truncate text-2xl font-extrabold tracking-[-0.3px] text-white">{info.name || "—"}</h1>
          <div className="mt-1 flex items-center gap-2">
            {genreId !== null && genreId !== undefined && <GenreChip genreId={genreId} size="md" />}
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">{chain.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────

function Overview({ chain, info, record, proposals, member }) {
  const active = proposals.filter((p) => p.status === ProposalStatus.ACTIVE).length;
  const off = record?.offChain;
  const links = [
    off?.website && { href: off.website, label: "Website", Icon: IoGlobeOutline },
    off?.twitter && { href: off.twitter, label: "X", Icon: IoLogoTwitter },
    off?.discord && { href: off.discord, label: "Discord", Icon: IoLogoDiscord },
    off?.telegram && { href: off.telegram, label: "Telegram", Icon: IoPaperPlaneOutline },
  ].filter(Boolean);
  const stats = [
    { Icon: IoDocumentTextOutline, label: "Total Proposals", value: String(proposals.length), accent: "#3B82F6" },
    { Icon: IoFlashOutline, label: "Active", value: String(active), accent: "#10B981" },
    { Icon: IoPeopleOutline, label: "Your Votes", value: member ? formatVotes(displayVotes(myVoteWeight(member), info.token.decimals)) : "—", accent: "#F59E0B" },
    { Icon: IoWalletOutline, label: "Treasury", value: formatBalance(formatUnits(info.treasury, info.token.decimals)), sub: info.token.symbol, accent: "var(--primary)" },
  ];
  const params = [
    { Icon: IoCheckmarkCircleOutline, label: "Quorum", value: `${info.quorumPercentage}%`, accent: "#10B981" },
    { Icon: IoBarChartOutline, label: "Proposal Threshold", value: `${formatBalance(formatUnits(info.proposalThreshold, info.token.decimals))} ${info.token.symbol}`, accent: "#3B82F6" },
    { Icon: IoTimeOutline, label: "Voting Period", value: hoursLabel(info.votingPeriodHours), accent: "#F59E0B" },
    { Icon: IoLockClosedOutline, label: "Timelock", value: hoursLabel(info.timelockPeriodHours), accent: "#EF4444" },
  ];

  return (
    <div className="space-y-6 px-4 py-5 md:px-5">
      {(off?.description || links.length > 0) && (
        <section>
          {off?.description && <p className="whitespace-pre-line text-[15px] leading-6 text-text">{off.description}</p>}
          {links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold text-text hover:bg-hover">
                  <Icon size={15} /> {label}
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="divide-y divide-divider rounded-2xl border border-border bg-surface px-4">
        <div className="flex items-center justify-between gap-3 py-3.5">
          <span className="text-sm text-text-secondary">DAO Contract</span>
          <CopyAddress address={info.address} chain={chain} />
        </div>
        <div className="flex items-center justify-between gap-3 py-3.5">
          <span className="text-sm text-text-secondary">Gov Token</span>
          <span className="flex flex-col items-end gap-1">
            <span className="text-sm font-semibold text-text">
              {info.token.name} <span className="text-primary">{info.token.symbol}</span>
            </span>
            <CopyAddress address={info.token.address} chain={chain} />
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 py-3.5">
          <span className="text-sm text-text-secondary">Total supply</span>
          <span className="text-sm font-semibold text-text">
            {formatBalance(formatUnits(info.token.totalSupply, info.token.decimals))} {info.token.symbol}
          </span>
        </div>
      </section>

      <section>
        <SectionTitle>Overview</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {stats.map(({ Icon, label, value, sub, accent }) => (
            <div key={label} className="rounded-2xl border border-border bg-surface p-4">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
                <Icon size={20} />
              </span>
              <p className="truncate text-xl font-extrabold tabular-nums text-text">{value}</p>
              {sub && <p className="text-xs font-bold" style={{ color: accent }}>{sub}</p>}
              <p className="text-xs text-text-secondary">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Governance Parameters</SectionTitle>
        <div className="divide-y divide-divider rounded-2xl border border-border bg-surface px-4">
          {params.map(({ Icon, label, value, accent }) => (
            <div key={label} className="flex items-center justify-between gap-3 py-3.5">
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ color: accent, background: `color-mix(in srgb, ${accent} 12%, transparent)` }}>
                  <Icon size={15} />
                </span>
                <span className="text-sm text-text-secondary">{label}</span>
              </span>
              <span className="text-sm font-bold text-text">{value}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>DAO Treasury</SectionTitle>
        <div className="relative overflow-hidden rounded-2xl p-5 shadow-lg" style={{ background: "linear-gradient(135deg, #1A2100, #0A0A0A)" }}>
          <span className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#D6FF00]/[0.07]" />
          <span className="absolute -bottom-12 right-16 h-28 w-28 rounded-full bg-[#D6FF00]/[0.05]" />
          <div className="relative flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D6FF00]/15 text-[#D6FF00]">
              <IoWallet size={26} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Total Balance</p>
              <p className="truncate text-3xl font-black tabular-nums text-white">
                {formatBalance(formatUnits(info.treasury, info.token.decimals))} <span className="text-lg font-bold text-[#D6FF00]">{info.token.symbol}</span>
              </p>
            </div>
          </div>
          <p className="relative mt-3 text-xs text-white/50">Funding proposals pay out from this balance. Send {info.token.symbol} to the DAO contract to fund it.</p>
        </div>
      </section>
    </div>
  );
}

// ─── Proposal lists ──────────────────────────────────────────────────────────

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "generic", label: "Generic", test: (p) => p.proposalType === ProposalType.GENERIC },
  { key: "funding", label: "Funding", test: (p) => p.proposalType === ProposalType.FUNDING },
  { key: "protocol", label: "Protocol", test: (p) => p.proposalType === ProposalType.PROTOCOL_UPGRADE },
];

function ProposalList({ mode, chain, info, proposals, member, run, isLoading }) {
  const now = useNow(30_000);
  const [filter, setFilter] = useState("all");
  const base = proposals.filter((p) => (mode === "active" ? p.status === ProposalStatus.ACTIVE : p.status !== ProposalStatus.ACTIVE));
  const rows = base.filter(FILTERS.find((f) => f.key === filter).test);
  const weight = displayVotes(myVoteWeight(member), info.token.decimals);
  const href = (p) => `/daos/${chain.id}/${info.address}/proposal/${p.id}`;

  return (
    <div className="px-4 py-4 md:px-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => {
            const count = base.filter(f.test).length;
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${on ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-text-secondary hover:text-text"}`}
              >
                {f.label}
                <span className={`rounded-full px-1.5 text-[10px] font-bold ${on ? "bg-black/15" : "bg-border text-text"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        {mode === "active" && member?.canPropose && (
          <Link href={`/daos/${chain.id}/${info.address}/propose`} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-xs font-bold text-on-primary">
            <IoAdd size={15} /> New
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} className="text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          {mode === "active" ? <IoDocumentTextOutline size={44} className="mb-3 text-text-secondary" /> : <IoArchiveOutline size={44} className="mb-3 text-text-secondary" />}
          <p className="mb-1 font-semibold text-text">{mode === "active" ? "No active proposals" : "No past proposals"}</p>
          <p className="mb-5 text-sm text-text-secondary">
            {filter !== "all" ? "Try a different filter" : mode === "active" ? "Token holders above the threshold can create one." : "Completed proposals will appear here."}
          </p>
          {mode === "active" && filter === "all" && member?.canPropose && (
            <Link href={`/daos/${chain.id}/${info.address}/propose`} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
              <IoAdd size={16} /> Create proposal
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => {
            const perm = proposalPermissions(p, info, member, now);
            let footer = null;
            if (now && perm.canVote) {
              footer = (
                <div className="flex gap-2">
                  {[VoteOption.FOR, VoteOption.AGAINST, VoteOption.ABSTAIN].map((opt) => {
                    const m = voteOptionMeta[opt];
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => run(voteAction(info, p, opt, `≈ ${formatVotes(weight)} votes`))}
                        className={`flex h-9 flex-1 items-center justify-center gap-1 rounded-lg text-sm font-bold hover:opacity-90 ${m.cls}`}
                      >
                        <m.Icon size={15} /> {m.label}
                      </button>
                    );
                  })}
                </div>
              );
            } else if (now && perm.canFinalize) {
              footer = (
                <button type="button" onClick={() => run(finalizeAction(info, p))} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-bold text-on-primary hover:opacity-90">
                  <IoFlagOutline size={15} /> Finalize voting
                </button>
              );
            } else if (now && perm.canExecute) {
              footer = (
                <button type="button" onClick={() => run(executeAction(info, p))} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-up text-sm font-bold text-white hover:opacity-90">
                  <IoPlay size={15} /> Execute proposal
                </button>
              );
            }
            return <ProposalCard key={p.id} p={p} info={info} ballot={perm.ballot} now={now} href={href(p)} footer={footer} />;
          })}
        </div>
      )}
    </div>
  );
}

// ─── My Stats ────────────────────────────────────────────────────────────────

function Stats({ chain, info, member, memberLoading, run }) {
  const { address } = useWallet();
  const [delegatee, setDelegatee] = useState("");
  const [err, setErr] = useState("");
  const [preparing, setPreparing] = useState(false);
  const { showAlert } = useFeedback();

  if (!address) return <p className="px-4 py-16 text-center text-sm text-text-secondary">Set up your wallet to see your voting power.</p>;
  if (memberLoading && !member) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} className="text-primary" />
      </div>
    );
  }
  if (!member) return null;

  const d = info.token.decimals;
  const own = displayVotes(isqrt(member.balance), d);
  const received = member.delegatorCount > 0 ? displayVotes(isqrt(member.votesReceived), d) : 0;

  const startDelegate = async () => {
    const to = delegatee.trim();
    if (!isAddress(to)) return setErr("Enter a valid address");
    if (to.toLowerCase() === member.address.toLowerCase()) return setErr("You can't delegate to yourself");
    setErr("");
    setPreparing(true);
    try {
      run(await delegateAction(chain, info, member, to), () => setDelegatee(""));
    } catch (e) {
      showAlert("Couldn't prepare delegation", e.message);
    } finally {
      setPreparing(false);
    }
  };

  const statusCards = [
    { label: "Token Holder", ok: member.isHolder },
    { label: "Can Propose", ok: member.canPropose },
  ];

  return (
    <div className="space-y-6 px-4 py-5 md:px-5">
      {!member.isHolder && (
        <div className="flex flex-col items-center rounded-2xl border border-border bg-surface px-6 py-10 text-center">
          <IoWalletOutline size={48} className="mb-3 text-text-secondary" />
          <p className="mb-1 text-lg font-bold text-text">No tokens held</p>
          <p className="max-w-sm text-sm text-text-secondary">
            Hold {info.token.symbol} in {formatAddress(member.address, 4)} to vote and create proposals in {info.name}.
          </p>
        </div>
      )}

      <section>
        <SectionTitle>Your Status</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          {statusCards.map(({ label, ok }) => (
            <div key={label} className={`flex flex-col items-center gap-1 rounded-2xl border border-border p-4 ${ok ? "bg-up/[0.06]" : "bg-surface"}`}>
              {ok ? <IoCheckmarkCircle size={30} className="text-up" /> : <IoCloseCircle size={30} className="text-down" />}
              <span className="text-sm font-semibold text-text-secondary">{label}</span>
              <span className={`font-bold ${ok ? "text-up" : "text-down"}`}>{ok ? "Yes" : "No"}</span>
            </div>
          ))}
        </div>
        {!member.canPropose && member.balance > 0n && (
          <p className="mt-2 text-xs text-text-tertiary">
            Proposing needs {formatBalance(formatUnits(info.proposalThreshold, d))} {info.token.symbol}; you hold {formatBalance(formatUnits(member.balance, d))}.
          </p>
        )}
      </section>

      <section>
        <SectionTitle>Your Voting Power</SectionTitle>
        <div className="mb-3 rounded-2xl bg-primary/[0.08] p-4">
          <p className="mb-1 flex items-center gap-2 font-bold text-primary">
            <IoInformationCircle size={18} /> Quadratic Voting
          </p>
          <p className="text-sm text-text">Voting power = √(token balance). This reduces whale influence and keeps governance fairer.</p>
        </div>
        <div className="flex items-center justify-around rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <IoWallet size={26} />
            </span>
            <span className="text-sm font-semibold text-text-secondary">Token Balance</span>
            <span className="text-2xl font-extrabold tabular-nums text-text">{formatBalance(formatUnits(member.balance, d))}</span>
            <span className="text-xs italic text-text-secondary">{info.token.symbol}</span>
          </div>
          <IoArrowForward size={22} className="text-text-secondary" />
          <div className="flex flex-col items-center gap-1.5">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-up/15 text-up">
              <IoFlashOutline size={26} />
            </span>
            <span className="text-sm font-semibold text-text-secondary">Voting Power</span>
            <span className="text-2xl font-extrabold tabular-nums text-up">{formatVotes(own)}</span>
            <span className="text-xs italic text-text-secondary">votes</span>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Delegation</SectionTitle>
        {member.delegatorCount > 0 && (
          <div className="mb-3 rounded-2xl bg-neutral/[0.08] p-4">
            <p className="mb-3 flex items-center gap-2 font-bold text-text">
              <IoPeopleOutline size={20} className="text-neutral" /> Delegated to you
              <span className="text-sm font-normal text-text-secondary">
                · {member.delegatorCount} {member.delegatorCount === 1 ? "person" : "people"}
              </span>
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Additional voting power</span>
              <span className="font-bold text-neutral">+{formatVotes(received)} votes</span>
            </div>
            <div className="mt-1.5 flex justify-between text-sm">
              <span className="text-text-secondary">Delegated tokens</span>
              <span className="font-bold text-neutral">
                {formatBalance(formatUnits(member.votesReceived, d))} {info.token.symbol}
              </span>
            </div>
          </div>
        )}

        {member.delegatee ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="mb-2 flex items-center gap-2 font-bold text-text">
              <IoArrowForward size={18} className="text-neutral" /> You&apos;re delegating
            </p>
            <p className="font-mono text-sm font-semibold text-text">{formatAddress(member.delegatee, 8)}</p>
            <p className="mb-4 text-sm text-text-secondary">
              {formatBalance(formatUnits(member.delegatedAmount, d))} {info.token.symbol} is held by the DAO and voted by this address.
            </p>
            <Button title="Revoke delegation" variant="outline" size="small" onClick={() => run(undelegateAction(info, member))} />
          </div>
        ) : member.delegatorCount > 0 ? (
          <p className="text-sm text-text-secondary">Members have delegated to you, so you can&apos;t delegate onward.</p>
        ) : member.balance > 0n ? (
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="mb-3 text-sm text-text-secondary">
              Let someone you trust vote for you. Your {info.token.symbol} moves into the DAO contract until you revoke, and they must hold {info.token.symbol} themselves.
            </p>
            <Input label="Delegate address" placeholder="0x…" value={delegatee} onChange={(e) => setDelegatee(e.target.value)} error={err} autoComplete="off" spellCheck={false} />
            <Button title="Delegate votes" size="small" loading={preparing} disabled={!delegatee.trim()} onClick={startDelegate} />
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Hold {info.token.symbol} to delegate your votes.</p>
        )}
      </section>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function DaoScreen() {
  const { chain, address, valid, info, proposals, member, refresh } = useRouteDao();
  const search = useSearchParams();
  const router = useRouter();
  const tab = TABS.some((t) => t.id === search.get("tab")) ? search.get("tab") : "overview";
  const setTab = (id) => router.replace(`?tab=${id}`, { scroll: false });
  const record = useDaoRecord(chain?.id, address);
  const list = useDaoList(chain?.id);
  const { sheet, run } = useActionSheet(chain, refresh);

  // Genre comes from the factory index (the DAO contract itself doesn't store it).
  const genreId = useMemo(() => {
    const row = (list.data || []).find((d) => d.address?.toLowerCase() === address?.toLowerCase()) ?? record.data;
    return row?.genreId ?? null;
  }, [list.data, record.data, address]);

  if (!valid) {
    return (
      <>
        <PageHeader title="DAO" backHref="/daos" />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">
          {chain ? "That isn't a valid DAO address." : "DAOs on this network aren't available on the web yet."}
        </p>
      </>
    );
  }
  if (info.isPending) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-sm text-text-secondary">
        <Spinner size={32} className="text-primary" />
        Loading DAO details…
      </div>
    );
  }
  if (!info.data) {
    return (
      <>
        <PageHeader title="DAO" backHref="/daos" />
        <div className="px-4 py-16 text-center">
          <p className="mb-1 text-lg font-bold text-error">Error loading DAO</p>
          <p className="mb-5 text-sm text-text-secondary">{info.error?.code === "NOT_A_DAO" ? `There's no DAO at ${formatAddress(address, 6)} on ${chain.name}.` : info.error?.message}</p>
          {info.error?.code !== "NOT_A_DAO" && <Button title="Try again" size="small" onClick={() => info.refetch()} />}
        </div>
      </>
    );
  }

  const list_ = proposals.data || [];
  return (
    <>
      <DaoHero info={info.data} genreId={genreId} chain={chain} />
      <PageHeader tabs={TABS} activeTab={tab} onTabChange={setTab} />
      {tab === "overview" && <Overview chain={chain} info={info.data} record={record.data} proposals={list_} member={member.data} />}
      {(tab === "active" || tab === "past") && (
        <ProposalList key={tab} mode={tab} chain={chain} info={info.data} proposals={list_} member={member.data} run={run} isLoading={proposals.isPending} />
      )}
      {tab === "stats" && <Stats chain={chain} info={info.data} member={member.data} memberLoading={member.isPending && member.fetchStatus !== "idle"} run={run} />}
      {sheet}
    </>
  );
}
