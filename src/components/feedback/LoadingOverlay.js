// components/feedback/LoadingOverlay.js — port of crypto-wallet/components/LoadingOverlay.js.
import Spinner from "@/components/ui/Spinner";

export default function LoadingOverlay({ message, step, totalSteps }) {
  const pct = totalSteps ? Math.min(100, Math.round(((step || 0) / totalSteps) * 100)) : 0;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="alertdialog" aria-busy="true" aria-live="polite">
      <div className="flex w-full max-w-sm flex-col items-center rounded-[20px] bg-surface p-12 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
        <div className="mb-6">
          <Spinner size={36} />
        </div>
        <p className="mb-6 text-center text-md font-semibold text-text">{message}</p>
        {totalSteps > 0 && (
          <div className="mb-4 w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-border">
              <div className="h-full rounded-[3px] bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-center text-xs text-text-secondary">
              Step {step} of {totalSteps}
            </p>
          </div>
        )}
        <div className="flex gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-pulse rounded-full bg-primary"
              style={{ animationDelay: `${i * 200}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
