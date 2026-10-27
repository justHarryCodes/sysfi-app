// lib/googleBackup.js — back up / restore a wallet with the user's Google
// account (lib/googleVault.js + lib/googleDrive.js). Shared by the web app and
// the mobile app; each app passes in how to reach its Firestore and backend.
//
// Writing is ordered so a crash can never leave an unusable pair:
//   1. new Firestore half → wallets/{uid}.googleVaults[backupId] (kept beside
//      any earlier ones)
//   2. new Drive half     → appDataFolder (replaces the old one)
//   3. googleVault = new half; every other entry in googleVaults is removed
// Restoring picks whichever stored Firestore half carries the Drive file's
// backupId, so an interrupted backup — even several in a row — still opens.
import { sealVault, openVault, googleSubOf } from "./googleVault";
import { readVaultFile, writeVaultFile } from "./googleDrive";

const fail = (message, code) => Object.assign(new Error(message), { code });

/**
 * @param {object} p
 * @param {object} p.walletData        decrypted wallet (mnemonic, privateKey, …)
 * @param {string} p.address           wallet address (account 0)
 * @param {object} p.user              Firebase user (uid + linked Google provider)
 * @param {string} p.accessToken       Google OAuth token with the drive.appdata scope
 * @param {() => Promise<string>} p.fetchKek   GET /auth/wallet-key (Google-authenticated session)
 * @param {object|null} p.walletDoc   wallets/{uid} as currently stored (to prune old halves)
 * @param {(fields: object) => Promise<void>} p.saveWalletFields  deep-merge into wallets/{uid}
 *   (Firestore setDoc(…, { merge: true }))
 * @param {() => any} p.deleteField    Firestore deleteField() of the calling app's SDK
 */
export async function backupToGoogle({ walletData, address, user, accessToken, fetchKek, walletDoc, saveWalletFields, deleteField }) {
  const googleSub = googleSubOf(user);
  if (!googleSub) throw fail("Connect a Google account first.", "GOOGLE_NOT_LINKED");
  if (!accessToken) throw fail("Sign in with Google to reach your Drive.", "GOOGLE_TOKEN_MISSING");
  const kek = await fetchKek();
  const { firestore, drive } = sealVault({ walletData, uid: user.uid, googleSub, address, kek });
  const id = firestore.backupId;
  await saveWalletFields({ googleVaults: { [id]: firestore } });
  await writeVaultFile(accessToken, drive);
  const stale = Object.keys(walletDoc?.googleVaults ?? {}).filter((k) => k !== id);
  await saveWalletFields({
    address,
    googleVault: firestore,
    googleVaults: Object.fromEntries([[id, deleteField()], ...stale.map((k) => [k, deleteField()])]),
  });
  return { backupId: firestore.backupId, createdAt: firestore.createdAt, driveHalf: drive };
}

/**
 * @param {object} p
 * @param {object} p.walletDoc   wallets/{uid} as read from Firestore
 * @param {object} [p.driveHalf] the Drive half if the caller already has it
 *   (e.g. cached on this device) — then Drive isn't contacted
 * @returns {Promise<{ walletData: object, driveHalf: object }>}
 */
export async function restoreFromGoogle({ walletDoc, user, accessToken, driveHalf, fetchKek }) {
  const googleSub = googleSubOf(user);
  if (!googleSub) throw fail("This account has no Google sign-in linked.", "GOOGLE_NOT_LINKED");
  if (!hasGoogleBackup(walletDoc)) throw fail("No Google backup found for this account.", "VAULT_MISSING");
  if (!driveHalf && !accessToken) throw fail("Sign in with Google to reach your Drive.", "GOOGLE_TOKEN_MISSING");
  const drive = driveHalf ?? (await readVaultFile(accessToken));
  if (!drive) {
    throw fail(
      "Your Google Drive has no Sysfi backup — it may have been removed from Drive's app data. Use your recovery phrase instead.",
      "VAULT_DRIVE_MISSING",
    );
  }
  const firestore = [walletDoc.googleVault, ...Object.values(walletDoc.googleVaults ?? {})].find((r) => r?.backupId && r.backupId === drive.backupId);
  if (!firestore) throw fail("Your Drive backup doesn't match this account's backup record.", "VAULT_MISMATCH");
  const kek = await fetchKek();
  return { walletData: openVault({ firestore, drive, uid: user.uid, googleSub, kek }), driveHalf: drive };
}

/** True when the wallet doc has a Google backup record. */
export const hasGoogleBackup = (walletDoc) => !!(walletDoc?.googleVault || Object.keys(walletDoc?.googleVaults ?? {}).length);
