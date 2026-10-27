"use client";
// components/ui/Modal.js — centred dialog on desktop, bottom sheet on phones
// (the app's transparent RN <Modal> with a card).
import { useEffect } from "react";
import Portal from "./Portal";

export default function Modal({ open, onClose, labelledBy, children, dismissible = true }) {
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  if (!open) return null;
  return (
    <Portal>
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={() => dismissible && onClose?.()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[90dvh] w-full overflow-y-auto rounded-t-sheet bg-card p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] [animation:pop-in_180ms_ease-out] sm:max-w-md sm:rounded-[24px] sm:border sm:border-panel-border sm:pb-6 sm:shadow-[var(--panel-shadow)]"
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}
