// services/firebaseUser.js — the auth/profile/wallet subset of
// crypto-wallet/services/Firebase.js, same Firestore shapes:
//   users/{uid}, usernames/{usernameLower}, wallets/{uid}.
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  deleteUser,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { api } from "@/lib/api";

const stripUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const normaliseUser = (data) =>
  data ? { ...data, profileImageUrl: data.profilePicture ?? data.profileImageUrl ?? null } : null;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const registerUser = async (email, password) =>
  (await createUserWithEmailAndPassword(auth, email, password)).user;

export const loginUser = async (email, password) =>
  (await signInWithEmailAndPassword(auth, email, password)).user;

export const logoutUser = () => signOut(auth);

export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export const sendVerificationEmail = (user) => sendEmailVerification(user);

export const deleteUserAccount = (user) => deleteUser(user);

// ─── Profile ──────────────────────────────────────────────────────────────────

export const createUserProfile = async (uid, profile) => {
  const batch = writeBatch(db);
  batch.set(
    doc(db, "users", uid),
    stripUndefined({
      uid,
      email: profile.email,
      username: profile.username,
      displayName: profile.displayName,
      bio: profile.bio || "",
      profileImageUrl: profile.profileImageUrl || null,
      emailVerified: profile.emailVerified || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  if (profile.username) {
    batch.set(doc(db, "usernames", profile.username.toLowerCase()), {
      userId: uid,
      username: profile.username,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
};

export const getUserData = async (uid) => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? normaliseUser(snap.data()) : null;
};

// Feeds show the author's live name/photo from the backend's Redis copy of
// the profile; after a write, ask it to re-read Firestore now. Fire-and-forget:
// a failure only means the old name shows for a few minutes.
const notifyProfileChanged = () => api.post("/users/me/profile-changed").catch(() => {});

export const updateUserProfile = async (uid, data) => {
  await updateDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() });
  notifyProfileChanged();
};

export const checkUsernameExists = async (username) =>
  (await getDoc(doc(db, "usernames", username.toLowerCase()))).exists();

/** Atomically moves the usernames/{name} claim and updates users/{uid}. */
/**
 * Claims the username and saves the profile. `create` (Google sign-ups, which
 * have no users/{uid} doc yet): { email, emailVerified } — the doc is created
 * with only the fields firestore.rules allows on create.
 */
export const updateUsername = async (uid, oldUsername, newUsername, extra = {}, { create } = {}) => {
  const batch = writeBatch(db);
  if (oldUsername && oldUsername.toLowerCase() !== newUsername.toLowerCase()) {
    batch.delete(doc(db, "usernames", oldUsername.toLowerCase()));
  }
  if (!oldUsername || oldUsername.toLowerCase() !== newUsername.toLowerCase()) {
    batch.set(doc(db, "usernames", newUsername.toLowerCase()), {
      userId: uid,
      username: newUsername,
      createdAt: serverTimestamp(),
    });
  }
  if (create) {
    batch.set(
      doc(db, "users", uid),
      stripUndefined({
        uid,
        email: create.email,
        username: newUsername,
        displayName: extra.displayName,
        bio: extra.bio ?? "",
        profilePicture: extra.profilePicture ?? null,
        emailVerified: !!create.emailVerified,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  } else {
    batch.update(doc(db, "users", uid), { ...extra, username: newUsername, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  notifyProfileChanged();
};

// ─── Wallet (encrypted blob only) ─────────────────────────────────────────────

export const saveEncryptedWallet = (uid, walletData) =>
  setDoc(doc(db, "wallets", uid), { ...walletData, updatedAt: serverTimestamp() }, { merge: true });

/** wallets/{uid}, falling back to the legacy fields on users/{uid}. */
export const getEncryptedWallet = async (uid) => {
  const walletSnap = await getDoc(doc(db, "wallets", uid));
  if (walletSnap.exists()) return walletSnap.data();

  const userSnap = await getDoc(doc(db, "users", uid));
  const u = userSnap.exists() ? userSnap.data() : null;
  if (u?.encryptedWallet && u?.salt) {
    return { address: u.walletAddress, encrypted: u.encryptedWallet, salt: u.salt, isLegacy: true };
  }
  return null;
};
