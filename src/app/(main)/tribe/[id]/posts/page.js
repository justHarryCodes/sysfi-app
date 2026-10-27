"use client";
// Tribe posts — port of TribePostScreen: composer prompt (members), posts
// list with reactions/comments/reposts; authors and the owner can delete.
import { IoNewspaperOutline, IoImageOutline } from "react-icons/io5";
import TribeScreen from "@/components/tribe/TribeScreen";
import PostCard from "@/components/post/PostCard";
import { useCompose } from "@/components/post/ComposeContext";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { normaliseFeedPost, useDeletePost, useTribePosts } from "@/hooks/tribes";
import { useLoadMore } from "@/hooks/useLoadMore";

function Posts({ tribe, role }) {
  const { user } = useAuth();
  const { openCompose } = useCompose();
  const { showAlert } = useFeedback();
  const q = useTribePosts(tribe.id);
  const del = useDeletePost();
  const sentinel = useLoadMore(() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage(), !!q.hasNextPage);
  const posts = (q.data?.pages.flat() || []).map((p) => normaliseFeedPost(p, tribe));

  const confirmDelete = (post) =>
    showAlert("Delete post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => del.mutateAsync({ tribeId: tribe.id, postId: post.id }).catch((e) => showAlert("Couldn't delete", e.message)),
      },
    ]);

  return (
    <div>
      {role.isMember && !role.isPending && (
        <button type="button" onClick={() => openCompose(tribe)} className="flex w-full items-center gap-3 border-b border-divider px-4 py-3 text-left hover:bg-hover">
          <Avatar src={user?.profileImageUrl} size={40} />
          <span className="flex-1 text-[15px] text-text-tertiary">Share something with {tribe.name}…</span>
          <IoImageOutline size={20} className="text-primary" />
        </button>
      )}

      {q.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : q.isError && !q.data ? (
        <div className="px-4 py-12 text-center">
          <p className="mb-4 text-sm text-text-secondary">Couldn&apos;t load posts.</p>
          <Button title="Try again" size="small" onClick={() => q.refetch()} />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <IoNewspaperOutline size={40} className="text-text-tertiary" />
          <p className="font-bold text-text">No posts yet</p>
          <p className="text-sm text-text-secondary">{role.isMember ? "Be the first to share something." : "Join the tribe to start posting."}</p>
        </div>
      ) : (
        <>
          {posts.map((p) => (
            <PostCard key={p.id} post={p} canDelete={p.userId === user?.uid || role.isOwner} onDelete={confirmDelete} />
          ))}
          <div ref={sentinel} className="flex justify-center py-6">
            {q.isFetchingNextPage && <Spinner />}
          </div>
        </>
      )}
    </div>
  );
}

export default function TribePostsPage() {
  return <TribeScreen>{(p) => <Posts {...p} />}</TribeScreen>;
}
