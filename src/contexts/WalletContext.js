"use client";
// contexts/WalletContext.js — web port of crypto-wallet/contexts/WalletContext.js.
//
// Security model
//   • The app is usable as soon as the user is signed in: the wallet ADDRESS
//     comes from the (encrypted) Firestore blob and non-secret account
//     metadata, so balances/profile/feed never need the key.
//   • Every on-chain action is authorised on the spot — like the app's
//     createSignerForTransaction(passcode): withSigner()/withSecret() open
//     the confirm sheet, decrypt the wallet, run the action, then drop the
//     key. Nothing decrypted outlives the call.
//   • Two ways a wallet is protected (walletSecurity):
//       "password" — the cloud copy is encrypted with the account password
//       "google"   — passwordless Google backup (lib/googleBackup.js): half
//                    in the user's Drive, half in Firestore, both wrapped
//                    with the Google-gated server key. The Drive half is
//                    kept on this browser (lib/deviceVault.js) so signing
//                    doesn't need a Google popup every hour.
//     Password accounts can add a Google backup too (backupToGoogleDrive) and
//     use it to restore the password copy (restorePasswordCopyFromGoogle).
//   • No device PIN on web: a PIN-encrypted copy in browser storage would be
//     brute-forceable offline (~1M guesses).
//   • The provider is keyed by uid (WalletRoot), so switching accounts
//     remounts it with fresh state.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BrowserProvider, Wallet } from "ethers";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { getAccount, getConnectorClient, switchChain } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi";
import { formatAddress } from "@/lib/wallet";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWalletKek } from "@/lib/api";
import { kvGet, kvSet, userScope } from "@/lib/cache/idb";
import { encryptWallet, unlockWallet, SCRYPT_N_CLOUD } from "@/lib/crypto/walletCrypto";
import { generateNewMnemonic, createAccountFromMnemonic, normalisePrivateKey } from "@/lib/wallet";

import { checkLocked, recordFailedAttempt, clearAttempts, formatLockMessage } from "@/lib/attemptLimiter";
import { getEncryptedWallet, saveEncryptedWallet } from "@/services/firebaseUser";
import { deleteField } from "firebase/firestore";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { backupToGoogle, restoreFromGoogle, hasGoogleBackup } from "@/lib/googleBackup";
import { cachedGoogleToken, forgetGoogleToken, stepUpWithGoogle } from "@/lib/googleAuth";

// Google's consent screen leaves Drive unticked by default. A token without
// Drive access is useless for the backup — drop it so the next try asks again.
const dropTokenIfNoDrive = (err) => {
  if (err?.code === "DRIVE_SCOPE_MISSING") forgetGoogleToken();
  throw err;
};
import { forgetDriveHalf, loadDriveHalf, saveDriveHalf } from "@/lib/deviceVault";
import WalletAuthSheet from "@/components/wallet/WalletAuthSheet";

const WalletContext = createContext(null);

const metaKey = (uid) => `accounts:${uid}`;
const defaultMeta = (address) => ({
  address,
  name: "Main Wallet",
  accounts: [{ index: 0, address, name: "Account 1" }],
  activeIndex: 0,
});

const cloudPayload = (address, enc) => ({
  address,
  encrypted: enc.encrypted,
  salt: enc.salt,
  iv: enc.iv,
  authTag: enc.authTag,
  version: enc.version,
  scryptN: enc.scryptN,
});

/**
 * Picks the wallet implementation for the signed-in user and remounts it
 * whenever the user (or their account type) changes:
 *   • Tribe wallet (email/password or Google) → WalletProvider below
 *   • wallet-signed account ("Continue with wallet") → ExternalWalletProvider
 * Both expose the same context shape.
 */
