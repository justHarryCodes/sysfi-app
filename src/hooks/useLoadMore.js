"use client";
import { useEffect, useRef } from "react";

/**
 * Infinite scroll: returns a ref for a sentinel element; calls `onLoad` when
 * it nears the viewport. Works inside the desktop scroll panel too (root =
 * nearest scrolling ancestor is found automatically via rootMargin on viewport).
 */
export function useLoadMore(onLoad, enabled) {
  const ref = useRef(null);
  const cb = useRef(onLoad);
  useEffect(() => {
    cb.current = onLoad;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && cb.current(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}
