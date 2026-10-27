// lib/firebase.js — same Firebase project as crypto-wallet/services/Firebase.js
// (the web config is a public identifier, not a secret).
//
// Persistence
//   • Auth: IndexedDB (falls back to localStorage), so the session survives
//     reloads and is shared by every tab — the app's AsyncStorage persistence.
//   • Firestore: persistent multi-tab IndexedDB cache, so profile/wallet-address
//     reads are instant on reload and work offline. lib/session.js wipes it on
//     sign-out. (The cached wallets/{uid} doc is the same password-encrypted
//     blob the app already keeps at rest; no decrypted key is ever cached.)
import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAMq_-pvAk2ifDB9VEwmcmcgnuClvL66Dw",
  authDomain: "sysfi-protocol.firebaseapp.com",
  databaseURL: "https://sysfi-protocol-default-rtdb.firebaseio.com",
  projectId: "sysfi-protocol",
  storageBucket: "sysfi-protocol.appspot.com",
  messagingSenderId: "201308188439",
  appId: "1:201308188439:web:30aa0cfe8c052590815152",
  measurementId: "G-J4HNBX6W1Y",
};

const isBrowser = typeof window !== "undefined";
const existing = getApps()[0];
const app = existing ?? initializeApp(firebaseConfig);

function makeAuth() {
  if (existing || !isBrowser) return getAuth(app);
  return initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    // initializeAuth (unlike getAuth) leaves popups out; without this,
    // signInWithPopup (Google sign-in) fails with auth/argument-error.
    popupRedirectResolver: browserPopupRedirectResolver,
  });
}

function makeFirestore() {
  if (existing) return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: isBrowser
        ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        : memoryLocalCache(),
    });
  } catch {
    return getFirestore(app); // already initialised (hot reload)
  }
}

export const auth = makeAuth();
export const db = makeFirestore();
