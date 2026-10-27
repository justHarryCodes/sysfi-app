// Temporary body for screens scheduled in later build phases.
export default function PhasePlaceholder({ Icon, body }) {
  return (
    <div className="p-4">
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon size={28} />
        </span>
        <p className="text-md font-bold text-text">Coming soon to the web</p>
        <p className="max-w-sm text-sm text-text-secondary">{body}</p>
      </div>
    </div>
  );
}
