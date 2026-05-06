import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  images: {
    remotePatterns: [
      // Supabase Storage public URLs (added when project URL is known via env)
    ],
  },
};

export default nextConfig;
