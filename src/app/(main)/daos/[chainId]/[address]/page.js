import DaoScreen from "@/components/dao/DaoScreen";
import { getChainById } from "@/lib/config";
import { backendData, clip, pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }) {
  const { chainId, address } = await params;
  const dao = await backendData(`/daos/${encodeURIComponent(chainId)}/${encodeURIComponent(address.toLowerCase())}`);
  const chain = getChainById(Number(chainId));
  if (!dao) return { title: "DAO" };
  return pageMeta({
    title: `${dao.daoName} DAO`,
    description: clip(dao.offChain?.description) || `${dao.daoName} — on-chain governance on ${chain?.name ?? "Sysfi"}. Proposals, votes and treasury.`,
    path: `/daos/${chainId}/${address}`,
    image: dao.imageUrl || undefined,
  });
}

export default function DaoPage() {
  return <DaoScreen />;
}
