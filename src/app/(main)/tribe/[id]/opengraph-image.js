// A tribe's link preview: its name, size and logo.
import { ImageResponse } from "next/og";
import { backendData } from "@/lib/seo";

export const alt = "A tribe on Sysfi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TribeOgImage({ params }) {
  const { id } = await params;
  const t = await backendData(`/guilds/${encodeURIComponent(id)}`);
  const pub = t && t.privacy === "public";
  const name = pub ? t.name : "A tribe on Sysfi";
  const members = pub ? Number(t.memberCount ?? t.member_count ?? 0) : null;
  const logo = pub ? t.logoUrl || t.logo_url : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 56, padding: 80, background: "#0a0a0a", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ position: "absolute", bottom: -250, left: -150, width: 700, height: 700, borderRadius: 700, background: "radial-gradient(circle, rgba(214,255,0,0.18), transparent 70%)" }} />
        {logo ? (
          // A lit ring + lighter backing so dark logos don't vanish into the background.
          <div style={{ display: "flex", padding: 8, borderRadius: 240, background: "rgba(214,255,0,0.35)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={logo} width={220} height={220} style={{ borderRadius: 220, objectFit: "cover", background: "#262626" }} />
          </div>
        ) : (
          <div style={{ width: 220, height: 220, borderRadius: 220, background: "rgba(214,255,0,0.15)", color: "#d6ff00", fontSize: 110, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {name.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 8, color: "#d6ff00" }}>SYSFI</div>
          <div style={{ fontSize: name.length > 22 ? 64 : 84, fontWeight: 800, marginTop: 16, lineHeight: 1.05 }}>{name}</div>
          {members !== null && (
            <div style={{ display: "flex", fontSize: 34, color: "#a3a3a3", marginTop: 20 }}>
              {`${members.toLocaleString()} member${members === 1 ? "" : "s"}${t.genre ? ` · ${t.genre}` : ""}`}
            </div>
          )}
          <div style={{ fontSize: 30, color: "#d6ff00", marginTop: 36 }}>Join on sysfi.network →</div>
        </div>
      </div>
    ),
    size,
  );
}
