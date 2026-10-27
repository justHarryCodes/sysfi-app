"use client";
// components/post/PostCard.js — port of FeedPostCard / PostCard.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IoChatbubbleOutline,
  IoRepeat,
  IoHappyOutline,
  IoShareOutline,
  IoBarChartOutline,
  IoTrashOutline,
  IoFlame,
  IoCheckmark,
} from "react-icons/io5";
import Avatar from "@/components/ui/Avatar";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import { PersonLink } from "@/components/people/PersonCard";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Popover from "@/components/ui/Popover";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useReact, useRepost } from "@/hooks/tribes";
import { useSignInGate } from "@/hooks/useSignInGate";
import { formatCount, timeAgo } from "@/lib/format";
import { REACTIONS, entityTime, postUrl, trackImpression } from "@/lib/tribeApi";

const CAPTION_LIMIT = 280;
const seen = new Set(); // impressions recorded this session

function useImpression(ref, tribeId, postId) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !postId || seen.has(postId)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !seen.has(postId)) {
          seen.add(postId);
          trackImpression(tribeId, postId);
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, tribeId, postId]);
}

function RepostDialog({ post, onClose }) {
  const repost = useRepost();
  const { showAlert } = useFeedback();
  const [comment, setComment] = useState("");
  const submit = async () => {
    try {
      await repost.mutateAsync({ tribeId: post.guildId, postId: post.id, comment: comment.trim() });
      onClose();
    } catch (e) {
      showAlert("Couldn't repost", e.status === 409 ? "You've already reposted this." : e.message);
    }
  };
  return (
    <Modal open onClose={onClose} labelledBy="repost-title">
      <h2 id="repost-title" className="mb-3 text-lg font-bold text-text">
        Repost
      </h2>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={280}
        rows={3}
        placeholder="Add a comment (optional)"
        className="mb-3 w-full resize-none rounded-xl border-2 border-border bg-surface p-3 text-md text-text outline-none focus:border-primary"
      />
      <div className="mb-4 rounded-xl bg-surface p-3 text-sm text-text-secondary">
        <span className="font-semibold text-text">{post.username}</span>: {post.description?.slice(0, 140)}
        {post.description?.length > 140 ? "…" : ""}
      </div>
      <Button title="Repost" icon={<IoRepeat size={18} />} fullWidth loading={repost.isPending} onClick={submit} className="mb-2" />
      <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
    </Modal>
  );
}

