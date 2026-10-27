// Server layout for a post: previews quote the post (public tribes only).
import { backendData, clip, pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }) {
  const { tribeId, postId } = await params;
  const [post, tribe] = await Promise.all([
    backendData(`/guilds/${encodeURIComponent(tribeId)}/posts/${encodeURIComponent(postId)}`, 120),
    backendData(`/guilds/${encodeURIComponent(tribeId)}`),
  ]);
  if (!post || !tribe || tribe.privacy !== "public") return { title: "Post", robots: { index: false } };
  const author = post.username ? `@${post.username}` : "A member";
  return pageMeta({
    title: `${author} in ${tribe.name}`,
    description: clip(post.description) || `A post in ${tribe.name} on Sysfi.`,
    path: `/post/${tribeId}/${postId}`,
    image: post.imageUrl || undefined,
    type: "article",
  });
}

export default function PostLayout({ children }) {
  return children;
}
