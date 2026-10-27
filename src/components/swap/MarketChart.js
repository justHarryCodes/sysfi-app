"use client";
// components/swap/MarketChart.js — TradingView lightweight-charts (Apache-2.0;
// the attribution logo stays on, as the licence asks). Candles or area,
// with volume underneath; colours follow the app theme and market tokens.
import { useEffect, useRef } from "react";
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart } from "lightweight-charts";
import { useTheme } from "@/contexts/ThemeContext";
import { formatPrice } from "@/lib/format";

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const alpha = (hex, a) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Enough decimals to show movement on sub-cent tokens. */
function priceFormat(candles) {
  const p = candles.at(-1)?.close ?? 1;
  const precision = p >= 1000 ? 2 : p >= 1 ? 4 : Math.min(10, Math.max(4, Math.ceil(-Math.log10(p)) + 3));
  return { type: "price", precision, minMove: 1 / 10 ** precision };
}

/**
 * props: candles [{ time, open, high, low, close, volume }], mode "candles" | "line",
 *        intraday (bool, shows hh:mm on the axis), onHover(candle | null)
 */
export default function MarketChart({ candles, mode = "candles", intraday, onHover, height = 360 }) {
  const box = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const hoverRef = useRef(onHover);
  const { isDark } = useTheme();

  useEffect(() => {
    hoverRef.current = onHover;
  });

  // Create / theme the chart.
  useEffect(() => {
    const text = cssVar("--text-tertiary");
    const grid = cssVar("--divider");
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text, fontFamily: "inherit", fontSize: 11 },
      grid: { vertLines: { color: alpha(grid, 0.35) }, horzLines: { color: alpha(grid, 0.35) } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.22 } },
      timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, rightOffset: 3 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: alpha(text, 0.5), labelBackgroundColor: cssVar("--card") },
        horzLine: { color: alpha(text, 0.5), labelBackgroundColor: cssVar("--card") },
      },
      handleScroll: { vertTouchDrag: false },
    });
    chartRef.current = chart;

    const up = cssVar("--up");
    const down = cssVar("--down");
    const primary = cssVar("--primary");
    seriesRef.current = {
      candles: chart.addSeries(CandlestickSeries, {
        upColor: up,
        downColor: down,
        borderVisible: false,
        wickUpColor: up,
        wickDownColor: down,
        visible: false,
      }),
      line: chart.addSeries(AreaSeries, {
        lineColor: primary,
        lineWidth: 2,
        topColor: alpha(primary, 0.28),
        bottomColor: alpha(primary, 0),
        priceLineVisible: true,
        visible: false,
      }),
      volume: chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false }),
      up,
      down,
    };
    chart.priceScale("").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chart.subscribeCrosshairMove((param) => {
      const s = seriesRef.current;
      const active = s.candles.options().visible ? s.candles : s.line;
      const d = param.time ? param.seriesData.get(active) : null;
      hoverRef.current?.(d ? { time: param.time, close: d.close ?? d.value, open: d.open, high: d.high, low: d.low } : null);
    });
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [isDark, intraday]);

  // Data + mode. Runs after the effect above, so a recreated chart is refilled.
  useEffect(() => {
    const s = seriesRef.current;
    if (!chartRef.current || !s.candles) return;
    const data = candles ?? [];
    const fmt = priceFormat(data);
    s.candles.applyOptions({ visible: mode === "candles", priceFormat: fmt });
    s.line.applyOptions({ visible: mode === "line", priceFormat: fmt });
    s.candles.setData(data);
    s.line.setData(data.map((c) => ({ time: c.time, value: c.close })));
    s.volume.setData(data.map((c) => ({ time: c.time, value: c.volume, color: alpha(c.close >= c.open ? s.up : s.down, 0.35) })));
    chartRef.current.timeScale().fitContent();
  }, [candles, mode, isDark, intraday]);

  return <div ref={box} style={{ height }} className="w-full" aria-label="Price chart" role="img" />;
}

export const fmtChartPrice = (p) => (p === null || p === undefined ? "—" : formatPrice(p));
