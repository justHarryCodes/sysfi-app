"use client";
// Post detail — port of PostDetailScreen + CommentsModal. URL matches the
// app's deep link: /post/:tribeId/:postId.
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { IoSend, IoChatbubblesOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import PostCard from "@/components/post/PostCard";
import Avatar from "@/components/ui/Avatar";
import { PersonLink } from "@/components/people/PersonCard";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { normaliseFeedPost, useAddComment, useComments, useDeletePost, usePost, useTribeDetail, useTribeRole } from "@/hooks/tribes";
import { timeAgo } from "@/lib/format";
import { useSignInGate } from "@/hooks/useSignInGate";
import { entityTime } from "@/lib/tribeApi";

const MAX = 300;

export default function PostDetailPage() {
  const { tribeId, postId } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const tribe = useTribeDetail(tribeId);
  const role = useTribeRole(tribe.data);
  const post = usePost(tribeId, postId);
  const comments = useComments(tribeId, postId);
  const add = useAddComment(tribeId, postId);
  const del = useDeletePost();
  const [text, setText] = useState("");

  const list = comments.data?.pages.flat() || [];

  const { requireSignIn } = useSignInGate();
  const submit = async (e) => {
    e.preventDefault();
    if (!user) return requireSignIn()();
    if (!text.trim()) return;
    try {
      await add.mutateAsync(text.trim());
      setText("");
    } catch (err) {
      showAlert("Couldn't comment", err.message);
    }
  };

  const onDelete = (p) =>
    showAlert("Delete post?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          del
            .mutateAsync({ tribeId, postId: p.id })
            .then(() => router.replace(`/tribe/${tribeId}/posts`))
            .catch((err) => showAlert("Couldn't delete", err.message)),
      },
    ]);

  return (
    <>
      <PageHeader title="Post" subtitle={tribe.data?.name} backHref={`/tribe/${tribeId}/posts`} />
      {post.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : !post.data || post.data.isDeleted ? (
        <p className="px-4 py-16 text-center text-sm text-text-secondary">This post doesn&apos;t exist or was deleted.</p>
      ) : (
        <>
          <PostCard
            post={normaliseFeedPost(post.data, tribe.data)}
            showTribe
            linkToDetail={false}
            canDelete={post.data.userId === user?.uid || role.isOwner}
            onDelete={onDelete}
          />

          <form onSubmit={submit} className="flex items-start gap-3 border-b border-divider px-4 py-3">
            <Avatar src={user?.profileImageUrl} size={36} />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) submit(e);
              }}
              rows={1}
              placeholder="Post your reply"
              aria-label="Write a comment"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-text outline-none placeholder:text-text-tertiary [field-sizing:content]"
            />
            <button
              type="submit"
              disabled={!text.trim() || add.isPending}
              aria-label="Send comment"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-40"
            >
              {add.isPending ? <Spinner size={14} className="text-on-primary" /> : <IoSend size={15} />}
            </button>
          </form>

          {comments.isPending ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <IoChatbubblesOutline size={34} className="text-text-tertiary" />
              <p className="text-sm text-text-secondary">No comments yet. Start the conversation.</p>
            </div>
          ) : (
            <ul>
              {list.map((c) => (
                <li key={c.id} className="flex gap-3 border-b border-divider px-4 py-3">
                  <PersonLink uid={c.userId} className="shrink-0 self-start" label={`View ${c.username || "commenter"}`}>
                    <Avatar src={c.userAvatar} size={36} />
                  </PersonLink>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <PersonLink uid={c.userId} className="font-bold text-text">{c.username}</PersonLink>{" "}
                      <span className="text-text-tertiary">· {timeAgo(entityTime(c))}</span>
                    </p>
                    <p className="whitespace-pre-line text-[15px] leading-6 text-text">{c.text}</p>
                  </div>
                </li>
              ))}
              {comments.hasNextPage && (
                <li className="p-4 text-center">
                  <button type="button" onClick={() => comments.fetchNextPage()} className="text-sm font-semibold text-primary">
                    {comments.isFetchingNextPage ? "Loading…" : "Show more comments"}
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </>
  );
}
