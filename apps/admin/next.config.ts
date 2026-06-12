import type { NextConfig } from "next";

const apiOrigin = process.env.API_PROXY_TARGET ?? "http://localhost:3001";
const staticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  transpilePackages: ["@commercechat/mock-api"],
  output: staticExport ? "export" : undefined,
  trailingSlash: staticExport,
  images: { unoptimized: staticExport },
  typescript: staticExport ? { ignoreBuildErrors: true } : undefined,
  // Allow ngrok (and similar) to hit the Next dev server for Meta OAuth callbacks.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
  async rewrites() {
    if (staticExport) return [];
    return [
      {
        source: "/webhooks/:path*",
        destination: `${apiOrigin}/webhooks/:path*`,
      },
    ];
  },
};

export default nextConfig;