export function WalletRoot({ children }) {
  const { user } = useAuth();
  if (user?.isWalletAccount && user.walletAddress) {
    return (
      <ExternalWalletProvider key={`ext:${user.uid}`} address={user.walletAddress}>
        {children}
      </ExternalWalletProvider>
    );
  }
  return (
    <WalletProvider key={user?.uid ?? "signed-out"} uid={user?.uid ?? null}>
      {children}
    </WalletProvider>
  );
}

/**
 * Wallet for accounts bound to an external wallet. There are no Tribe-held
 * keys: every on-chain action is signed in the user's own wallet app
 * (MetaMask, WalletConnect, …), which must be connected to the bound address.
 */
function ExternalWalletProvider({ address, children }) {
  const { openConnectModal } = useConnectModal();

  const withSigner = useCallback(
    async (provider, fn) => {
      const { chainId } = await provider.getNetwork();
      const target = Number(chainId);
      const acct = getAccount(wagmiConfig);
      if (acct.status !== "connected") {
        openConnectModal?.();
        throw Object.assign(new Error(`Connect your wallet (${formatAddress(address)}) to continue.`), { code: "WALLET_NOT_CONNECTED" });
      }
      if (acct.address.toLowerCase() !== address.toLowerCase()) {
        throw Object.assign(
          new Error(`Your wallet is on ${formatAddress(acct.address)}. Switch to ${formatAddress(address)} — the address bound to this account.`),
          { code: "WRONG_WALLET" },
        );
      }
      if (acct.chainId !== target) await switchChain(wagmiConfig, { chainId: target });
      const client = await getConnectorClient(wagmiConfig, { chainId: target });
      const signer = await new BrowserProvider(client.transport, target).getSigner(acct.address);
      return fn(signer);
    },
    [address, openConnectModal],
  );

  /** Signs `message` with the bound address (no chain needed) — the message backup key. */
  const signAsOwner = useCallback(
    async (message) => {
      const acct = getAccount(wagmiConfig);
      if (acct.status !== "connected") {
        openConnectModal?.();
        throw Object.assign(new Error(`Connect your wallet (${formatAddress(address)}) to continue.`), { code: "WALLET_NOT_CONNECTED" });
      }
      if (acct.address.toLowerCase() !== address.toLowerCase()) {
        throw Object.assign(new Error(`Your wallet is on ${formatAddress(acct.address)}. Switch to ${formatAddress(address)} — the address bound to this account.`), { code: "WRONG_WALLET" });
      }
      const client = await getConnectorClient(wagmiConfig);
      const signer = await new BrowserProvider(client.transport).getSigner(acct.address);
      return signer.signMessage(message);
    },
    [address, openConnectModal],
  );

  const unsupported = useCallback(async () => {
    throw new Error("Your wallet app holds your keys — manage recovery and accounts there.");
  }, []);
  const noop = useCallback(() => {}, []);

  const value = {
    isExternal: true,
    ownerAddress: address,
    signAsOwner,
    checkingWallet: false,
    walletCheckError: null,
    retryWalletCheck: noop,
    firestoreWalletExists: true,
    backupPending: false,
    wallet: { name: "Connected wallet", address },
    address,
    accounts: [{ index: 0, address, name: "Connected wallet" }],
    activeAccountIndex: 0,
    createWallet: unsupported,
    createWalletWithGoogle: unsupported,
    walletSecurity: "external",
    googleBackup: null,
    backupToGoogleDrive: unsupported,
    restorePasswordCopyFromGoogle: unsupported,
    confirmBackup: noop,
    withSigner,
    withSecret: unsupported,
    rekeyWallet: unsupported,
    switchAccount: noop,
    addAccount: unsupported,
    renameAccount: noop,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

function WalletProvider({ uid, children }) {
  const { hasPasswordProvider, clearTempPassword } = useAuth();

  const [checkingWallet, setCheckingWallet] = useState(!!uid);
  const [walletCheckError, setWalletCheckError] = useState(null);
  const [cloudAddress, setCloudAddress] = useState(null);
  const [backupPending, setBackupPending] = useState(false);
  const [meta, setMeta] = useState(null); // { address, name, accounts, activeIndex }
  const [authRequest, setAuthRequest] = useState(null); // { title, description, resolve, reject }

  const blobRef = useRef(null);
  // The wallet doc as last read/written — decides how the wallet is protected.
  const [walletDoc, setWalletDoc] = useState(null);
  const clearPwRef = useRef(clearTempPassword);
  useEffect(() => {
    clearPwRef.current = clearTempPassword;
  });

  const saveMeta = useCallback(
    (next) => {
      setMeta(next);
      kvSet(metaKey(uid), next, userScope(uid));
    },
    [uid],
  );

  // ── Load wallet address + account metadata ────────────────────────────────
  const onBlobLoaded = useCallback(
    async (blob) => {
      blobRef.current = blob;
      setWalletDoc(blob ?? null);
      if (blob?.address) {
        const stored = await kvGet(metaKey(uid));
        setMeta(stored?.address === blob.address ? stored : defaultMeta(blob.address));
        // An existing wallet doesn't need the sign-in password any more —
        // don't keep it in memory.
        clearPwRef.current();
      }
      setCloudAddress(blob?.address ?? null);
      setWalletCheckError(null);
      setCheckingWallet(false);
    },
    [uid],
  );

  const onBlobError = useCallback((err) => {
    console.error("[WalletContext] wallet lookup failed:", err);
    setWalletCheckError(err.message || "Could not reach the server");
    setCheckingWallet(false);
  }, []);

  useEffect(() => {
    if (uid) getEncryptedWallet(uid).then(onBlobLoaded, onBlobError);
  }, [uid, onBlobLoaded, onBlobError]);

  const retryWalletCheck = useCallback(() => {
    setCheckingWallet(true);
    getEncryptedWallet(uid).then(onBlobLoaded, onBlobError);
  }, [uid, onBlobLoaded, onBlobError]);

  // ── Google backup ─────────────────────────────────────────────────────────
  // How this wallet is unlocked: "password", "google" (Drive + Firestore
  // halves), or "google-legacy" (older Google accounts: the cloud copy is
  // encrypted with the server key alone).
  const walletSecurity = walletDoc?.encrypted
    ? hasPasswordProvider
      ? "password"
      : "google-legacy"
    : hasGoogleBackup(walletDoc)
      ? "google"
      : null;

  const reloadDoc = useCallback(async () => {
    const doc = await getEncryptedWallet(uid);
    blobRef.current = doc;
    setWalletDoc(doc ?? null);
    return doc;
  }, [uid]);

  /** The server wallet key; a session that didn't sign in with Google steps up first. */
  const kekWithStepUp = useCallback(async () => {
    const via = (await auth.currentUser?.getIdTokenResult())?.signInProvider;
    if (via !== "google.com") await stepUpWithGoogle();
    return fetchWalletKek();
  }, []);

  /**
   * Decrypt the Google backup. Uses the Drive half kept on this device, else
   * reads it from Drive (needs a Drive token — call stepUpWithGoogle() from
   * the click first when needsGooglePopup() says so).
   */
  const openGoogleBackup = useCallback(async () => {
    const doc = await reloadDoc();
    let driveHalf = await loadDriveHalf(uid);
    const attempt = (half) =>
      restoreFromGoogle({ walletDoc: doc, user: auth.currentUser, accessToken: cachedGoogleToken(), driveHalf: half, fetchKek: kekWithStepUp });
    let result;
    try {
      result = await attempt(driveHalf);
    } catch (err) {
      // The copy on this device is from an older backup — fetch the current one.
      if (!driveHalf || !["VAULT_MISMATCH", "VAULT_TAMPERED"].includes(err.code)) dropTokenIfNoDrive(err);
      await forgetDriveHalf(uid);
      driveHalf = null;
      result = await attempt(null).catch(dropTokenIfNoDrive);
    }
    if (!driveHalf) await saveDriveHalf(uid, result.driveHalf);
    return result.walletData;
  }, [uid, reloadDoc, kekWithStepUp]);

  /** True when opening the Google backup will need a Google popup (no Drive half here, no token). */
  const needsGooglePopup = useCallback(async () => !cachedGoogleToken() && !(await loadDriveHalf(uid)), [uid]);

  const sealToGoogle = useCallback(
    async (walletData, address) => {
      const doc = blobRef.current ?? (await getEncryptedWallet(uid));
      const r = await backupToGoogle({
        walletData,
        address,
        user: auth.currentUser,
        accessToken: cachedGoogleToken() ?? (await stepUpWithGoogle()),
        fetchKek: kekWithStepUp,
        walletDoc: doc,
        saveWalletFields: (fields) => saveEncryptedWallet(uid, fields),
        deleteField,
      }).catch(dropTokenIfNoDrive);
      await saveDriveHalf(uid, r.driveHalf);
      await reloadDoc();
      return r;
    },
    [uid, kekWithStepUp, reloadDoc],
  );

  // ── Decrypt (used only inside an authorised action) ───────────────────────
  const decrypt = useCallback(
    async (secret, { viaGoogle = false } = {}) => {
      if (viaGoogle || (!blobRef.current?.encrypted && hasGoogleBackup(blobRef.current))) return openGoogleBackup();
      const status = checkLocked("cloud_unlock");
      if (status.locked) throw new Error(formatLockMessage(status.remainingMs));

      const blob = blobRef.current ?? (await getEncryptedWallet(uid));
      if (!blob) throw new Error("No cloud wallet found");

      let result;
      try {
        result = await unlockWallet(blob, secret, SCRYPT_N_CLOUD);
      } catch {
        recordFailedAttempt("cloud_unlock");
        throw new Error("Invalid password");
      }
      clearAttempts("cloud_unlock");

      if (result.needsMigration) {
        // Same upgrade the app performs: re-save as V3 with address AAD.
        const payload = cloudPayload(blob.address, result.migratedEncryption);
        await saveEncryptedWallet(uid, payload)
          .then(() => (blobRef.current = payload))
          .catch((e) => console.warn("[WalletContext] V3 migration save failed (non-fatal):", e));
      }
      return result.walletData;
    },
    [uid, openGoogleBackup],
  );

  /** Opens the confirm sheet; resolves with decrypted walletData. */
  const authorize = useCallback(
    ({ title = "Confirm with your password", description } = {}) =>
      new Promise((resolve, reject) => setAuthRequest({ title, description, resolve, reject })),
    [],
  );

  /**
   * Run `fn(walletData)` with the decrypted wallet, then drop it. For the
   * recovery-phrase screen and deriving new accounts.
   */
  const withSecret = useCallback(
    async (fn, opts) => {
      let data = await authorize(opts);
      try {
        return await fn(data);
      } finally {
        data = null;
      }
    },
    [authorize],
  );

  /**
   * Run `fn(signer)` with an ethers Wallet for the active account connected
   * to `provider`. Every on-chain action goes through here.
   */
  const withSigner = useCallback(
    (provider, fn, opts) =>
      withSecret((data) => {
        const idx = meta?.activeIndex ?? 0;
        const pk =
          idx === 0 ? normalisePrivateKey(data.privateKey) : createAccountFromMnemonic(data.mnemonic, idx).privateKey;
        return fn(new Wallet(pk, provider));
      }, opts),
    [withSecret, meta?.activeIndex],
  );

  /**
   * Signs `message` with the wallet's first account — always that one, not
   * the active account, so the result is the same on every device. Used for
   * the message backup key (lib/dm/crypto.js walletBackupMessage).
   */
  const signAsOwner = useCallback(
    (message, opts) => withSecret((data) => new Wallet(normalisePrivateKey(data.privateKey)).signMessage(message), opts),
    [withSecret],
  );

  // ── Re-key the cloud backup when the account password changes ─────────────
  // The app's change-password flow never does this, which leaves the cloud
  // wallet encrypted under the OLD password (unrecoverable after the change).
  // Here: decrypt with the current secret → re-encrypt with the new one →
  // run `commitAuth` (e.g. Firebase updatePassword) → save, with retries.
  const rekeyWallet = useCallback(
    async (currentSecret, nextSecret, commitAuth) => {
      const data = await decrypt(currentSecret);
      const blob = blobRef.current ?? (await getEncryptedWallet(uid));
      const payload = cloudPayload(blob.address, await encryptWallet(data, nextSecret, blob.address, SCRYPT_N_CLOUD));
      await commitAuth();
      const save = async () => {
        await saveEncryptedWallet(uid, payload);
        blobRef.current = payload;
      };
      for (let attempt = 1; ; attempt++) {
        try {
          return await save();
        } catch (err) {
          if (attempt >= 3) {
            throw Object.assign(
              new Error("Your password changed, but saving the re-encrypted wallet failed. Keep this tab open and retry."),
              { code: "REKEY_SAVE_FAILED", retry: save, cause: err },
            );
          }
          await new Promise((r) => setTimeout(r, 800 * attempt));
        }
      }
    },
    [decrypt, uid],
  );

  // ── Create (no import path, same as the app) ──────────────────────────────
  const createWallet = useCallback(
    async (cloudPassword, walletName = "Main Wallet") => {
      if (!uid) throw new Error("No user logged in");
      const mnemonic = generateNewMnemonic();
      const account = createAccountFromMnemonic(mnemonic, 0);
      const walletData = {
        mnemonic,
        privateKey: account.privateKey,
        publicKey: account.publicKey,
        createdAt: new Date().toISOString(),
      };

      const enc = await encryptWallet(walletData, cloudPassword, account.address, SCRYPT_N_CLOUD);
      const payload = cloudPayload(account.address, enc);
      await saveEncryptedWallet(uid, payload);

      blobRef.current = payload;
      saveMeta({ ...defaultMeta(account.address), name: walletName });
      setCloudAddress(account.address);
      // FlowGate keeps the user on /wallet-setup until the phrase is acknowledged.
      setBackupPending(true);
      return { address: account.address, mnemonic };
    },
    [uid, saveMeta],
  );

  /**
   * Passwordless wallet for a Google account: generated here, protected by
   * the Google backup (Drive + Firestore halves). Call from a click — it may
   * open the Google popup for Drive access.
   */
  const createWalletWithGoogle = useCallback(
    async (walletName = "Main Wallet") => {
      if (!uid) throw new Error("No user logged in");
      if (!cachedGoogleToken()) await stepUpWithGoogle();
      const mnemonic = generateNewMnemonic();
      const account = createAccountFromMnemonic(mnemonic, 0);
      const walletData = { mnemonic, privateKey: account.privateKey, publicKey: account.publicKey, createdAt: new Date().toISOString() };
      await sealToGoogle(walletData, account.address);
      saveMeta({ ...defaultMeta(account.address), name: walletName });
      setCloudAddress(account.address);
      setBackupPending(true);
      return { address: account.address, mnemonic };
    },
    [uid, sealToGoogle, saveMeta],
  );

  /**
   * Password accounts: add (or refresh) a Google Drive backup. Links Google to
   * the account if needed. Call from a click: the Google popup comes first,
   * then the password confirm.
   */
  const backupToGoogleDrive = useCallback(async () => {
    await stepUpWithGoogle();
    const address = blobRef.current?.address;
    return withSecret((data) => sealToGoogle(data, address), {
      title: "Back up to Google Drive",
      description: "Confirm with your password to encrypt your wallet into your Google Drive.",
    });
  }, [withSecret, sealToGoogle]);

  /**
   * Password accounts that can't open the password copy (e.g. after a
   * password reset): decrypt the Google backup and re-encrypt the cloud copy
   * with the current account password. Call from a click.
   */
  const restorePasswordCopyFromGoogle = useCallback(
    async (currentPassword) => {
      const fbUser = auth.currentUser;
      if (!fbUser?.email) throw new Error("No password sign-in on this account");
      if (await needsGooglePopup()) await stepUpWithGoogle();
      // Proves the password is the account's current one before we use it.
      await reauthenticateWithCredential(fbUser, EmailAuthProvider.credential(fbUser.email, currentPassword)).catch(() => {
        throw new Error("That isn't your current account password.");
      });
      let data = await openGoogleBackup();
      try {
        const address = blobRef.current?.address;
        const payload = cloudPayload(address, await encryptWallet(data, currentPassword, address, SCRYPT_N_CLOUD));
        await saveEncryptedWallet(uid, payload);
        await reloadDoc();
        clearAttempts("cloud_unlock");
      } finally {
        data = null;
      }
    },
    [uid, needsGooglePopup, openGoogleBackup, reloadDoc],
  );

  const confirmBackup = useCallback(() => setBackupPending(false), []);

  // ── Accounts ──────────────────────────────────────────────────────────────
  const switchAccount = useCallback(
    (index) => {
      if (meta?.accounts.some((a) => a.index === index)) saveMeta({ ...meta, activeIndex: index });
    },
    [meta, saveMeta],
  );

  const addAccount = useCallback(
    (name) =>
      withSecret(
        ({ mnemonic }) => {
          const index = meta.accounts.length;
          const { address } = createAccountFromMnemonic(mnemonic, index);
          saveMeta({
            ...meta,
            accounts: [...meta.accounts, { index, address, name: name || `Account ${index + 1}` }],
            activeIndex: index,
          });
          return { index, address };
        },
        { title: "Add account", description: "Enter your password to derive a new account from your wallet." },
      ),
    [meta, saveMeta, withSecret],
  );

  const renameAccount = useCallback(
    (index, name) => saveMeta({ ...meta, accounts: meta.accounts.map((a) => (a.index === index ? { ...a, name } : a)) }),
    [meta, saveMeta],
  );

  const activeAccount = meta?.accounts.find((a) => a.index === meta.activeIndex) ?? meta?.accounts[0];

  const value = {
    isExternal: false,
    checkingWallet,
    walletCheckError,
    retryWalletCheck,
    firestoreWalletExists: !!cloudAddress,
    backupPending,
    wallet: meta ? { name: meta.name, address: activeAccount?.address ?? meta.address } : null,
    address: activeAccount?.address ?? null,
    accounts: meta?.accounts ?? [],
    activeAccountIndex: meta?.activeIndex ?? 0,
    ownerAddress: meta?.accounts?.find((a) => a.index === 0)?.address ?? meta?.address ?? null,
    signAsOwner,
    createWallet,
    createWalletWithGoogle,
    confirmBackup,
    withSigner,
    withSecret,
    rekeyWallet,
    switchAccount,
    addAccount,
    renameAccount,
    walletSecurity,
    googleBackup: walletDoc?.googleVault ? { createdAt: walletDoc.googleVault.createdAt } : null,
    backupToGoogleDrive,
    restorePasswordCopyFromGoogle,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
      {authRequest && (
        <WalletAuthSheet
          request={authRequest}
          security={walletSecurity}
          hasGoogleBackup={hasGoogleBackup(walletDoc)}
          decrypt={decrypt}
          fetchKek={fetchWalletKek}
          needsGooglePopup={needsGooglePopup}
          stepUpWithGoogle={stepUpWithGoogle}
          onDone={() => setAuthRequest(null)}
        />
      )}
    </WalletContext.Provider>
  );
}

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
};
