import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const supportedLocales = ['en-GB', 'en-AU', 'es-ES'];
const defaultLocale = supportedLocales[0];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Generate routes with a trailing slash so static hosts can resolve nested
  // paths like `/players/` without relying on custom rewrites.
  trailingSlash: true,
  i18n: {
    locales: supportedLocales,
    defaultLocale,
  },
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
};

export default withNextIntl(nextConfig);
