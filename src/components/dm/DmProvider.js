"use client";
// components/dm/DmProvider.js — the web's platform pieces for the shared DM
// state (lib/dm/react.js): Firebase token for the API, IndexedDB key store,
// and the shared realtime socket. Hooks are re-exported from there.
import { auth } from "@/lib/firebase";
import { APP_CONFIG } from "@/lib/config";
import { realtime } from "@/lib/realtime";
import { createDmHttp } from "@/lib/dm/http";
import { webStore } from "@/lib/dm/webStore";
import { DmProvider as SharedDmProvider } from "@/lib/dm/react";
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";

export { useDm, useConversations, useThread, useProfiles } from "@/lib/dm/react";

const makeHttp = () => createDmHttp({ baseUrl: APP_CONFIG.BACKEND_URL, getToken: (force) => auth.currentUser.getIdToken(force) });

export function DmProvider({ children }) {
  const { user } = useAuth();
  const uid = user?.uid ?? auth.currentUser?.uid ?? null;
  return (
    <SharedDmProvider uid={uid} makeHttp={makeHttp} makeStore={webStore} realtime={realtime}>
      {children}
    </SharedDmProvider>
  );
}

/**
 * The wallet as the key to the message backup → { wallet: { address, sign } },
 * or null while the wallet isn't loaded. Signing asks for the usual wallet
 * confirmation (password / Google, or the user's own wallet app).
 */
export function useBackupWallet() {
  const { ownerAddress, signAsOwner } = useWallet();
  return useMemo(
    () =>
      ownerAddress && signAsOwner
        ? {
            wallet: {
              address: ownerAddress,
              sign: (message) =>
                signAsOwner(message, {
                  title: "Unlock your messages",
                  description: "Your wallet is the key to your encrypted messages. Confirm to use it — nothing is sent on-chain.",
                }),
            },
          }
        : null,
    [ownerAddress, signAsOwner],
  );
}
