// lib/flow.js — the app's AuthNavigator state machine, mapped to URLs.
// Order matters and matches the app exactly.

export const FLOW = {
  LOADING: "loading",
  WALLET_CHECK_ERROR: "walletCheckError",
  UNAUTHENTICATED: "unauthenticated",
  EMAIL_VERIFICATION: "emailVerification",
  PROFILE_SETUP: "profileSetup",
  WALLET_SETUP: "walletSetup",
  READY: "ready",
};

export function computeFlowState({ authLoading, user, checkingWallet, walletCheckError, firestoreWalletExists, backupPending }) {
  if (authLoading) return FLOW.LOADING;
  if (!user) return FLOW.UNAUTHENTICATED;
  // Wallet-signed accounts prove ownership by signature; email is optional.
  if (!user.emailVerified && !user.isWalletAccount) return FLOW.EMAIL_VERIFICATION;
  // Google sign-up: no password to carry, so the wallet comes first (created
  // straight into the Google backup), then the profile.
  if (user.isGoogleOnly) {
    if (checkingWallet) return FLOW.LOADING;
    if (!firestoreWalletExists) return walletCheckError ? FLOW.WALLET_CHECK_ERROR : FLOW.WALLET_SETUP;
    if (backupPending) return FLOW.WALLET_SETUP;
    if (!(user.username && user.displayName)) return FLOW.PROFILE_SETUP;
    return FLOW.READY;
  }
  if (!(user.username && user.displayName)) return FLOW.PROFILE_SETUP;
  if (checkingWallet) return FLOW.LOADING;
  if (!firestoreWalletExists) {
    // Unsure whether a wallet exists → never offer to create one (the app
    // stays on its loading screen here to avoid duplicate wallets).
    return walletCheckError ? FLOW.WALLET_CHECK_ERROR : FLOW.WALLET_SETUP;
  }
  if (backupPending) return FLOW.WALLET_SETUP;
  // No unlock gate: the session persists, and the wallet key is decrypted
  // only for each on-chain action (WalletContext.withSigner).
  return FLOW.READY;
}

/** Pages each pre-app state may show; the first entry is where it redirects. */
export const FLOW_ROUTES = {
  [FLOW.UNAUTHENTICATED]: ["/welcome", "/login", "/register"],
  [FLOW.EMAIL_VERIFICATION]: ["/verify-email"],
  [FLOW.PROFILE_SETUP]: ["/profile-setup"],
  [FLOW.WALLET_SETUP]: ["/wallet-setup"],
};

export const AUTH_FLOW_PATHS = new Set(Object.values(FLOW_ROUTES).flat());

export const HOME_ROUTE = "/feed";

// ─── Public pages ────────────────────────────────────────────────────────────
// Readable without an account (shared links, search engines). Anything a
// visitor tries to do on them asks them to sign in first (hooks/useSignInGate)
// and brings them back afterwards.
const PUBLIC_ROUTES = [
  /^\/$/, // landing
  /^\/feed$/,
  /^\/tribes(\/search)?$/,
  /^\/tribe\/[^/]+(\/(posts|members))?$/,
  /^\/post\/[^/]+\/[^/]+$/,
  /^\/news\/[^/]+$/, // news cards' own pages (shared links)
  /^\/invite\/[^/]+$/,
  /^\/daos$/,
  /^\/daos\/\d+\/0x[0-9a-fA-F]{40}$/,
  /^\/daos\/\d+\/0x[0-9a-fA-F]{40}\/proposal\/\d+$/,
  /^\/explore$/,
  /^\/explore\/bots\/[^/]+$/,
  /^\/explore\/(?!dev$)[^/]+$/,
  /^\/developers\/docs$/,
  /^\/swap$/,
];

export const isPublicRoute = (pathname) => PUBLIC_ROUTES.some((r) => r.test(pathname));

/** Where sign-in should return to (read by FlowGate once the account is ready). */
export const PENDING_ROUTE_KEY = "@nexus_pending_route";
export function rememberReturnTo(path) {
  try {
    sessionStorage.setItem(PENDING_ROUTE_KEY, path);
  } catch {}
}
