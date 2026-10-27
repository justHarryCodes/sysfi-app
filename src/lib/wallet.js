// lib/wallet.js — port of crypto-wallet/utils/Wallet.js key helpers.
import { HDNodeWallet, isAddress } from "ethers";
import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { APP_CONFIG } from "@/lib/config";

export const generateNewMnemonic = () => generateMnemonic(wordlist, APP_CONFIG.MNEMONIC_STRENGTH);

export const isValidMnemonic = (mnemonic) => validateMnemonic(mnemonic, wordlist);

/**
 * Must derive exactly what the mobile app derives, or existing users would
 * see different addresses on web. NOTE the app calls
 * `HDNodeWallet.fromPhrase(mnemonic, path)`, and in ethers v6 that second
 * argument is the BIP-39 *password*, not the path — so account `i` is
 * really: password = "m/44'/60'/0'/0/i", path = default m/44'/60'/0'/0/0.
 * That's non-standard (importing the bare 12 words elsewhere yields a
 * different address); it's reproduced verbatim here for compatibility and
 * flagged for a coordinated fix in both clients.
 */
export const createAccountFromMnemonic = (mnemonic, accountIndex = 0) => {
  if (!isValidMnemonic(mnemonic)) throw new Error("Invalid mnemonic phrase");
  const appPassword = `m/44'/60'/0'/0/${accountIndex}`;
  const w = HDNodeWallet.fromPhrase(mnemonic, appPassword);
  return { address: w.address, privateKey: w.privateKey, publicKey: w.publicKey };
};

/** Decrypted walletData.privateKey may be a hex string or a serialised byte object. */
export const normalisePrivateKey = (raw) => {
  if (typeof raw === "object" && raw !== null) {
    return "0x" + Object.values(raw).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return raw;
};

export const isValidAddress = (address) => isAddress(address);

export const formatAddress = (address, chars = 4) =>
  address ? `${address.substring(0, chars + 2)}...${address.substring(address.length - chars)}` : "";