export default function PostCard({ post, showTribe = false, canDelete = false, onDelete, linkToDetail = true }) {
  const ref = useRef(null);
  const reactBtn = useRef(null);
  const react = useReact();
  const { requireSignIn } = useSignInGate();
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [repostOpen, setRepostOpen] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const [shared, setShared] = useState(false);
  useImpression(ref, post.guildId, post.id);

  const href = `/post/${post.guildId}/${post.id}`;
  const counts = post.reactionCounts || {};
  const totalReactions = Object.values(counts).reduce((s, n) => s + (n || 0), 0);
  const myEmoji = REACTIONS.find((r) => r.type === post.myReaction)?.emoji;
  const long = post.description?.length > CAPTION_LIMIT;
  const caption = long && !expanded ? `${post.description.slice(0, CAPTION_LIMIT)}…` : post.description;

  const share = async () => {
    const url = postUrl(post.guildId, post.id);
    if (navigator.share) return navigator.share({ title: post.tribeName || "Tribe", text: post.description?.slice(0, 120), url }).catch(() => {});
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 1500);
  };

  return (
    <article ref={ref} className="border-b border-divider">
      {post.isRepost && (
        <p className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold text-text-tertiary">
          <IoRepeat size={14} /> {post.username} reposted{post.repostComment ? `: “${post.repostComment}”` : ""}
        </p>
      )}

      <header className="flex items-center gap-3 px-4 pt-3">
        {showTribe ? (
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <Link href={`/tribe/${post.guildId}`} className="shrink-0">
              <TribeAvatar src={post.tribeLogoUrl} name={post.tribeName} size={42} />
            </Link>
            <span className="min-w-0">
              <Link href={`/tribe/${post.guildId}`} className="block truncate font-bold text-text">
                {post.tribeName}
              </Link>
              <span className="block truncate text-xs text-text-secondary">
                {post.isRepost && post.originalAuthor ? `Originally by ${post.originalAuthor} · ` : ""}
                <PersonLink uid={post.userId}>{post.username}</PersonLink> · {timeAgo(entityTime(post))}
              </span>
            </span>
          </span>
        ) : (
          <PersonLink uid={post.userId} className="flex min-w-0 flex-1 items-center gap-3 hover:no-underline">
            <Avatar src={post.userAvatar} size={42} />
            <span className="min-w-0">
              <span className="block truncate font-bold text-text hover:underline">{post.username}</span>
              <span className="block text-xs text-text-secondary">{timeAgo(entityTime(post))}</span>
            </span>
          </PersonLink>
        )}
        {post.visibilityScore > 500 && (
          <span title="Trending" className="rounded-full bg-primary/15 p-1.5 text-primary">
            <IoFlame size={12} />
          </span>
        )}
        {canDelete && (
          <button type="button" onClick={() => onDelete?.(post)} aria-label="Delete post" className="rounded-full p-1.5 text-text-tertiary hover:bg-hover hover:text-error">
            <IoTrashOutline size={17} />
          </button>
        )}
      </header>

      {post.description && (
        <div className="px-4 pt-2">
          {linkToDetail ? (
            <Link href={href} className="block whitespace-pre-line text-[15px] leading-6 text-text">
              {caption}
            </Link>
          ) : (
            <p className="whitespace-pre-line text-[15px] leading-6 text-text">{caption}</p>
          )}
          {long && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="text-sm font-semibold text-primary">
              {expanded ? "Show less" : "...more"}
            </button>
          )}
        </div>
      )}

      {post.imageUrl && !imgErr && (
        <Link href={href} className={`mx-4 mt-3 block overflow-hidden rounded-2xl bg-surface ${linkToDetail ? "" : "pointer-events-none"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.imageUrl} alt="" loading="lazy" onError={() => setImgErr(true)} className="max-h-[520px] w-full object-cover" />
        </Link>
      )}

      <div className="mt-1 flex items-center px-2 pb-1">
        <Link href={href} aria-label="Comments" className="flex items-center gap-1.5 rounded-full px-3 py-2.5 text-text-secondary hover:bg-hover hover:text-text">
          <IoChatbubbleOutline size={18} />
          {post.commentsCount > 0 && <span className="text-sm tabular-nums">{formatCount(post.commentsCount)}</span>}
        </Link>
        <button
          type="button"
          onClick={requireSignIn(() => !post.hasReposted && setRepostOpen(true))}
          aria-label="Repost"
          aria-pressed={!!post.hasReposted}
          className={`flex items-center gap-1.5 rounded-full px-3 py-2.5 hover:bg-hover ${post.hasReposted ? "text-primary" : "text-text-secondary hover:text-text"}`}
        >
          <IoRepeat size={19} />
          {post.repostCount > 0 && <span className="text-sm tabular-nums">{formatCount(post.repostCount)}</span>}
        </button>
        <button
          ref={reactBtn}
          type="button"
          onClick={requireSignIn(() => setPickerOpen((v) => !v))}
          aria-label="React"
          aria-expanded={pickerOpen}
          className={`flex items-center gap-1.5 rounded-full px-3 py-2.5 hover:bg-hover ${post.myReaction ? "text-primary" : "text-text-secondary hover:text-text"}`}
        >
          {myEmoji ? <span className="text-[17px] leading-none">{myEmoji}</span> : <IoHappyOutline size={18} />}
          {totalReactions > 0 && <span className="text-sm tabular-nums">{formatCount(totalReactions)}</span>}
        </button>
        <button type="button" onClick={share} aria-label="Share" className="rounded-full px-3 py-2.5 text-text-secondary hover:bg-hover hover:text-text">
          {shared ? <IoCheckmark size={18} className="text-primary" /> : <IoShareOutline size={18} />}
        </button>
        <span className="ml-auto flex items-center gap-1 px-3 text-xs text-text-tertiary" title="Views">
          <IoBarChartOutline size={15} />
          {post.impressionCount > 0 && formatCount(post.impressionCount)}
        </span>
      </div>

      <Popover open={pickerOpen} onClose={() => setPickerOpen(false)} anchorRef={reactBtn} placement="bottom-end" className="flex min-w-0 gap-1 px-2 py-2">
        {REACTIONS.map((r) => (
          <button
            key={r.type}
            type="button"
            title={r.label}
            aria-pressed={post.myReaction === r.type}
            onClick={() => {
              setPickerOpen(false);
              react.mutate({ tribeId: post.guildId, postId: post.id, type: r.type });
            }}
            className={`flex flex-col items-center rounded-xl px-2 py-1.5 transition-transform hover:scale-110 hover:bg-hover ${
              post.myReaction === r.type ? "bg-primary/15" : ""
            }`}
          >
            <span className="text-2xl leading-none">{r.emoji}</span>
            {counts[r.type] > 0 && <span className="mt-0.5 text-[10px] font-bold text-text-secondary">{counts[r.type]}</span>}
          </button>
        ))}
      </Popover>

      {repostOpen && <RepostDialog post={post} onClose={() => setRepostOpen(false)} />}
    </article>
  );
}
