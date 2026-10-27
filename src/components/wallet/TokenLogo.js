"use client";
// components/wallet/TokenLogo.js — port of the app's TokenLogo: tries the
// token's logo, then public logo CDNs by address, then falls back to coloured
// initials (the app's LOGO_COLORS — token art is exempt from the monochrome
// theme, same as in the app).
import { useMemo, useState } from "react";

const COLORS = ["#6366f1", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#d6ff00", "#f97316", "#06b6d4"];

const sourcesFor = (logo, address) => {
  const list = [];
  if (logo) list.push(logo);
  if (address && address !== "native") list.push(`https://tokens.1inch.io/${address.toLowerCase()}.png`);
  return list;
};

export default function TokenLogo({ logo, address, symbol, size = 40, className = "" }) {
  const sources = useMemo(() => sourcesFor(logo, address), [logo, address]);
  const [failed, setFailed] = useState(0);
  const src = sources[failed];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed((i) => i + 1)}
        className={`shrink-0 rounded-full bg-surface object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  const bg = COLORS[(symbol?.charCodeAt(0) || 0) % COLORS.length];
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${className}`}
      style={{ width: size, height: size, background: bg, color: bg === "#d6ff00" ? "#000" : "#fff", fontSize: size * 0.33 }}
    >
      {(symbol || "??").slice(0, 2).toUpperCase()}
    </span>
  );
}
