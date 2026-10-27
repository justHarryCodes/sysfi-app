"use client";
// components/flow/FlowGate.js — client-side route guard. Equivalent of the
// app's Navigation.js choosing between AuthNavigator and AppNavigator, plus
// its pending-deep-link queue: an in-app URL opened while signed out is
// remembered and restored once sign-in (and any setup step) completes.
//
// Public pages (lib/flow.js isPublicRoute — the landing, DAOs, public tribes,
// the public feed, posts, Explore …) render for signed-out visitors, and also
// while auth is still loading, so they're server-rendered for crawlers and
// shared-link previews instead of a splash screen. Signed-in users opening
// the landing ("/") go to their feed.
import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { APP_CONFIG } from "@/lib/config";
import { AUTH_FLOW_PATHS, FLOW, FLOW_ROUTES, HOME_ROUTE, computeFlowState, isPublicRoute } from "@/lib/flow";
import SplashScreen from "@/components/flow/SplashScreen";
import Button from "@/components/ui/Button";

const PENDING = APP_CONFIG.STORAGE_KEYS.PENDING_ROUTE;

const rememberRoute = (path) => {
  try {
    sessionStorage.setItem(PENDING, path);
  } catch {}
};
const peekRememberedRoute = () => {
  try {
    return sessionStorage.getItem(PENDING);
  } catch {
    return null;
  }
};
const forgetRememberedRoute = () => {
  try {
    sessionStorage.removeItem(PENDING);
  } catch {}
};

export default function FlowGate({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const wallet = useWallet();

  const state = computeFlowState({
    authLoading: auth.loading,
    user: auth.user,
    checkingWallet: wallet.checkingWallet,
    walletCheckError: wallet.walletCheckError,
    firestoreWalletExists: wallet.firestoreWalletExists,
    backupPending: wallet.backupPending,
  });

  const isPublic = isPublicRoute(pathname);

  const target = useMemo(() => {
    if (state === FLOW.LOADING || state === FLOW.WALLET_CHECK_ERROR) return null;
    if (state === FLOW.UNAUTHENTICATED && isPublic) return null;
    if (state === FLOW.READY) {
      return AUTH_FLOW_PATHS.has(pathname) || pathname === "/" ? peekRememberedRoute() || HOME_ROUTE : null;
    }
    const allowed = FLOW_ROUTES[state];
    return allowed.includes(pathname) ? null : allowed[0];
  }, [state, pathname, isPublic]);

  useEffect(() => {
    if (!target) return;
    if (state === FLOW.READY) forgetRememberedRoute();
    else if (pathname !== "/" && !AUTH_FLOW_PATHS.has(pathname)) rememberRoute(pathname + window.location.search);
    router.replace(target);
  }, [target, state, pathname, router]);

  if (state === FLOW.WALLET_CHECK_ERROR) {
    return (
      <SplashScreen>
        <p className="mb-4 max-w-xs text-center text-sm text-text-secondary">
          We couldn&apos;t check for your wallet. {wallet.walletCheckError}
        </p>
        <Button title="Try again" onClick={wallet.retryWalletCheck} size="small" />
      </SplashScreen>
    );
  }

  if ((state === FLOW.LOADING && !isPublic) || target) return <SplashScreen />;
  return children;
}
