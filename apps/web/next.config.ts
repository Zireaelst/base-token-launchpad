import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@launchpad/sdk", "@launchpad/ui"],
  images: {
    // Token images live in Vercel Blob.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  poweredByHeader: false,
};

export default config;
