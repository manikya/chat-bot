import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@commercechat/mock-api"],
  // Allow ngrok (and similar) to hit the Next dev server for Meta OAuth callbacks.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io"],
};

export default nextConfig;
