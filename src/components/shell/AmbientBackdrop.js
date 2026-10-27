// components/shell/AmbientBackdrop.js — the soft light the desktop glass
// panels float over: slow-drifting brand-lime orbs, a neutral orb and a
// whisper of film grain so the blur has texture to work with.
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>\")";

export default function AmbientBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden bg-background md:block">
      <div
        className="absolute -left-[12%] -top-[18%] h-[62vmax] w-[62vmax] rounded-full blur-[90px] [animation:ambient-drift_26s_ease-in-out_infinite]"
        style={{ background: "radial-gradient(circle, var(--ambient-1), transparent 65%)" }}
      />
      <div
        className="absolute -bottom-[25%] right-[-10%] h-[55vmax] w-[55vmax] rounded-full blur-[100px] [animation:ambient-drift_32s_ease-in-out_infinite_reverse]"
        style={{ background: "radial-gradient(circle, var(--ambient-2), transparent 65%)" }}
      />
      <div
        className="absolute left-[35%] top-[30%] h-[40vmax] w-[40vmax] rounded-full blur-[110px]"
        style={{ background: "radial-gradient(circle, var(--ambient-3), transparent 70%)" }}
      />
      <div className="absolute inset-0 opacity-[0.05] mix-blend-overlay" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}
