// lib/appLinks.js — universal-link / app-link files for sysfi.network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_ID, LINK_PATHS, appleAppSiteAssociation, androidAssetLinks } from "@/lib/appLinks";

const app = JSON.parse(readFileSync(new URL("../../crypto-wallet/app.json", import.meta.url), "utf8")).expo;

test("matches the mobile app's ids, domains and link paths", () => {
  assert.equal(app.ios.bundleIdentifier, APP_ID);
  assert.equal(app.android.package, APP_ID);
  assert.ok(app.ios.associatedDomains.includes("applinks:sysfi.network"));
  const prefixes = app.android.intentFilters.flatMap((f) => f.data ?? []).filter((d) => d.host === "sysfi.network" && d.pathPrefix).map((d) => d.pathPrefix);
  for (const p of prefixes) assert.ok(LINK_PATHS.includes(p), `iOS file is missing ${p}`);
});

test("nothing is published until the real ids are configured", () => {
  assert.equal(appleAppSiteAssociation(""), null);
  assert.equal(appleAppSiteAssociation("not-a-team"), null);
  assert.equal(androidAssetLinks(""), null);
  assert.equal(androidAssetLinks("AA:BB"), null);
});

test("well-formed files once configured", () => {
  const aasa = appleAppSiteAssociation("ABCDE12345");
  assert.deepEqual(aasa.applinks.details[0].appIDs, [`ABCDE12345.${APP_ID}`]);
  assert.ok(aasa.applinks.details[0].components.some((c) => c["/"] === "/invite/*"));
  const fp = Array.from({ length: 32 }, () => "ab").join(":");
  const links = androidAssetLinks(`${fp}, ${fp.replace(/ab/g, "CD")}`);
  assert.equal(links[0].target.package_name, APP_ID);
  assert.equal(links[0].target.sha256_cert_fingerprints.length, 2);
  assert.equal(links[0].target.sha256_cert_fingerprints[0], fp.toUpperCase());
});
