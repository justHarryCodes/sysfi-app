"use client";
// components/dao/DaoUi.js — small DAO building blocks, ports of the app's
// DAOCard, GenreFilter, StatusBadge/VoteBar (Active/PastProposalTab) and
// the genre banners from constants/GenreBanner.js.
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatUnits } from "ethers";
import {
  IoImageOutline,
  IoGameControllerOutline,
  IoPeopleOutline,
  IoTrendingUpOutline,
  IoBulbOutline,
  IoRocketOutline,
  IoHappyOutline,
  IoBusinessOutline,
  IoHardwareChipOutline,
  IoShareSocialOutline,
  IoGlobeOutline,
  IoHelpCircleOutline,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoRemoveCircle,
  IoCashOutline,
  IoCheckmarkDone,
  IoChevronForward,
} from "react-icons/io5";
import { formatBalance } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";
import {
  ProposalType,
  STATUS_META,
  TYPE_LABELS,
  VOTE_LABELS,
  VoteOption,
  displayVotes,
  formatVotes,
  genreOf,
} from "@/lib/dao/contracts";
import bannerNft from "@/assets/banners/nft.jpg";
import bannerGame from "@/assets/banners/game.jpg";
import bannerComm from "@/assets/banners/comm.jpg";
import bannerDefi from "@/assets/banners/defi.jpg";
import bannerAi from "@/assets/banners/ai.jpg";
import bannerDegen from "@/assets/banners/degen.jpg";
import bannerMeme from "@/assets/banners/meme.jpg";
import bannerOther from "@/assets/banners/unknown.jpg";

export const GENRE_ICONS = [
  IoImageOutline,
  IoGameControllerOutline,
  IoPeopleOutline,
  IoTrendingUpOutline,
  IoBulbOutline,
  IoRocketOutline,
  IoHappyOutline,
  IoBusinessOutline,
  IoHardwareChipOutline,
  IoShareSocialOutline,
  IoGlobeOutline,
  IoHelpCircleOutline,
];
const BANNERS = [bannerNft, bannerGame, bannerComm, bannerDefi, bannerAi, bannerDegen, bannerMeme];
export const genreBanner = (id) => BANNERS[Number(id)] ?? bannerOther;

const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** DAO logo, falling back to genre-tinted initials (DAOCard.renderImage). */
export function DaoAvatar({ name, imageUrl, genreId, size = 48, className = "" }) {
  const [broken, setBroken] = useState(false);
  const g = genreOf(genreId);
  const style = { width: size, height: size };
  if (imageUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" style={style} onError={() => setBroken(true)} className={`shrink-0 rounded-xl bg-surface object-cover ${className}`} />
    );
  }
  return (
    <span
      style={{ ...style, background: `color-mix(in srgb, ${g.color} 15%, transparent)`, color: g.color, fontSize: size * 0.34 }}
      className={`flex shrink-0 items-center justify-center rounded-xl font-extrabold tracking-wide ${className}`}
    >
      {initials(name)}
    </span>
  );
}

export function GenreChip({ genreId, size = "sm" }) {
  const g = genreOf(genreId);
  const Icon = GENRE_ICONS[g.id];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold ${size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
      style={{ color: g.color, background: `color-mix(in srgb, ${g.color} 12%, transparent)` }}
    >
      <Icon size={size === "sm" ? 11 : 13} /> {g.label}
    </span>
  );
}

/** Horizontal genre filter (GenreFilter) — "All" + the 11 genres. */
export function GenreFilter({ value, onChange }) {
  return (
    <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-2 md:px-5">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`h-8 shrink-0 rounded-full border px-3.5 text-xs font-semibold ${value === null ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-text-secondary hover:text-text"}`}
      >
        All
      </button>
      {Array.from({ length: 11 }, (_, id) => {
        const g = genreOf(id);
        const Icon = GENRE_ICONS[id];
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : id)}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-xs font-semibold"
            style={
              active
                ? { color: g.color, borderColor: g.color, background: `color-mix(in srgb, ${g.color} 13%, transparent)` }
                : { color: "var(--text-secondary)", borderColor: "var(--border)", background: "var(--surface)" }
            }
          >
            <Icon size={14} /> {g.label}
          </button>
        );
      })}
    </div>
  );
}

/** List / grid card (DAOCard). */
export function DaoCard({ dao, grid, holding }) {
  const href = `/daos/${dao.chainId}/${dao.address}`;
  if (grid) {
    return (
      <Link href={href} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40">
        <div className="relative h-28 overflow-hidden">
          {dao.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dao.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <Image src={genreBanner(dao.genreId)} alt="" fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover transition-transform duration-300 group-hover:scale-105" placeholder="blur" />
          )}
          <span className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/55 to-transparent" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: genreOf(dao.genreId).color }} />
          {holding && <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-on-primary">HOLDING</span>}
        </div>
        <div className="space-y-1.5 p-3">
          <p className="line-clamp-2 font-semibold leading-5 text-text">{dao.name}</p>
          <p className="font-mono text-[10px] font-semibold text-primary">{formatAddress(dao.address, 4)}</p>
          <GenreChip genreId={dao.genreId} />
        </div>
      </Link>
    );
  }
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/40">
      <DaoAvatar name={dao.name} imageUrl={dao.imageUrl} genreId={dao.genreId} size={56} />
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-text">{dao.name}</span>
          {holding && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-extrabold text-primary">HOLDING</span>}
        </span>
        <span className="block font-mono text-[11px] font-semibold text-primary">{formatAddress(dao.address, 4)}</span>
        <GenreChip genreId={dao.genreId} />
      </span>
      <IoChevronForward size={16} className="shrink-0 text-text-tertiary" />
    </Link>
  );
}

export function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META[5];
  return (
    <span className="rounded-md px-2 py-0.5 text-[11px] font-bold" style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 12%, transparent)` }}>
      {m.label}
    </span>
  );
}

