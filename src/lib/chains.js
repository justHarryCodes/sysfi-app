// lib/chains.js — the one place a chain is defined. Wallet, trade, DAOs,
// wagmi and the RPC layer all read from here, so supporting a new chain (or
// a new DAO factory deployment) is a single entry below.
//
// Fields
//   rpcs          public JSON-RPC endpoints, tried in order (see lib/chain/transport.js)
//   alchemy       Alchemy subdomain — fallback when public RPCs are slow or down,
//                 and the only source for alchemy_* indexer methods. null = none.
//   nativeCurrency / nativeLogo / coingeckoId   gas token
//   wrappedNative ERC-20 used for market data (charts, prices) of the gas token
//   gtNetwork     GeckoTerminal network id (charts, pools, prices)
//   swap.router   "0x" (backend /swap/*) or "lifi" (backend /lifi/quote, same chain)
//   swap.market   default market symbol on the trade screen
//   swap.nativeAs ERC-20 to trade instead of the native coin (Arc's USDC)
//   daoFactory    DAOFactory deployment (contracts/DAOFactory.sol), null until deployed
//   hiddenTokens  addresses the wallet must not list (duplicates of the native coin)

const ETH_LOGO = "https://assets.coingecko.com/coins/images/279/small/ethereum.png";
const icon = (name) => `https://icons.llamao.fi/icons/chains/rsz_${name}.jpg`;
const ether = { name: "Ether", symbol: "ETH", decimals: 18 };

export const IS_PROD = process.env.NODE_ENV === "production";

