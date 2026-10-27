import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Feed", description: "What's happening across public tribes on Sysfi.", path: "/feed" });

export default function FeedLayout({ children }) {
  return children;
}
