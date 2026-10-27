import { ARB_TOKENS } from "./arb";
import { AVAX_TOKENS } from "./avax";
import { BASE_TOKENS } from "./base";
import { BNB_TOKENS } from "./bnb";
import { POL_TOKENS } from "./pol";
import { ROBINHOOD_TOKENS } from "./robinhood";
import { ETHEREUM_TOKENS } from "./ethereum";
import { HYPEREVM_TOKENS } from "./hyperevm";
import { ARC_TOKENS } from "./arc";

// Map of chain IDs to their token lists
const CHAIN_TOKEN_LISTS = {
  8453:  BASE_TOKENS,         // Base Mainnet
  1:     ETHEREUM_TOKENS,
  137:   POL_TOKENS,
  42161: ARB_TOKENS,
  43114: AVAX_TOKENS,
  56:    BNB_TOKENS,
  4663:  ROBINHOOD_TOKENS,    // Robinhood Chain
  999:   HYPEREVM_TOKENS,     // HyperEVM
  5042:  ARC_TOKENS,          // Arc
};

/**
 * Get token list for a specific chain
 * @param {number} chainId - The chain ID
 * @returns {Array} Array of tokens for the chain
 */
export const getTokenListForChain = (chainId) => {
  return CHAIN_TOKEN_LISTS[chainId] || [];
};

/**
 * Get token by address from a specific chain
 * @param {number} chainId - The chain ID
 * @param {string} address - The token address
 * @returns {Object|null} Token object or null
 */
export const getTokenByAddress = (chainId, address) => {
  const tokens = getTokenListForChain(chainId);
  return (
    tokens.find(
      (token) => token.address.toLowerCase() === address.toLowerCase(),
    ) || null
  );
};

/**
 * Get token by symbol from a specific chain
 * @param {number} chainId - The chain ID
 * @param {string} symbol - The token symbol
 * @returns {Object|null} Token object or null
 */
export const getTokenBySymbol = (chainId, symbol) => {
  const tokens = getTokenListForChain(chainId);
  return (
    tokens.find(
      (token) => token.symbol.toLowerCase() === symbol.toLowerCase(),
    ) || null
  );
};

/**
 * Search tokens on a specific chain
 * @param {number} chainId - The chain ID
 * @param {string} query - Search query
 * @returns {Array} Filtered tokens
 */
export const searchTokens = (chainId, query) => {
  const tokens = getTokenListForChain(chainId);
  const lowerQuery = query.toLowerCase();

  return tokens.filter(
    (token) =>
      token.name.toLowerCase().includes(lowerQuery) ||
      token.symbol.toLowerCase().includes(lowerQuery) ||
      token.address.toLowerCase().includes(lowerQuery),
  );
};

/**
 * Check if a chain has tokens available
 * @param {number} chainId - The chain ID
 * @returns {boolean} True if chain has tokens
 */
export const hasTokensForChain = (chainId) => {
  const tokens = getTokenListForChain(chainId);
  return tokens && tokens.length > 0;
};

/**
 * Get popular tokens for a chain (top 10 by default)
 * @param {number} chainId - The chain ID
 * @param {number} count - Number of tokens to return
 * @returns {Array} Popular tokens
 */
export const getPopularTokens = (chainId, count = 10) => {
  const tokens = getTokenListForChain(chainId);
  return tokens.slice(0, count);
};

export default {
  getTokenListForChain,
  getTokenByAddress,
  getTokenBySymbol,
  searchTokens,
  hasTokensForChain,
  getPopularTokens,
};
