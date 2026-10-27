"use client";
// components/feedback/AlertDialog.js — port of crypto-wallet/components/common/CustomAlert.js.
// Buttons follow RN's Alert shape: { text, onPress?, style?: 'cancel' | 'destructive' }.
import { useEffect, useRef } from "react";

export default function AlertDialog({ title, message, buttons, onClose }) {
  const firstBtn = useRef(null);

  useEffect(() => {
    firstBtn.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-title"
        className="w-full max-w-sm overflow-hidden rounded-xl bg-card shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-4 pt-6 text-center">
          {title && (
            <h2 id="alert-title" className="mb-2 text-lg font-bold text-text">
              {title}
            </h2>
          )}
          {message && <p className="whitespace-pre-line text-sm leading-5 text-text-secondary">{message}</p>}
        </div>
        <div className="flex border-t border-border">
          {buttons.map((b, i) => (
            <button
              key={i}
              ref={i === 0 ? firstBtn : undefined}
              type="button"
              onClick={() => {
                onClose();
                b.onPress?.();
              }}
              className={`flex-1 py-3.5 text-md font-semibold hover:bg-surface ${i > 0 ? "border-l border-border" : ""} ${
                b.style === "cancel" ? "text-text-secondary" : b.style === "destructive" ? "text-error" : "text-primary"
              }`}
            >
              {b.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