export function TypeBadge({ type }) {
  return <span className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{TYPE_LABELS[type] ?? "Unknown"}</span>;
}

/** Proposal tallies in "votes" (√tokens), with shares of the total. */
export function tally(p, decimals) {
  const f = displayVotes(p.forVotes, decimals);
  const a = displayVotes(p.againstVotes, decimals);
  const ab = displayVotes(p.abstainVotes, decimals);
  const total = f + a + ab;
  const pct = (n) => (total > 0 ? (n / total) * 100 : 0);
  return { for: f, against: a, abstain: ab, total, forPct: pct(f), againstPct: pct(a), abstainPct: pct(ab) };
}

export function VoteBar({ t, height = 6 }) {
  return (
    <div className="flex overflow-hidden rounded-full bg-border" style={{ height }}>
      {t.forPct > 0 && <span className="bg-up" style={{ width: `${t.forPct}%` }} />}
      {t.againstPct > 0 && <span className="bg-down" style={{ width: `${t.againstPct}%` }} />}
      {t.abstainPct > 0 && <span className="bg-neutral" style={{ width: `${t.abstainPct}%` }} />}
    </div>
  );
}

export const voteEndsAt = (p, info) => (p.timestamp + (info?.votingPeriodHours ?? 0) * 3600) * 1000;

export function timeLeft(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

/**
 * Proposal card (ActiveProposalTab / PastProposalTab ProposalCard). The body
 * links to the proposal; `footer` (vote / finalize / execute buttons) sits
 * outside the link so controls aren't nested in an anchor.
 */
export function ProposalCard({ p, info, ballot, now, href, footer }) {
  const t = tally(p, info.token.decimals);
  const ended = now >= voteEndsAt(p, info);
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40">
      <Link href={href} className="block p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={p.status} />
            <TypeBadge type={p.proposalType} />
            {ballot ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-up/10 px-2 py-0.5 text-[11px] font-bold text-up">
                <IoCheckmarkDone size={12} /> Voted {VOTE_LABELS[ballot]}
              </span>
            ) : null}
          </span>
          <span className="text-xs font-semibold text-text-tertiary">#{p.id}</span>
        </div>
        <p className="line-clamp-2 font-bold text-text">{p.title}</p>
        <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">{p.description}</p>
  
        {p.proposalType === ProposalType.FUNDING && p.amount > 0n && (
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary">
            <IoCashOutline size={13} /> {formatBalance(formatUnits(p.amount, info.token.decimals))} {info.token.symbol}
          </span>
        )}
  
        <div className="mt-3 space-y-2">
          <VoteBar t={t} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1 font-semibold text-text">
              <IoCheckmarkCircle size={13} className="text-up" /> {formatVotes(t.for)}
              {t.total > 0 && <span className="text-up">{Math.round(t.forPct)}%</span>}
            </span>
            <span className="flex items-center gap-1 font-semibold text-text">
              <IoCloseCircle size={13} className="text-down" /> {formatVotes(t.against)}
            </span>
            <span className="flex items-center gap-1 font-semibold text-text">
              <IoRemoveCircle size={13} className="text-neutral" /> {formatVotes(t.abstain)}
            </span>
            <span className="ml-auto text-text-tertiary">
              {p.status === 0
                ? !now
                  ? ""
                  : ended
                    ? "Voting ended — ready to finalize"
                    : timeLeft(voteEndsAt(p, info) - now)
                : new Date(p.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>
      </Link>
      {footer && <div className="border-t border-divider px-4 py-3">{footer}</div>}
    </div>
  );
}

export const voteOptionMeta = {
  [VoteOption.FOR]: { label: "For", Icon: IoCheckmarkCircle, cls: "bg-up text-white" },
  [VoteOption.AGAINST]: { label: "Against", Icon: IoCloseCircle, cls: "bg-down text-white" },
  [VoteOption.ABSTAIN]: { label: "Abstain", Icon: IoRemoveCircle, cls: "bg-neutral text-white" },
};
