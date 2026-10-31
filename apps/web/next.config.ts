import type { NextConfig } from "next";

/**
 * @base-org/account (Base Account / Smart Wallet connector) depends on @coinbase/cdp-sdk, whose x402
 * payment helpers import optional @x402/* peers we do not install or use. Alias them to an empty stub
 * so the bundle builds; no code path in this app reaches them.
 */
const X402_STUB = "./lib/stubs/x402.cjs";

const config: NextConfig = {
  transpilePackages: ["@launchpad/sdk", "@launchpad/ui"],
  images: {
    // Token images live in Vercel Blob.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
    // Local dev/e2e uploads are served by our own route.
    localPatterns: [{ pathname: "/api/upload/**" }],
  },
  poweredByHeader: false,
  turbopack: {
    resolveAlias: {
      "@x402/core/client": X402_STUB,
      "@x402/core/schemas": X402_STUB,
      "@x402/core/server": X402_STUB,
      "@x402/evm": X402_STUB,
      "@x402/evm/auth-capture/client": X402_STUB,
      "@x402/evm/batch-settlement/client": X402_STUB,
      "@x402/evm/exact/client": X402_STUB,
      "@x402/evm/exact/server": X402_STUB,
      "@x402/evm/exact/v1/client": X402_STUB,
      "@x402/evm/upto/client": X402_STUB,
      "@x402/evm/upto/server": X402_STUB,
      "@x402/express": X402_STUB,
      "@x402/extensions/bazaar": X402_STUB,
      "@x402/extensions/builder-code": X402_STUB,
      "@x402/fetch": X402_STUB,
      "@x402/svm/exact/client": X402_STUB,
      "@x402/svm/exact/server": X402_STUB,
      "@x402/svm/exact/v1/client": X402_STUB,
      "@x402/svm/upto/client": X402_STUB,
      "@x402/svm/upto/server": X402_STUB,
    },
  },
};

export default config;
