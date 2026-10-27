"use client";
// components/auth/WalletSignIn.js — "Continue with wallet": connect (RainbowKit
// modal: MetaMask, Coinbase Wallet, WalletConnect…) → sign a gas-less SIWE
// message → signed in to the account bound to that address (created on first
// use). FlowGate then routes new users to profile setup.
import { useCallback, useRef, useState } from "react";
import { useAccount, useAccountEffect, useDisconnect, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { IoWalletOutline } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import { useFeedback } from "@/contexts/FeedbackContext";
import { isUserRejection, signInWithWallet } from "@/lib/siwe";
import { formatAddress } from "@/lib/wallet";

export default function WalletSignIn({ label = "Continue with wallet", className = "" }) {
  const { address, chainId, isConnected } = useAccount();
  const { openConnectModal, connectModalOpen } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { showAlert } = useFeedback();
  const [signing, setSigning] = useState(false);
  const [awaitingConnect, setAwaitingConnect] = useState(false);
  const pending = useRef(false);

  const signIn = useCallback(
    async (addr, cid) => {
      setSigning(true);
      try {
        await signInWithWallet({ address: addr, chainId: cid, signMessage: signMessageAsync });
        // Stay in the busy state — FlowGate navigates away once the session lands.
      } catch (err) {
        setSigning(false);
        if (!isUserRejection(err)) showAlert("Wallet sign-in failed", err.message || "Please try again.");
      }
    },
    [signMessageAsync, showAlert],
  );

  // Continue straight to the signature once the modal connects a wallet.
  useAccountEffect({
    onConnect({ address: addr, chainId: cid, isReconnected }) {
      if (!pending.current || isReconnected) return;
      pending.current = false;
      setAwaitingConnect(false);
      signIn(addr, cid);
    },
  });

  const start = () => {
    if (isConnected && address) return signIn(address, chainId);
    pending.current = true;
    setAwaitingConnect(true);
    openConnectModal?.();
  };

  const connecting = awaitingConnect && connectModalOpen;
  const busy = signing || connecting;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        aria-busy={busy || undefined}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface text-[15px] font-bold text-text transition-colors hover:border-primary/50 disabled:cursor-wait disabled:opacity-80"
      >
        {busy ? <Spinner size={18} /> : <IoWalletOutline size={20} className="text-primary" />}
        {signing ? "Check your wallet to sign…" : connecting ? "Choose a wallet…" : isConnected ? `${label} · ${formatAddress(address, 4)}` : label}
      </button>
      {isConnected && !signing && (
        <p className="mt-2 text-center text-xs text-text-tertiary">
          Signing is free and doesn&apos;t send a transaction.{" "}
          <button type="button" onClick={() => disconnect()} className="font-semibold text-primary hover:underline">
            Use another wallet
          </button>
        </p>
      )}
    </div>
  );
}
