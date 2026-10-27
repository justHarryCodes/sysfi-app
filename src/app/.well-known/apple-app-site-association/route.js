// /.well-known/apple-app-site-association — lets iOS open sysfi.network links
// in the app (see lib/appLinks.js). 404 until APPLE_TEAM_ID is set.
import { appleAppSiteAssociation } from "@/lib/appLinks";

export function GET() {
  const body = appleAppSiteAssociation();
  if (!body) return new Response("Not configured", { status: 404 });
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
