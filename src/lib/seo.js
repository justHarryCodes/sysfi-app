// lib/seo.js — server-side helpers for metadata, previews and the sitemap.
// Fetches are cached (ISR-style) so previews never slow the page down much,
// and every failure degrades to generic copy instead of an error.
import { APP_CONFIG } from "@/lib/config";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://sysfi.network").replace(/\/+$/, "");
export const SITE_NAME = "Sysfi";
export const SITE_DESCRIPTION =
  "The on-chain community and governance layer: token-gated tribes, chat, DAOs and voting, a multichain wallet, and mini-apps.";

/** GET a backend path → `data`, or null. Cached for `revalidate` seconds. */
export async function backendData(path, revalidate = 300) {
  try {
    const res = await fetch(`${APP_CONFIG.BACKEND_URL}${path}`, { next: { revalidate }, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json())?.data ?? null;
  } catch {
    return null;
  }
}

export const clip = (s, n = 180) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** Metadata with matching Open Graph / Twitter fields. */
export function pageMeta({ title, description, path, image, type = "website" }) {
  const url = `${SITE_URL}${path}`;
  const images = image ? [{ url: image }] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, type, ...(images ? { images } : {}) },
    // Every page has at least the generated default image (app/opengraph-image.js).
    twitter: { card: "summary_large_image", title, description, ...(image ? { images: [image] } : {}) },
  };
}
