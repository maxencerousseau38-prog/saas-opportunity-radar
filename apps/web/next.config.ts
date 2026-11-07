import type { NextConfig } from "next";
import { STATIC_SECURITY_HEADERS } from "./lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages export TypeScript source.
  transpilePackages: ["@sor/contracts", "@sor/domain", "@sor/database"],
  // Security headers on every response (S7.4b); the CSP is set per request by
  // proxy.ts because it carries a nonce.
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default nextConfig;
