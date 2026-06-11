import type { NextConfig } from "next";

const apiOrigin = process.env.API_PROXY_TARGET ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  transpilePackages: ["@commercechat/mock-api"],
  // Allow ngrok (and similar) to hit the Next dev server for Meta OAuth callbacks.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
  async rewrites() {
    return [
      {
        source: "/webhooks/:path*",
        destination: `${apiOrigin}/webhooks/:path*`,
      },
    ];
  },
};

export default nextConfig;
