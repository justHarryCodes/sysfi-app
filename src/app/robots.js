// robots.txt — index the public pages, keep crawlers out of personal ones.
import { SITE_URL } from "@/lib/seo";

export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/feed", "/tribes", "/tribe/", "/post/", "/daos", "/explore", "/developers/docs", "/swap"],
        disallow: ["/wallet", "/settings", "/profile", "/developers/", "/explore/dev", "/tribe/*/chat", "/tribe/*/settings", "/tribe/*/apps", "/invite/", "/login", "/register", "/welcome", "/verify-email", "/profile-setup", "/wallet-setup"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
