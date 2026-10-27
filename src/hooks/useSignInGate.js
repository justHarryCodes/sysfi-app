"use client";
// hooks/useSignInGate.js — on public pages, actions need an account.
//   const { signedIn, requireSignIn, signIn } = useSignInGate();
//   <button onClick={requireSignIn(join)}>Join</button>
// Signed out, the action instead sends the visitor to sign in and remembers
// this page; FlowGate brings them back once their account is ready.
import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { rememberReturnTo } from "@/lib/flow";

export function useSignInGate() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const signIn = useCallback(
    (to = "/welcome") => {
      rememberReturnTo(pathname + (typeof window !== "undefined" ? window.location.search : ""));
      router.push(to);
    },
    [pathname, router],
  );

  const requireSignIn = useCallback(
    (fn) =>
      (...args) => {
        if (user) return fn?.(...args);
        signIn();
        return undefined;
      },
    [user, signIn],
  );

  return { signedIn: !!user, requireSignIn, signIn };
}
