import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@aabhushan/config"],
  output: "standalone",
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME ?? "Aabhushan",
  },
};

export default nextConfig;
