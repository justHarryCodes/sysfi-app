// lib/config.js — web counterpart of crypto-wallet/constants/Config.js. Chain
// definitions moved to lib/chains.js (one entry per chain).

export const APP_CONFIG = {
  APP_NAME: "Sysfi",
  BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "https://api.sysfi.network/api/v1",
  MIN_PASSWORD_LENGTH: 8,
  MNEMONIC_STRENGTH: 128, // 12 words
  STORAGE_KEYS: {
    THEME: "@app_theme_preference",
    PENDING_ROUTE: "@nexus_pending_route",
  },
};

/** Optional. Only a fallback for slow public RPCs + the alchemy_* indexer APIs. */
export const ALCHEMY_KEY = process.env.NEXT_PUBLIC_ALCHEMY_KEY || "";
export const alchemyUrl = (chain) => (ALCHEMY_KEY && chain?.alchemy ? `https://${chain.alchemy}.g.alchemy.com/v2/${ALCHEMY_KEY}` : null);

/** EIP-7528 sentinel the app and backend use for the native token. */
export const NATIVE_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const isNativeAddress = (a) => !a || a === "native" || a.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();

// Chains live in lib/chains.js; re-exported here for existing imports.
export { CHAIN_LIST, DEFAULT_CHAIN, DAO_CHAINS, IS_PROD, LEGACY_CHAIN_ID, SWAP_CHAINS, getChainById } from "./chains";

export const explorerTx = (chain, hash) => `${chain.explorer}/tx/${hash}`;
export const explorerAddress = (chain, address) => `${chain.explorer}/address/${address}`;
export const explorerToken = (chain, address) => `${chain.explorer}/token/${address}`;
