"use client";
// Feed — port of ActivityFeedScreen: Activity (ranked posts across tribes,
// new-post polling, with news cards blended in) and Governance (DAOs linked
// to tribes).
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IoArrowUp, IoFlameOutline, IoImageOutline, IoShieldHalfOutline, IoChevronForward } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import PostCard from "@/components/post/PostCard";
import { useCompose } from "@/components/post/ComposeContext";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { normaliseFeedPost, tribeKeys, useDeletePost, useFeed, useGovernanceFeed, usePublicFeed } from "@/hooks/tribes";
import VisitorBanner from "@/components/feed/VisitorBanner";
import { useLoadMore } from "@/hooks/useLoadMore";
import { getChainById } from "@/lib/config";
import { entityTime, pollFeed } from "@/lib/tribeApi";
import { formatAddress } from "@/lib/wallet";
import NewsCard from "@/components/news/NewsCard";
import { useNewsCards } from "@/hooks/news";
import { blendTimeline, cardsNeeded } from "@/lib/news/blend";

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "governance", label: "Governance" },
];

/**
 * Posts with news cards blended in (lib/news/blend.js): one card every few
 * posts, more while the feed is thin. Fetches more cards as posts grow.
 */
function useTimeline(posts) {
  const cards = useNewsCards();
  const all = cards.data?.pages.flat() ?? [];
  const need = cardsNeeded(posts.length);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = cards;
  useEffect(() => {
    if (all.length < need && hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [all.length, need, hasNextPage, isFetchingNextPage, fetchNextPage]);
  return { items: blendTimeline(posts, all), cardCount: all.length, cardsLoading: cards.isPending };
}

const renderItem = (it, postProps) =>
  it.type === "post" ? <PostCard key={it.post.id} post={it.post} showTribe {...postProps(it.post)} /> : <NewsCard key={it.key} card={it} />;

/** Shown above news when the user's tribes have nothing yet (cold start). */
function QuietTribes() {
  return (
    <div className="flex items-center gap-3 border-b border-divider bg-primary/[0.04] px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <IoFlameOutline size={20} />
      </span>
      <span className="min-w-0 flex-1 text-sm text-text-secondary">
        <span className="block font-bold text-text">Your tribes are quiet</span>
        Here&apos;s what&apos;s happening in crypto meanwhile.
      </span>
      <Button as={Link} href="/tribes/search" title="Find tribes" size="small" className="shrink-0 rounded-full" />
    </div>
  );
}

function Activity() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { openCompose } = useCompose();
  const { showAlert } = useFeedback();
  const feed = useFeed();
  const del = useDeletePost();
  const posts = (feed.data?.pages.flat() || []).map((p) => normaliseFeedPost(p));
  const newest = posts.reduce((m, p) => Math.max(m, entityTime(p)), 0);
  const sentinel = useLoadMore(() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage(), !!feed.hasNextPage);
  const { items, cardCount, cardsLoading } = useTimeline(posts);

  const fresh = useQuery({
    queryKey: ["user", user?.uid, "feed-poll", newest],
    queryFn: () => pollFeed(newest),
    enabled: !!user && newest > 0,
    refetchInterval: 30_000,
    staleTime: 25_000,
    meta: { persist: false },
  });
  const newCount = (fresh.data || []).filter((p) => p.userId !== user?.uid).length;

  const showNew = () => {
    qc.resetQueries({ queryKey: tribeKeys.feed(user?.uid) });
    document.getElementById("main-panel")?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDelete = (post) =>
    showAlert("Delete post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => del.mutateAsync({ tribeId: post.guildId, postId: post.id }).catch((e) => showAlert("Couldn't delete", e.message)) },
    ]);

  return (
    <div className="relative">
      <button type="button" onClick={() => openCompose()} className="flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left hover:bg-hover">
        <Avatar src={user?.profileImageUrl} size={40} />
        <span className="flex-1 text-[15px] text-text-tertiary">What&apos;s happening in your tribes?</span>
        <IoImageOutline size={20} className="text-primary" />
      </button>

      {newCount > 0 && (
        <div className="pointer-events-none sticky top-2 z-10 flex justify-center md:top-[130px]">
          <button
            type="button"
            onClick={showNew}
            className="glow-primary pointer-events-auto flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary [animation:pop-in_200ms_ease-out]"
          >
            <IoArrowUp size={16} /> {newCount} new {newCount === 1 ? "post" : "posts"}
          </button>
        </div>
      )}

      {feed.isPending || (posts.length === 0 && cardsLoading) ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : feed.isError && !feed.data ? (
        <div className="px-4 py-16 text-center">
          <p className="mb-4 text-sm text-text-secondary">Couldn&apos;t load the feed.</p>
          <Button title="Try again" size="small" onClick={() => feed.refetch()} />
        </div>
      ) : posts.length === 0 && cardCount === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IoFlameOutline size={36} />
          </span>
          <p className="text-lg font-bold text-text">Nothing here yet</p>
          <p className="text-sm text-text-secondary">Join a few tribes and their posts will show up here.</p>
          <Button as={Link} href="/tribes/search" title="Find tribes" size="small" className="mt-2 rounded-full" />
        </div>
      ) : (
        <>
          {posts.length === 0 && <QuietTribes />}
          {items.map((it) => renderItem(it, (p) => ({ canDelete: p.userId === user?.uid, onDelete: confirmDelete })))}
          <div ref={sentinel} className="flex justify-center py-8">
            {feed.isFetchingNextPage ? <Spinner /> : !feed.hasNextPage && <span className="text-xs text-text-tertiary">You&apos;re all caught up</span>}
          </div>
        </>
      )}
    </div>
  );
}

function Governance() {
  const q = useGovernanceFeed();
  const daos = q.data?.linkedDAOs || [];
  if (q.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }
  if (!daos.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IoShieldHalfOutline size={36} />
        </span>
        <p className="text-lg font-bold text-text">No Governance Yet</p>
        <p className="text-sm text-text-secondary">When tribes link a DAO, its proposals show up here.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-2 p-4">
      {daos.map((d) => (
        <li key={`${d.guildId}-${d.daoAddress}`}>
          <Link href={`/daos/${d.chainId}/${d.daoAddress}`} className="flex items-center gap-3 rounded-2xl bg-surface p-4 hover:bg-hover">
            <TribeAvatar src={d.guildLogo} name={d.guildName} size={44} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold text-text">{d.guildName}</span>
              <span className="block truncate text-xs text-text-tertiary">
                DAO {formatAddress(d.daoAddress, 4)} · {getChainById(d.chainId)?.name ?? `Chain ${d.chainId}`}
              </span>
            </span>
            <IoChevronForward size={18} className="text-text-tertiary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Signed out: recent posts from public tribes. */
function PublicActivity() {
  const feed = usePublicFeed();
  const posts = (feed.data || []).map((p) => normaliseFeedPost(p));
  const { items } = useTimeline(posts);
  return (
    <div>
      <VisitorBanner />
      {feed.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : !items.length ? (
        <p className="px-6 py-16 text-center text-sm text-text-secondary">No public posts yet — be the first to start a tribe.</p>
      ) : (
        items.map((it) => renderItem(it, () => ({})))
      )}
    </div>
  );
}

export default function FeedPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("activity");
  if (!user) {
    return (
      <>
        <PageHeader title="Feed" subtitle="Public tribes" />
        <PublicActivity />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Feed" tabs={TABS} activeTab={tab} onTabChange={setTab} />
      {tab === "activity" ? <Activity /> : <Governance />}
    </>
  );
}
