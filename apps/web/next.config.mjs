/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure both `/` and `/index/` resolve correctly on static hosts.
  trailingSlash: true,
  eslint: {
    // Allow production builds to complete even if there are ESLint errors.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
