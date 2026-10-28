"use client";
// components/news/NewsCard.js — news in the feed: a story (articles about one
// event) or an insight (DefiLlama data). Built on the post card's frame —
// same row divider, padding, avatar slot and action bar (comments, reactions,
// share, views) — so it sits naturally in the timeline, but it reads as news:
// a "News" band like the repost band, a rounded-square publisher mark in the
// secondary blue (tribes are round and green), a bold headline, a wide image
// with coin chips, and a link out to the source. Insights get a data tile with
// a big up/down figure.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IoChatbubbleOutline,
  IoHeart,
  IoHeartOutline,
  IoShareOutline,
  IoBarChartOutline,
  IoCheckmark,
  IoNewspaperOutline,
  IoAnalyticsOutline,
  IoOpenOutline,
  IoArrowUp,
  IoArrowDown,
  IoShieldOutline,
} from "react-icons/io5";
import Popover from "@/components/ui/Popover";
import { useNewsReact } from "@/hooks/news";
import { useSignInGate } from "@/hooks/useSignInGate";
import { formatCount, timeAgo } from "@/lib/format";
import { REACTIONS } from "@/lib/tribeApi";
import { newsPath, trackNewsImpression } from "@/lib/news/api";
import { domainOf, insightLabel, insightMetric, monogram, topicLabel } from "@/lib/news/format";

const seen = new Set(); // impressions recorded this session

function useImpression(ref, key) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !key || seen.has(key)) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !seen.has(key)) {
          seen.add(key);
          trackNewsImpression(key);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, key]);
}

/** Publisher mark: rounded square, blue — tribes are round and green. */
function SourceMark({ name, size = 42 }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-xl bg-secondary/15 font-black tracking-tight text-secondary shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--secondary)_25%,transparent)]"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {monogram(name)}
    </span>
  );
}

function Band({ Icon, children }) {
  return (
    <p className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold text-secondary">
      <Icon size={14} />
      <span className="truncate">{children}</span>
    </p>
  );
}

/** The post card's action bar, for news: comments · reactions · share · views. */
export function NewsActions({ card }) {
  const s = card.social ?? { reactionCounts: {}, commentsCount: 0, impressionCount: 0, myReaction: null };
  const react = useNewsReact();
  const { requireSignIn } = useSignInGate();
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [shared, setShared] = useState(false);
  const counts = s.reactionCounts || {};
  const total = Object.values(counts).reduce((a, n) => a + (n || 0), 0);
  const myEmoji = REACTIONS.find((r) => r.type === s.myReaction)?.emoji;
  const href = newsPath(card.key);

  const share = async () => {
    const url = `${window.location.origin}${href}`;
    const title = card.story?.title ?? card.insight?.title;
    if (navigator.share) return navigator.share({ title, url }).catch(() => {});
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  };

  return (
    <>
      <div className="mt-1 flex items-center px-2 pb-1">
        <Link href={href} aria-label="Comments" className="flex items-center gap-1.5 rounded-full px-3 py-2.5 text-text-secondary hover:bg-hover hover:text-text">
          <IoChatbubbleOutline size={23} />
          {s.commentsCount > 0 && <span className="text-sm tabular-nums">{formatCount(s.commentsCount)}</span>}
        </Link>
        {/* Like (like Twitter): click to like; right-click / hold for the other reactions */}
        <button
          ref={btn}
          type="button"
          onClick={requireSignIn(() => {
            setOpen(false);
            react.mutate({ key: card.key, type: "heart" });
          })}
          onContextMenu={(e) => {
            e.preventDefault();
            requireSignIn(() => setOpen((v) => !v))();
          }}
          aria-label={s.myReaction === "heart" ? "Unlike" : "Like"}
          aria-pressed={s.myReaction === "heart"}
          title="Like · right-click for more reactions"
          className={`flex items-center gap-1.5 rounded-full px-3 py-2.5 hover:bg-hover ${
            s.myReaction === "heart" ? "text-like" : s.myReaction ? "text-primary" : "text-text-secondary hover:text-like"
          }`}
        >
          {s.myReaction && s.myReaction !== "heart" ? (
            <span className="text-[22px] leading-none">{myEmoji}</span>
          ) : s.myReaction === "heart" ? (
            <IoHeart size={23} />
          ) : (
            <IoHeartOutline size={23} />
          )}
          {total > 0 && <span className="text-sm tabular-nums">{formatCount(total)}</span>}
        </button>
        <button type="button" onClick={share} aria-label="Share" className="rounded-full px-3 py-2.5 text-text-secondary hover:bg-hover hover:text-text">
          {shared ? <IoCheckmark size={23} className="text-primary" /> : <IoShareOutline size={23} />}
        </button>
        <span className="ml-auto flex items-center gap-1 px-3 text-xs text-text-tertiary" title="Views">
          <IoBarChartOutline size={20} />
          {s.impressionCount > 0 && formatCount(s.impressionCount)}
        </span>
      </div>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={btn} placement="bottom-start" className="flex min-w-0 gap-1 px-2 py-2">
        {REACTIONS.map((r) => (
          <button
            key={r.type}
            type="button"
            title={r.label}
            aria-pressed={s.myReaction === r.type}
            onClick={() => {
              setOpen(false);
              react.mutate({ key: card.key, type: r.type });
            }}
            className={`flex flex-col items-center rounded-xl px-2 py-1.5 transition-transform hover:scale-110 hover:bg-hover ${s.myReaction === r.type ? "bg-primary/15" : ""}`}
          >
            <span className="text-2xl leading-none">{r.emoji}</span>
            {counts[r.type] > 0 && <span className="mt-0.5 text-[10px] font-bold text-text-secondary">{counts[r.type]}</span>}
          </button>
        ))}
      </Popover>
    </>
  );
}

