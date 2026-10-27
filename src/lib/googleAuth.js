// lib/googleAuth.js — Google sign-in for the web app (Firebase popup) with
// access to the app's private Google Drive folder, where half of the wallet
// backup lives (lib/googleBackup.js).
//
// Two things the wallet backup needs from Google, both from one popup:
//   • a Drive access token (drive.appdata scope) — kept in memory only, ~1 h
//   • a Firebase session minted by Google sign-in — the backend only issues
//     the wallet key to those (GET /auth/wallet-key)
import {
  GoogleAuthProvider,
  getAdditionalUserInfo,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithCredential,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { DRIVE_SCOPE } from "@/lib/googleDrive";
import { googleSubOf } from "@/lib/googleVault";

const TOKEN_TTL_MS = 50 * 60 * 1000; // Google access tokens last 60 min
let cached = null; // { token, exp, uid }

const provider = () => {
  const p = new GoogleAuthProvider();
  p.addScope(DRIVE_SCOPE);
  p.setCustomParameters({ prompt: "select_account" });
  return p;
};

const remember = (uid, credential) => {
  if (credential?.accessToken) cached = { token: credential.accessToken, exp: Date.now() + TOKEN_TTL_MS, uid };
};

export const forgetGoogleToken = () => {
  cached = null;
};

/** A still-valid Drive token for the signed-in user, if this tab has one. */
export const cachedGoogleToken = () => (cached && cached.uid === auth.currentUser?.uid && cached.exp > Date.now() ? cached.token : null);

const fail = (message, code, extra) => Object.assign(new Error(message), { code, ...extra });

export const isPopupDismissed = (err) => ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"].includes(err?.code);

/**
 * Sign in or sign up with Google. When the email already has a password
 * account, throws GOOGLE_ACCOUNT_EXISTS with `pendingCredential`: sign in with
 * the password, then pass it to linkPendingGoogle().
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, provider());
    remember(result.user.uid, GoogleAuthProvider.credentialFromResult(result));
    return { user: result.user, isNewUser: !!getAdditionalUserInfo(result)?.isNewUser };
  } catch (err) {
    if (err?.code === "auth/account-exists-with-different-credential") {
      throw fail(
        `${err.customData?.email ?? "This email"} already has a Sysfi account. Sign in with your password once — we'll connect Google to it.`,
        "GOOGLE_ACCOUNT_EXISTS",
        { email: err.customData?.email, pendingCredential: GoogleAuthProvider.credentialFromError(err) },
      );
    }
    throw err;
  }
}

/** After a password sign-in: attach the Google account from a refused Google sign-in. */
export async function linkPendingGoogle(pendingCredential) {
  const result = await linkWithCredential(auth.currentUser, pendingCredential);
  remember(result.user.uid, pendingCredential);
  return result.user;
}

/**
 * Make sure this session can open the Google backup: Google linked to the
 * account, a Firebase session minted by Google, and a Drive token. Shows one
 * Google popup unless all of that is already in place — call it straight
 * from a click so the popup isn't blocked.
 * @returns {Promise<string>} Drive access token
 */
export async function stepUpWithGoogle() {
  const user = auth.currentUser;
  if (!user) throw fail("Sign in first.", "NOT_SIGNED_IN");
  const token = cachedGoogleToken();
  if (token && (await user.getIdTokenResult()).signInProvider === "google.com") return token;

  let result;
  try {
    result = googleSubOf(user) ? await reauthenticateWithPopup(user, provider()) : await linkWithPopup(user, provider());
  } catch (err) {
    if (err?.code === "auth/credential-already-in-use") {
      throw fail("That Google account is already connected to another Sysfi account. Choose a different one.", "GOOGLE_IN_USE");
    }
    if (err?.code === "auth/user-mismatch") {
      throw fail("Choose the Google account connected to this Sysfi account.", "GOOGLE_WRONG_ACCOUNT");
    }
    throw err;
  }
  const credential = GoogleAuthProvider.credentialFromResult(result);
  // Re-enter the same account through Google so the session is Google-minted
  // (the wallet key is only issued to those). No second popup: this reuses
  // the credential the popup just returned.
  const signed = await signInWithCredential(auth, GoogleAuthProvider.credential(credential.idToken, credential.accessToken));
  if (signed.user.uid !== user.uid) throw fail("Google signed you into a different account.", "GOOGLE_WRONG_ACCOUNT");
  remember(user.uid, credential);
  return credential.accessToken;
}
