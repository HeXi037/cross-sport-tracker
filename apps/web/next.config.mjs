/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep URLs canonical (no trailing slash) so both `/players` and `/players/`
  // hit the same route even on static hosts.
  trailingSlash: false,
  async redirects() {
    return [
      {
        source: '/index',
        destination: '/',
        permanent: true,
      },
      {
        source: '/index/',
        destination: '/',
        permanent: true,
      },
      {
        source: '/:path((?!_next|api).+)/',
        destination: '/:path',
        permanent: true,
      },
    ];
  },
  eslint: {
    // Allow production builds to complete even if there are ESLint errors.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
