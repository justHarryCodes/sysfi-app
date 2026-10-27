// lib/wagmi.js — external-wallet support (MetaMask, Coinbase Wallet,
// WalletConnect, …) via wagmi + RainbowKit, for "Continue with wallet"
// sign-in and for signing transactions from wallet-bound accounts.
// Chains come from lib/chains.js. Wallets get the public RPCs (they use their
// own nodes for signing anyway); our reads go through lib/chain/transport.js.
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain } from "viem";
import { CHAIN_LIST, alchemyUrl } from "@/lib/config";

export const WAGMI_CHAINS = CHAIN_LIST.map((c) =>
  defineChain({
    id: c.id,
    name: c.name,
    nativeCurrency: c.nativeCurrency,
    rpcUrls: { default: { http: c.rpcs.length ? c.rpcs : [alchemyUrl(c)].filter(Boolean) } },
    blockExplorers: { default: { name: `${c.name} Explorer`, url: c.explorer } },
    testnet: c.testnet,
    iconUrl: c.icon,
    iconBackground: "#000000",
  }),
);

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
if (!projectId && process.env.NODE_ENV !== "production") {
  console.warn("[wagmi] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set — WalletConnect (QR / mobile wallets) won't work.");
}

export const wagmiConfig = getDefaultConfig({
  appName: "Sysfi",
  appDescription: "Where communities become tribes",
  appUrl: "https://sysfi.network",
  appIcon: "https://sysfi.network/icon.png",
  projectId: projectId || "MISSING_WALLETCONNECT_PROJECT_ID",
  chains: WAGMI_CHAINS,
  ssr: true,
});
