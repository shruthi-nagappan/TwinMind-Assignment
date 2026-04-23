import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Increase body size limit for audio chunk uploads (30s webm/opus ~1–3 MB)
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
