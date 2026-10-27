// Server layout for every /tribe/[id] page: link previews and search metadata
// from the tribe itself. Private tribes get a generic title.
import { backendData, clip, pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const t = await backendData(`/guilds/${encodeURIComponent(id)}`);
  if (!t || t.privacy !== "public") return { title: "Tribe", robots: { index: false } };
  const members = Number(t.memberCount ?? t.member_count ?? 0);
  return pageMeta({
    title: t.name,
    description: clip(t.description) || `${t.name} on Sysfi — ${members.toLocaleString()} member${members === 1 ? "" : "s"}${t.genre ? ` · ${t.genre}` : ""}.`,
    path: `/tribe/${id}`,
  });
}

export default function TribeLayout({ children }) {
  return children;
}
