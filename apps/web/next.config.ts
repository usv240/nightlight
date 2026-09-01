import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@nightlight/engine", "@nightlight/simulator"],
};

export default nextConfig;