function CoinChips({ coins, overlay }) {
  if (!coins?.length) return null;
  return (
    <span className={`flex flex-wrap gap-1.5 ${overlay ? "absolute bottom-2.5 left-2.5" : ""}`}>
      {coins.slice(0, 4).map((c) => (
        <span
          key={c}
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${overlay ? "bg-black/55 text-white backdrop-blur-sm" : "bg-secondary/12 text-secondary"}`}
        >
          ${c}
        </span>
      ))}
    </span>
  );
}

// ─── Story ───────────────────────────────────────────────────────────────────
export function StoryCard({ card, detail = false }) {
  const ref = useRef(null);
  const st = card.story;
  const [imgErr, setImgErr] = useState(false);
  useImpression(ref, card.key);
  const href = newsPath(card.key);
  const topic = topicLabel(st.topics);
  const showImage = st.imageUrl && !imgErr;
  const Headline = detail ? "h1" : "h3";

  return (
    <article ref={ref} className="border-b border-divider">
      <Band Icon={IoNewspaperOutline}>
        News{topic ? ` · ${topic}` : ""}
        {st.sourceCount > 1 ? ` · ${st.sourceCount} outlets` : ""}
      </Band>

      <header className="flex items-center gap-3 px-4 pt-2">
        <SourceMark name={st.sourceName} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-text">
            {st.sourceName}
            {st.sourceCount > 1 && <span className="font-semibold text-text-tertiary"> +{st.sourceCount - 1}</span>}
          </span>
          <span className="block truncate text-xs text-text-secondary">
            {domainOf(st.url)} · {timeAgo(Date.parse(st.firstSeen))}
          </span>
        </span>
        <a href={st.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Read on ${st.sourceName}`} title={`Read on ${st.sourceName}`} className="rounded-full p-2 text-text-tertiary hover:bg-hover hover:text-secondary">
          <IoOpenOutline size={17} />
        </a>
      </header>

      <Link href={href} className={`block px-4 pt-2 ${detail ? "pointer-events-none" : ""}`}>
        <Headline className={`font-extrabold leading-snug tracking-[-0.2px] text-text ${detail ? "text-xl" : "text-[17px]"}`}>{st.title}</Headline>
        {st.excerpt && <p className={`mt-1 text-sm leading-5 text-text-secondary ${detail ? "" : "line-clamp-2"}`}>{st.excerpt}</p>}
        {!showImage && (
          <span className="mt-2 block">
            <CoinChips coins={st.coins} />
          </span>
        )}
      </Link>

      {showImage && (
        <Link href={href} className={`relative mx-4 mt-3 block overflow-hidden rounded-2xl bg-surface ${detail ? "pointer-events-none" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={st.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgErr(true)} className="aspect-[1.91/1] w-full object-cover" />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
          <CoinChips coins={st.coins} overlay />
        </Link>
      )}

      <a href={st.url} target="_blank" rel="noopener noreferrer nofollow" className="mx-4 mt-2 inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline">
        Read on {st.sourceName} <IoOpenOutline size={12} />
      </a>

      <NewsActions card={card} />
    </article>
  );
}

// ─── Insight ─────────────────────────────────────────────────────────────────
export function InsightCard({ card, detail = false }) {
  const ref = useRef(null);
  const ins = card.insight;
  const [imgErr, setImgErr] = useState(false);
  useImpression(ref, card.key);
  const m = insightMetric(ins);
  const hack = ins.kind === "hack";
  const tone = !m ? "text-text" : m.direction === "up" ? "text-up" : "text-down";
  const Arrow = m?.direction === "up" ? IoArrowUp : IoArrowDown;

  return (
    <article ref={ref} className="border-b border-divider">
      <Band Icon={hack ? IoShieldOutline : IoAnalyticsOutline}>
        On-chain data · {insightLabel(ins.kind)} · DefiLlama
      </Band>

      <Link href={newsPath(card.key)} className={`mx-4 mt-2.5 flex items-center gap-4 rounded-2xl border border-panel-border bg-surface p-4 transition-colors hover:border-secondary/40 ${detail ? "pointer-events-none" : ""}`}>
        {ins.imageUrl && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ins.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgErr(true)} className="h-12 w-12 shrink-0 rounded-xl bg-background object-cover" />
        ) : (
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${hack ? "bg-down/10 text-down" : "bg-secondary/12 text-secondary"}`}>
            {hack ? <IoShieldOutline size={22} /> : <IoAnalyticsOutline size={22} />}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-snug text-text">{ins.title}</span>
          {ins.body && <span className="mt-0.5 block text-sm text-text-secondary">{ins.body}</span>}
          <span className="mt-1 block text-xs text-text-tertiary">{timeAgo(Date.parse(ins.updatedAt))}</span>
        </span>
        {m && (
          <span className="shrink-0 text-right">
            <span className={`flex items-center justify-end gap-0.5 text-2xl font-extrabold tabular-nums tracking-tight ${tone}`}>
              {!hack && <Arrow size={18} />}
              {m.value}
            </span>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{m.label}</span>
          </span>
        )}
      </Link>

      {ins.url && (
        <a href={ins.url} target="_blank" rel="noopener noreferrer nofollow" className="mx-4 mt-2 inline-flex items-center gap-1 text-xs font-semibold text-secondary hover:underline">
          {hack ? "Incident details" : "View on DefiLlama"} <IoOpenOutline size={12} />
        </a>
      )}

      <NewsActions card={card} />
    </article>
  );
}

export default function NewsCard({ card, detail }) {
  if (card.type === "story") return <StoryCard card={card} detail={detail} />;
  if (card.type === "insight") return <InsightCard card={card} detail={detail} />;
  return null;
}
