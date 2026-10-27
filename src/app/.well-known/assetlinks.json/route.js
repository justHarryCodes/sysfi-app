// /.well-known/assetlinks.json — lets Android verify the app's https intent
// filters for sysfi.network (see lib/appLinks.js). 404 until
// ANDROID_CERT_SHA256 is set.
import { androidAssetLinks } from "@/lib/appLinks";

export function GET() {
  const body = androidAssetLinks();
  if (!body) return new Response("Not configured", { status: 404 });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
