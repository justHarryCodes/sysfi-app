// The default link-preview image (1200×630) for every page without its own.
import { ImageResponse } from "next/og";

export const alt = "Sysfi — Build, Grow & Own";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0a0a0a", color: "#fff", fontFamily: "sans-serif" }}>
        <div style={{ position: "absolute", top: -200, right: -150, width: 700, height: 700, borderRadius: 700, background: "radial-gradient(circle, rgba(214,255,0,0.22), transparent 70%)" }} />
        <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 10, color: "#d6ff00" }}>SYSFI</div>
        <div style={{ display: "flex", fontSize: 96, fontWeight: 800, marginTop: 24, lineHeight: 1.05 }}>
          Build, Grow <span style={{ color: "#d6ff00", marginLeft: 24 }}>&amp; Own</span>
        </div>
        <div style={{ fontSize: 34, color: "#a3a3a3", marginTop: 28, maxWidth: 900 }}>The on-chain community and governance layer — turning tokens into voting power.</div>
      </div>
    ),
    size,
  );
}
