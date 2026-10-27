// Shown to signed-out visitors on public pages.
"use client";
import { useSignInGate } from "@/hooks/useSignInGate";

export default function VisitorBanner({ title = "You're browsing Sysfi", body = "Sign in to post, join tribes and vote." }) {
  const { signIn } = useSignInGate();
  return (
    <div className="m-4 flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] p-4">
      <div className="min-w-0 flex-1">
        <p className="font-bold text-text">{title}</p>
        <p className="text-sm text-text-secondary">{body}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => signIn("/login")} className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-text hover:bg-hover">
          Sign in
        </button>
        <button type="button" onClick={() => signIn("/register")} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary">
          Join Sysfi
        </button>
      </div>
    </div>
  );
}