const MAINNETS = [
  {
    id: 4663,
    key: "robinhood",
    name: "Robinhood Chain",
    shortName: "Robinhood",
    nativeCurrency: ether,
    nativeLogo: ETH_LOGO,
    coingeckoId: "ethereum",
    icon: icon("robinhood"),
    explorer: "https://robinhoodchain.blockscout.com",
    rpcs: ["https://robinhood-rpc.publicnode.com", "https://rpc.mainnet.chain.robinhood.com"],
    alchemy: "robinhood-mainnet",
    wrappedNative: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    gtNetwork: "robinhood",
    gasReserve: "0.0003", // kept back when you trade "Max" of the gas token
    swap: { router: "0x", market: "cbBTC" },
    daoFactory: "0x38D64ef112d7d840667CfBc268179eE410403A94",
  },
  {
    id: 1,
    key: "ethereum",
    name: "Ethereum",
    shortName: "Ethereum",
    nativeCurrency: ether,
    nativeLogo: ETH_LOGO,
    coingeckoId: "ethereum",
    icon: icon("ethereum"),
    explorer: "https://etherscan.io",
    rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"],
    alchemy: "eth-mainnet",
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    gtNetwork: "eth",
    gasReserve: "0.002", // kept back when you trade "Max" of the gas token
    swap: { router: "0x", market: "WBTC" },
    daoFactory: null,
  },
  {
    id: 8453,
    key: "base",
    name: "Base",
    shortName: "Base",
    nativeCurrency: ether,
    nativeLogo: ETH_LOGO,
    coingeckoId: "ethereum",
    icon: icon("base"),
    explorer: "https://basescan.org",
    rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"],
    alchemy: "base-mainnet",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    gtNetwork: "base",
    gasReserve: "0.0003", // kept back when you trade "Max" of the gas token
    swap: { router: "0x", market: "cbBTC" },
    daoFactory: "0x38D64ef112d7d840667CfBc268179eE410403A94",
  },
  {
    id: 56,
    key: "bnb",
    name: "BNB Chain",
    shortName: "BNB",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    nativeLogo: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
    coingeckoId: "binancecoin",
    icon: icon("binance"),
    explorer: "https://bscscan.com",
    rpcs: ["https://bsc-dataseed1.bnbchain.org", "https://bsc-rpc.publicnode.com"],
    alchemy: "bnb-mainnet",
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    gtNetwork: "bsc",
    gasReserve: "0.001", // kept back when you trade "Max" of the gas token
    swap: { router: "0x", market: "BTCB" },
    daoFactory: "0x3c181eaaB64052c726194Da6797EA06DD15e8E6B",
  },
  {
    id: 137,
    key: "polygon",
    name: "Polygon",
    shortName: "Polygon",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    nativeLogo: "https://assets.coingecko.com/coins/images/32440/small/polygon.png",
    coingeckoId: "polygon-ecosystem-token",
    icon: icon("polygon"),
    explorer: "https://polygonscan.com",
    rpcs: ["https://polygon.drpc.org", "https://polygon-bor-rpc.publicnode.com"],
    alchemy: "polygon-mainnet",
    wrappedNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    gtNetwork: "polygon_pos",
    gasReserve: "0.1", // kept back when you trade "Max" of the gas token
    swap: { router: "0x", market: "WBTC" },
    daoFactory: "0x3c181eaaB64052c726194Da6797EA06DD15e8E6B",
  },
  {
    id: 42161,
    key: "arbitrum",
    name: "Arbitrum",
    shortName: "Arbitrum",
    nativeCurrency: ether,
    nativeLogo: ETH_LOGO,
    coingeckoId: "ethereum",
    icon: icon("arbitrum"),
    explorer: "https://arbiscan.io",
    rpcs: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
    alchemy: "arb-mainnet",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    gtNetwork: "arbitrum",
    gasReserve: "0.0003", // kept back when you trade "Max" of the gas token
    swap: { router: "0x", market: "ARB" },
    daoFactory: "0x3c181eaaB64052c726194Da6797EA06DD15e8E6B",
  },
  {
    id: 43114,
    key: "avalanche",
    name: "Avalanche",
    shortName: "Avalanche",
    nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    nativeLogo: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png",
    coingeckoId: "avalanche-2",
    icon: icon("avalanche"),
    explorer: "https://snowtrace.io",
    rpcs: ["https://avalanche-c-chain-rpc.publicnode.com", "https://api.avax.network/ext/bc/C/rpc"],
    alchemy: "avax-mainnet",
    wrappedNative: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    gtNetwork: "avax",
    gasReserve: "0.01", // kept back when you trade "Max" of the gas token
    swap: { router: "0x", market: "BTC.b" },
    daoFactory: "0x3c181eaaB64052c726194Da6797EA06DD15e8E6B",
  },
  {
    id: 999,
    key: "hyperevm",
    name: "HyperEVM",
    shortName: "HyperEVM",
    nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
    nativeLogo: "https://assets.coingecko.com/coins/images/50882/small/hyperliquid.jpg",
    coingeckoId: "hyperliquid",
    icon: icon("hyperliquid"),
    explorer: "https://hyperevmscan.io",
    rpcs: ["https://rpc.hyperliquid.xyz/evm", "https://hyperliquid-json-rpc.stakely.io"],
    alchemy: "hyperliquid-mainnet",
    wrappedNative: "0x5555555555555555555555555555555555555555",
    gtNetwork: "hyperevm",
    gasReserve: "0.01", // kept back when you trade "Max" of the gas token
    swap: { router: "0x", market: "UBTC" },
    daoFactory: null,
  },
  {
    id: 5042,
    key: "arc",
    name: "Arc",
    shortName: "Arc",
    // Arc's gas token is USDC. Natively it has 18 decimals; the ERC-20
    // interface at 0x3600…0000 reads the same balance with 6.
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
    nativeLogo: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
    coingeckoId: "usd-coin",
    icon: icon("arc"),
    explorer: "https://explorer.arc.io",
    rpcs: ["https://rpc.mainnet.arc.io", "https://rpc.drpc.mainnet.arc.io", "https://rpc.blockdaemon.mainnet.arc.io"],
    // Enable "Arc Mainnet" on the Alchemy app to turn on the fallback.
    alchemy: "arc-mainnet",
    wrappedNative: "0x3600000000000000000000000000000000000000",
    gtNetwork: "arc",
    gasReserve: "0.1", // kept back when you trade "Max" of the gas token
    swap: { router: "lifi", market: "cirBTC", nativeAs: { address: "0x3600000000000000000000000000000000000000", symbol: "USDC", name: "USD Coin", decimals: 6 } },
    daoFactory: null,
    hiddenTokens: ["0x3600000000000000000000000000000000000000"],
  },
];

/**
 * Normalised chain objects. `symbol`, `decimals`, `nativeTokenName` and
 * `testnet` are kept flat because the wallet screens (ported from the app's
 * Chain.js shape) read them directly.
 */
export const CHAIN_LIST = MAINNETS.map((c) => ({
  ...c,
  symbol: c.nativeCurrency.symbol,
  decimals: c.nativeCurrency.decimals,
  nativeTokenName: c.nativeCurrency.name,
  testnet: !!c.testnet,
  hiddenTokens: (c.hiddenTokens ?? []).map((a) => a.toLowerCase()),
}));

/** Where new users start (and the chain pickers' default): Base. */
export const DEFAULT_CHAIN = CHAIN_LIST.find((c) => c.key === "base") ?? CHAIN_LIST[0];
/**
 * Records saved before chains were stored with them (e.g. older token gates
 * with no chainId) are on Robinhood Chain — read them there, not on the
 * default chain.
 */
export const LEGACY_CHAIN_ID = 4663;
export const getChainById = (id) => CHAIN_LIST.find((c) => c.id === Number(id));
export const DAO_CHAINS = CHAIN_LIST.filter((c) => c.daoFactory);
export const SWAP_CHAINS = CHAIN_LIST.filter((c) => c.swap);
