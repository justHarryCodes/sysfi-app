// sitemap.xml — the static public pages, popular public tribes and the DAOs
// on mainnets. Rebuilt hourly; a backend outage just yields the static part.
import { CHAIN_LIST } from "@/lib/config";
import { SITE_URL, backendData } from "@/lib/seo";

export const revalidate = 3600;

export default async function sitemap() {
  const now = new Date();
  const fixed = ["", "/feed", "/tribes", "/daos", "/explore", "/developers/docs", "/swap"].map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: now,
    changeFrequency: p === "" ? "weekly" : "daily",
    priority: p === "" ? 1 : 0.7,
  }));

  const [tribes, ...daoLists] = await Promise.all([
    backendData("/guilds/top?limit=200", 3600),
    ...CHAIN_LIST.filter((c) => !c.testnet && c.daoFactory).map((c) => backendData(`/daos/chain/${c.id}?limit=500`, 3600)),
  ]);

  const tribeUrls = (tribes ?? [])
    .filter((t) => t.privacy === "public")
    .map((t) => ({ url: `${SITE_URL}/tribe/${t.id}`, lastModified: t.updatedAt ? new Date(t.updatedAt) : now, changeFrequency: "daily", priority: 0.6 }));
  const daoUrls = daoLists
    .flat()
    .filter(Boolean)
    .map((d) => ({ url: `${SITE_URL}/daos/${d.chain_id ?? d.chainId}/${d.dao_address ?? d.daoAddress}`, lastModified: now, changeFrequency: "daily", priority: 0.5 }));

  return [...fixed, ...tribeUrls, ...daoUrls];
}
