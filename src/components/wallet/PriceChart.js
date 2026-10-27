"use client";
// components/wallet/PriceChart.js — responsive area chart for TokenDetail.
// Pointer/touch scrub shows the price at that point. Rising series use the
// primary colour; falling ones the tertiary text colour (the theme keeps
// status colours monochrome).
import { useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/format";

const W = 600;
const H = 200;
const PAD = 6;

const timeLabel = (t, days) =>
  new Date(t).toLocaleString("en-US", days <= 1 ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" });

export default function PriceChart({ points, days, onScrub }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(null);

  const geo = useMemo(() => {
    if (!points?.length) return null;
    const ys = points.map((p) => p[1]);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const range = max - min || 1;
    const xy = points.map(([t, p], i) => [PAD + (i / (points.length - 1)) * (W - PAD * 2), PAD + (1 - (p - min) / range) * (H - PAD * 2), t, p]);
    const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
    return { xy, line, area: `${line}L${W - PAD},${H}L${PAD},${H}Z`, up: ys[ys.length - 1] >= ys[0] };
  }, [points]);

  if (!geo) return <div className="h-[200px]" />;
  const color = geo.up ? "var(--primary)" : "var(--text-tertiary)";

  const scrub = (clientX) => {
    const rect = ref.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(geo.xy.length - 1, Math.round(((x - PAD) / (W - PAD * 2)) * (geo.xy.length - 1))));
    setHover(i);
    onScrub?.(geo.xy[i][3]);
  };
  const leave = () => {
    setHover(null);
    onScrub?.(null);
  };

  const h = hover !== null ? geo.xy[hover] : null;

  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-[200px] w-full touch-pan-y"
        onPointerMove={(e) => scrub(e.clientX)}
        onPointerDown={(e) => scrub(e.clientX)}
        onPointerLeave={leave}
        role="img"
        aria-label="Price chart"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.3" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geo.area} fill="url(#chartFill)" />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {h && <line x1={h[0]} x2={h[0]} y1={0} y2={H} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-card px-2 py-1 text-center text-xs shadow"
          style={{ left: `${(h[0] / W) * 100}%` }}
        >
          <span className="block font-bold text-text">{formatPrice(h[3])}</span>
          <span className="block text-text-tertiary">{timeLabel(h[2], days)}</span>
        </div>
      )}
    </div>
  );
}
