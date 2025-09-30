import createNextIntlPlugin from 'next-intl/plugin';

const locales = ['en-GB', 'es-ES'];
const defaultLocale = 'en-GB';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts', {
  localePrefix: 'never',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Generate routes with a trailing slash so static hosts can resolve nested
  // paths like `/players/` without relying on custom rewrites.
  trailingSlash: true,
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
    ];
  },
  eslint: {
    // Allow production builds to complete even if there are ESLint errors.
    ignoreDuringBuilds: true,
  },
  i18n: {
    locales,
    defaultLocale,
  },
};

export default withNextIntl(nextConfig);
