// lib/session.js — what happens to client-side data when a user signs out.
// Runs in every open tab (each tab's AuthContext sees the auth state flip),
// so a shared computer is left with no trace of the previous user.
import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { userScope, wipeScope } from "@/lib/cache/idb";

export async function wipeUserData(uid, queryClient) {
  queryClient?.removeQueries({ queryKey: ["user"] });
  if (uid) await wipeScope(userScope(uid));
  try {
    // Firestore's cache (profile, wallet blob) — requires a terminated
    // instance; fails harmlessly if another tab still holds it open (that
    // tab runs this same cleanup when it sees the sign-out).
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (err) {
    console.warn("[session] Firestore cache clear deferred:", err?.code || err?.message);
  }
}
