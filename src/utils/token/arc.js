// Curated token list for Arc (5042) — generated from LI.FI's token registry
// (li.quest/v1/tokens), majors only, same shape as the other lists here.
// USDC is Arc's native gas token and shares its balance with the ERC-20
// interface at 0x3600…0000, so that address is deliberately not listed
// (lib/chains.js maps it for swaps).
export const ARC_TOKENS = [
  {
    "chainId": 5042,
    "address": "0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1",
    "name": "Eurc",
    "symbol": "EURC",
    "decimals": 6,
    "logoURI": "https://static.debank.com/image/eth_token/logo_url/0x1abaea1f7c830bd89acc67ec4af516284b1bc33c/790d0c3a6da87111b66255c0d57108fa.png"
  },
  {
    "chainId": 5042,
    "address": "0x171A4217b86A807A64eB94757Db6849fb4bDbAA0",
    "name": "cirBTC",
    "symbol": "cirBTC",
    "decimals": 8,
    "logoURI": "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png"
  },
  {
    "chainId": 5042,
    "address": "0x8C4252c87081c88c6Ad57d6dD97E1cAFebF842B7",
    "name": "Virtuals Protocol",
    "symbol": "VIRTUAL",
    "decimals": 18
  },
  {
    "chainId": 5042,
    "address": "0x128cC466B61f542da60c70e3aA11c10e19B84EDB",
    "name": "Wrapped Ether",
    "symbol": "WETH",
    "decimals": 18
  }
];
