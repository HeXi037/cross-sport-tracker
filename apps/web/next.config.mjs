/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Allow production builds to complete even if there are ESLint errors.
    // We'll fix the lint errors incrementally and re-enable blocking later.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
