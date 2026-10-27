"use client";
// contexts/AuthContext.js — port of crypto-wallet/contexts/AuthContext.js.
// `user` = Firebase Auth identity merged with the live users/{uid} doc.
// Firebase Auth stays the source of truth for emailVerified/providerData.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { uploadImage } from "@/lib/upload";
import {
  registerUser,
  loginUser,
  logoutUser,
  createUserProfile,
  deleteUserAccount,
  checkUsernameExists,
  sendVerificationEmail,
} from "@/services/firebaseUser";
import { useQueryClient } from "@tanstack/react-query";
import { useFeedback } from "@/contexts/FeedbackContext";
import { wipeUserData } from "@/lib/session";
import { disconnect } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi";
import { forgetGoogleToken, linkPendingGoogle, signInWithGoogle } from "@/lib/googleAuth";

const AuthContext = createContext(null);

const normalise = (raw) => {
  if (!raw) return {};
  const { emailVerified: _ignored, ...rest } = raw; // Firestore copy is often stale
  // profilePicture is the field later edits write (Firestore rules forbid
  // updating profileImageUrl, which only registration sets) — prefer it.
  return { ...rest, profileImageUrl: raw.profilePicture ?? raw.profileImageUrl ?? null };
};

export function AuthProvider({ children }) {
  const [fbUser, setFbUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  // Bumped after reload() since that doesn't fire onAuthStateChanged.
  const [authRevision, setAuthRevision] = useState(0);
  // Account password held in memory between sign-in and wallet setup,
  // exactly like the app's tempCloudPassword. Never persisted. The ref is
  // set *before* the Firebase call so the wallet loader — which runs as soon
  // as the auth state flips — can always read it (getTempCloudPassword).
  const tempPwRef = useRef(null);
  const [tempCloudPassword, setTempCloudPasswordState] = useState(null);
  const setTempCloudPassword = useCallback((pw) => {
    tempPwRef.current = pw;
    setTempCloudPasswordState(pw);
  }, []);

  // A Google sign-in refused because the email already has a password
  // account: linked automatically after the next password sign-in.
  const pendingGoogleRef = useRef(null);

  const { showLoading, updateLoading, hideLoading } = useFeedback();
  const queryClient = useQueryClient();
  const signedInUid = useRef(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        const previousUid = signedInUid.current;
        signedInUid.current = u?.uid ?? null;

        // Signed out (here or in another tab): wipe that user's cached data,
        // then reload so every in-memory trace (React state, Firestore
        // instance) is gone too.
        if (previousUid && previousUid !== u?.uid) {
          setTempCloudPassword(null);
          wipeUserData(previousUid, queryClient).finally(() => window.location.replace("/welcome"));
          return;
        }

        setFbUser(u);
        setProfile(null);
        setProfileLoaded(!u);
        setAuthResolved(true);
        if (!u) setTempCloudPassword(null);
      }),
    [setTempCloudPassword, queryClient],
  );

  useEffect(() => {
    if (!fbUser?.uid) return;
    return onSnapshot(
      doc(db, "users", fbUser.uid),
      (snap) => {
        setProfile(snap.exists() ? normalise(snap.data()) : null);
        setProfileLoaded(true);
      },
      (err) => {
        console.error("[AuthContext] profile listener error:", err);
        setProfileLoaded(true);
      },
    );
  }, [fbUser?.uid]);

  const user = useMemo(() => {
    if (!fbUser) return null;
    return {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName || "",
      ...profile,
      emailVerified: fbUser.emailVerified,
      providerData: fbUser.providerData,
      // No users/{uid} doc yet (Google sign-up before profile setup).
      hasProfileDoc: !!profile,
      // Signed up with "Continue with wallet" (backend siweService): the
      // bound external wallet is their wallet; there may be no email.
      isWalletAccount: profile?.authProvider === "wallet",
      // Google sign-in with no password: the wallet is protected by the
      // Google backup instead (lib/googleBackup.js), and the wallet is set
      // up before the profile.
      isGoogleOnly:
        fbUser.providerData.some((p) => p.providerId === "google.com") &&
        !fbUser.providerData.some((p) => p.providerId === "password"),
    };
    // authRevision forces a recompute after fbUser.reload() mutates in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbUser, profile, authRevision]);

  const register = useCallback(
    async (email, password, { username, displayName, bio, imageFile } = {}) => {
      let created = null;
      try {
        showLoading("Creating your account...", { step: 1, totalSteps: 3 });
        setTempCloudPassword(password);
        try {
          created = await registerUser(email, password);
        } catch (err) {
          setTempCloudPassword(null);
          throw err;
        }

        let profileImageUrl = null;
        if (imageFile) {
          updateLoading("Uploading profile image...", 2);
          try {
            profileImageUrl = (await uploadImage(imageFile, "profile-images", { publicId: `profile_${created.uid}` }))
              .url;
          } catch (imgErr) {
            console.error("[AuthContext] Image upload failed:", imgErr);
          }
        }

        updateLoading("Creating your profile...", 3);
        try {
          await createUserProfile(created.uid, {
            email: created.email,
            username,
            displayName,
            bio: bio || "",
            profileImageUrl,
            emailVerified: false,
          });
        } catch (profileErr) {
          console.error("[AuthContext] Profile creation failed, rolling back:", profileErr);
          await deleteUserAccount(created).catch(() => {});
          throw new Error("Failed to create user profile. Please try again.");
        }

        return created;
      } finally {
        hideLoading();
      }
    },
    [showLoading, updateLoading, hideLoading, setTempCloudPassword],
  );

  const login = useCallback(
    async (email, password) => {
      setTempCloudPassword(password);
      let signedIn;
      try {
        signedIn = await loginUser(email, password);
      } catch (err) {
        setTempCloudPassword(null);
        throw err;
      }
      if (pendingGoogleRef.current) {
        const pending = pendingGoogleRef.current;
        pendingGoogleRef.current = null;
        await linkPendingGoogle(pending).catch((err) => console.warn("[AuthContext] linking Google failed:", err));
      }
      return signedIn;
    },
    [setTempCloudPassword],
  );

  /** Sign in or sign up with Google (popup). */
  const loginWithGoogle = useCallback(async () => {
    try {
      return await signInWithGoogle();
    } catch (err) {
      if (err.code === "GOOGLE_ACCOUNT_EXISTS") pendingGoogleRef.current = err.pendingCredential;
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setTempCloudPassword(null);
    forgetGoogleToken();
    await disconnect(wagmiConfig).catch(() => {}); // forget the connected wallet too
    await logoutUser();
  }, [setTempCloudPassword]);

  const checkUsernameAvailability = useCallback(async (username) => !(await checkUsernameExists(username)), []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) throw new Error("No user logged in");
    await sendVerificationEmail(auth.currentUser);
  }, []);

  const refreshUserData = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    setAuthRevision((r) => r + 1);
  }, []);

  const hasPasswordProvider = useMemo(
    () => !!user?.providerData?.some((p) => p.providerId === "password"),
    [user?.providerData],
  );

  const value = {
    user,
    loading: !authResolved || (!!fbUser && !profileLoaded),
    isAuthenticated: !!user,
    register,
    login,
    loginWithGoogle,
    logout,
    hasPasswordProvider,
    tempCloudPassword,
    getTempCloudPassword: () => tempPwRef.current,
    clearTempPassword: () => setTempCloudPassword(null),
    checkUsernameAvailability,
    resendVerificationEmail,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};
