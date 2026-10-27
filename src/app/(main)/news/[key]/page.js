"use client";
// News card page — /news/<key> ("story:<uuid>" | "insight:<id>"): the full
// card, every outlet's take on the story, and the comment thread. Mirrors the
// post detail page.
import { useState } from "react";
import { useParams } from "next/navigation";
import { IoSend, IoChatbubblesOutline, IoOpenOutline, IoTrashOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import NewsCard from "@/components/news/NewsCard";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useAddNewsComment, useDeleteNewsComment, useNewsComments, useNewsItem } from "@/hooks/news";
import { useSignInGate } from "@/hooks/useSignInGate";
import { timeAgo } from "@/lib/format";
import { domainOf } from "@/lib/news/format";

const MAX = 300;

function Outlets({ articles }) {
  if (!articles?.length || articles.length < 2) return null;
  return (
    <section className="border-b border-divider px-4 py-3">
      <h2 className="mb-2 text-[11px] font-extrabold uppercase tracking-[1.2px] text-text-tertiary">Coverage · {articles.length} outlets</h2>
      <ul className="space-y-1">
        {articles.map((a) => (
          <li key={a.id}>
            <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-hover">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug text-text">{a.title}</span>
                <span className="block text-xs text-text-tertiary">
                  {a.sourceName} · {domainOf(a.url)} · {timeAgo(Date.parse(a.publishedAt))}
                </span>
              </span>
              <IoOpenOutline size={14} className="mt-1 shrink-0 text-text-tertiary" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function NewsItemPage() {
  const { key: raw } = useParams();
  const key = decodeURIComponent(raw);
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const { requireSignIn } = useSignInGate();
  const item = useNewsItem(key);
  const comments = useNewsComments(key);
  const add = useAddNewsComment(key);
  const del = useDeleteNewsComment(key);
  const [text, setText] = useState("");
  const list = comments.data?.pages.flat() || [];

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

  return (
    <>
      <PageHeader title={item.data?.type === "insight" ? "On-chain data" : "News"} backHref="/feed" />
      {item.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : !item.data ? (
        <p className="px-4 py-16 text-center text-sm text-text-secondary">This story is no longer available.</p>
      ) : (
        <>
          <NewsCard card={item.data} detail />
          <Outlets articles={item.data.story?.articles} />

          <form onSubmit={submit} className="flex items-start gap-3 border-b border-divider px-4 py-3">
            <Avatar src={user?.profileImageUrl} size={36} />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) submit(e);
              }}
              rows={1}
              placeholder="What do you make of it?"
              aria-label="Write a comment"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-text outline-none placeholder:text-text-tertiary [field-sizing:content]"
            />
            <button type="submit" disabled={!text.trim() || add.isPending} aria-label="Send comment" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary disabled:opacity-40">
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
                <li key={c.id} className="group flex gap-3 border-b border-divider px-4 py-3">
                  <Avatar src={c.userAvatar} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-bold text-text">{c.username}</span> <span className="text-text-tertiary">· {timeAgo(c.timestamp)}</span>
                    </p>
                    <p className="whitespace-pre-line text-[15px] leading-6 text-text">{c.text}</p>
                  </div>
                  {c.userId === user?.uid && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      onClick={() => del.mutate(c.id, { onError: (e) => showAlert("Couldn't delete", e.message) })}
                      className="self-start rounded-full p-1.5 text-text-tertiary opacity-0 transition-opacity hover:bg-hover hover:text-error group-hover:opacity-100 focus:opacity-100"
                    >
                      <IoTrashOutline size={16} />
                    </button>
                  )}
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
