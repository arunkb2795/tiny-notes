import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Action arguments contain credentials and note bodies; public paths contain share tokens.
  logging: {
    serverFunctions: false,
    incomingRequests: { ignore: [/^\/share(?:\/|$)/] },
  },
  async headers() {
    return ["/notes/:path*", "/share/:path*"].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "private, no-store, max-age=0" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ],
    }));
  },
  /* config options here */
  experimental: {
    agentFeedback: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
