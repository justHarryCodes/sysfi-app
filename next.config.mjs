import path from "node:path";

// wagmi → @wagmi/connectors → @base-org/account → @coinbase/cdp-sdk imports
// Coinbase's optional x402 payment packages (server-side features never run
// in a browser wallet connection). They aren't installed, so point them at
// an empty module instead of bundling them.
const X402_STUB = "./src/lib/stubs/empty.cjs";
const x402Aliases = Object.fromEntries(
  ["@x402/core/client", "@x402/evm", "@x402/evm/exact/client", "@x402/evm/upto/client", "@x402/svm/exact/client"].map((m) => [m, X402_STUB]),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { resolveAlias: x402Aliases },
  // `npm run build` uses webpack (--webpack), which needs the same aliases —
  // as absolute paths, and exact-match ("name$"): a plain "@x402/evm" alias
  // would also swallow "@x402/evm/exact/client" as a sub-path of the stub.
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(Object.keys(x402Aliases).map((m) => [`${m}$`, path.resolve(X402_STUB)])),
    };
    return config;
  },
  // URLs of the old Vite site (website/), so shared links keep working.
  async redirects() {
    return [
      { source: "/daos/create", destination: "/daos/launch", permanent: true },
      { source: "/dao/:chainId/:address/proposals/new", destination: "/daos/:chainId/:address/propose", permanent: true },
      { source: "/dao/:chainId/:address/proposals/:proposalId", destination: "/daos/:chainId/:address/proposal/:proposalId", permanent: true },
      { source: "/dao/:chainId/:address", destination: "/daos/:chainId/:address", permanent: true },
    ];
  },
  // Baseline hardening for a page that holds a decrypted wallet key in memory.
  // (A full Content-Security-Policy comes once the external origins used by
  // later phases — RPC, CoinGecko, Cloudinary, mini-app iframes — are settled.)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
