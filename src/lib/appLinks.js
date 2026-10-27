// lib/appLinks.js — the files iOS and Android fetch from sysfi.network to let
// the mobile app open site links (universal links / app links). Served by
// app/.well-known/*. Must agree with crypto-wallet/app.json:
//   ios.bundleIdentifier / android.package   → APP_ID
//   ios.associatedDomains / android.intentFilters paths → LINK_PATHS
//
// Two values aren't in the repo and come from the environment:
//   APPLE_TEAM_ID                     Apple Developer team id (10 characters)
//   ANDROID_CERT_SHA256               signing certificate SHA-256 fingerprint(s),
//                                     comma-separated (Play App Signing + upload key)
// Until they're set the files answer 404, so nothing wrong is ever published.

export const APP_ID = "com.sysfiprotocol.nexussysfi";

export const LINK_PATHS = ["/invite", "/dao", "/daos", "/tribe", "/tribes", "/post", "/proposal", "/profile", "/swap", "/wallet", "/token", "/nft"];

export function appleAppSiteAssociation(teamId = process.env.APPLE_TEAM_ID) {
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId.trim())) return null;
  const appID = `${teamId.trim()}.${APP_ID}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appID],
          components: LINK_PATHS.flatMap((p) => [{ "/": p }, { "/": `${p}/*` }]),
        },
      ],
    },
    webcredentials: { apps: [appID] },
  };
}

export function androidAssetLinks(fingerprints = process.env.ANDROID_CERT_SHA256) {
  const list = String(fingerprints ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  if (!list.length) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: APP_ID, sha256_cert_fingerprints: list },
    },
  ];
}
