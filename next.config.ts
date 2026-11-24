import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The mock DB seed and stored files are read with fs at runtime, so make
  // sure they ship with the serverless functions on Vercel.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
  },
};

export default nextConfig;
