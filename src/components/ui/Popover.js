"use client";
// components/ui/Popover.js — frosted floating menu anchored to its trigger.
// Rendered in a portal with fixed positioning: the glass panels each create
// their own stacking context (backdrop-filter), so an in-place menu would be
// trapped behind neighbouring panels. Closes on outside click, Escape,
// resize/scroll.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Portal from "./Portal";

const GAP = 12;

function place(rect, placement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  switch (placement) {
    case "right-end":
      return { left: rect.right + GAP, bottom: vh - rect.bottom, maxHeight: rect.bottom - GAP };
    case "bottom-end":
      return { right: vw - rect.right, top: rect.bottom + 6, maxHeight: vh - rect.bottom - GAP };
    case "bottom-start":
      return { left: Math.min(rect.left, vw - 260), top: rect.bottom + 6, maxHeight: vh - rect.bottom - GAP };
    case "right-start":
    default:
      return { left: rect.right + GAP, top: rect.top, maxHeight: vh - rect.top - GAP };
  }
}

export default function Popover({ open, onClose, anchorRef, placement = "right-start", className = "", children }) {
  const ref = useRef(null);
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef?.current) return;
    const update = () => setStyle(place(anchorRef.current.getBoundingClientRect(), placement));
    update();
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [open, anchorRef, placement, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !style) return null;
  return (
    <Portal>
      <div
        ref={ref}
        role="menu"
        style={style}
        className={`glass-strong fixed z-[80] min-w-[240px] overflow-y-auto rounded-2xl py-2 [animation:pop-in_140ms_ease-out] ${className}`}
      >
        {children}
      </div>
    </Portal>
  );
}

export function PopoverItem({ as: As = "button", Icon, children, className = "", ...props }) {
  return (
    <As
      role="menuitem"
      type={As === "button" ? "button" : undefined}
      className={`mx-1.5 flex w-[calc(100%-12px)] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-semibold text-text hover:bg-hover disabled:opacity-50 ${className}`}
      {...props}
    >
      {Icon && <Icon size={20} className="shrink-0" />}
      {children}
    </As>
  );
}
