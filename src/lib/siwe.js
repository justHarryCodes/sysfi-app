// lib/siwe.js — client half of "Sign in with Ethereum" (server half:
// backend/src/services/siweService.js). The wallet signs a plain-text
// EIP-4361 message — no gas, no transaction — and the backend trades a valid
// signature for a Firebase custom token bound to that address.
import { createSiweMessage } from "viem/siwe";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import { DEFAULT_CHAIN, getChainById } from "@/lib/config";

// A 404 here means the API server predates wallet sign-in (older deploy) —
// say so plainly instead of a bare "Route not found", and before the wallet
// is asked to sign anything.
async function siwePost(path, body, opts) {
  try {
    return (await api.post(path, body, opts)).data;
  } catch (err) {
    if (err?.status === 404) {
      throw Object.assign(new Error("Wallet sign-in isn't available on this server yet. Please try again later."), { status: 404, code: "SIWE_UNAVAILABLE" });
    }
    throw err;
  }
}

/**
 * @param {{ address: string, chainId?: number, signMessage: (args: { message: string }) => Promise<string> }} p
 * @returns {Promise<{ isNewUser: boolean, address: string }>}
 */
export async function signInWithWallet({ address, chainId, signMessage }) {
  const chain = getChainById(chainId) || DEFAULT_CHAIN;
  const { nonce } = (await siwePost("/auth/siwe/nonce", { address, chainId: chain.id }, { auth: false }));

  const message = createSiweMessage({
    domain: window.location.host,
    address,
    statement: "Sign in to Sysfi. This request will not trigger a transaction or cost any fees.",
    uri: window.location.origin,
    version: "1",
    chainId: chain.id,
    nonce,
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 10 * 60 * 1000),
  });

  const signature = await signMessage({ message });
  const { token, isNewUser, address: bound } = (await siwePost("/auth/siwe/verify", { message, signature }, { auth: false }));
  await signInWithCustomToken(auth, token);
  return { isNewUser, address: bound };
}

async function signSiwe({ address, chainId, signMessage }) {
  const chain = getChainById(chainId) || DEFAULT_CHAIN;
  const { nonce } = (await siwePost("/auth/siwe/nonce", { address, chainId: chain.id }, { auth: false }));
  const message = createSiweMessage({
    domain: window.location.host,
    address,
    statement: "Link this wallet to my Sysfi account. This request will not trigger a transaction or cost any fees.",
    uri: window.location.origin,
    version: "1",
    chainId: chain.id,
    nonce,
    issuedAt: new Date(),
    expirationTime: new Date(Date.now() + 10 * 60 * 1000),
  });
  return { message, signature: await signMessage({ message }) };
}

/** Binds a wallet to the signed-in (email/Google) account as an extra login. */
export async function linkWalletToAccount(params) {
  const body = await signSiwe(params);
  return siwePost("/auth/siwe/link", body);
}

export const unlinkWalletFromAccount = async () => (await api.del("/auth/siwe/link")).data;

export { isUserRejection } from "./errors";
