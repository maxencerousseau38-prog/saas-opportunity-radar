import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages export TypeScript source.
  transpilePackages: ["@sor/contracts", "@sor/domain", "@sor/database"],
};

export default nextConfig;
