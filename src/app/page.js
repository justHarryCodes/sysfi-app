// "/" — the public landing (replaces the old website/). FlowGate sends
// signed-in users on to their feed.
import Landing from "@/components/landing/Landing";

export const metadata = {
  title: { absolute: "Sysfi — Build, Grow & Own" },
  description: "The on-chain community and governance layer: token-gated tribes, chat, DAOs and voting, a multichain wallet, and mini-apps — on the web and in the app.",
};

export default function RootPage() {
  return <Landing />;
}
