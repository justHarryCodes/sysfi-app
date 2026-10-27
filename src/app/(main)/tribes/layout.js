import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({ title: "Tribes", description: "Find communities on Sysfi — token-gated tribes with chat, posts and on-chain governance.", path: "/tribes" });

export default function TribesLayout({ children }) {
  return children;
}
