import ProposalScreen from "@/components/dao/ProposalScreen";
import { backendData, clip, pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }) {
  const { chainId, address, id } = await params;
  const addr = encodeURIComponent(address.toLowerCase());
  const [dao, p] = await Promise.all([backendData(`/daos/${encodeURIComponent(chainId)}/${addr}`), backendData(`/proposals/${encodeURIComponent(chainId)}/${addr}/${encodeURIComponent(id)}`, 120)]);
  const name = dao?.daoName ?? "DAO";
  return pageMeta({
    title: p?.title ? `${p.title} · ${name}` : `Proposal #${id} · ${name}`,
    description: clip(p?.description) || `Proposal #${id} in ${name} — read it and vote on Sysfi.`,
    path: `/daos/${chainId}/${address}/proposal/${id}`,
    type: "article",
  });
}

export default function ProposalPage() {
  return <ProposalScreen />;
}
