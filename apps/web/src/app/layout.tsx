// apps/web/src/app/layout.tsx
import './globals.css';
import Header from './header';
import ChunkErrorReload from '../components/ChunkErrorReload';
import ToastProvider from '../components/ToastProvider';
import SessionBanner from '../components/SessionBanner';
import { headers, cookies } from 'next/headers';
import { LocaleProvider } from '../lib/LocaleContext';
import {
  parseAcceptLanguage,
  normalizeLocale,
  LOCALE_COOKIE_KEY,
} from '../lib/i18n';

export const metadata = {
  title: 'cross-sport-tracker',
  description: 'Ongoing self-hosted project',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = headers();
  const acceptLanguage = headerList.get('accept-language');
  const cookieStore = cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_KEY)?.value ?? null;
  const locale = normalizeLocale(
    cookieLocale,
    parseAcceptLanguage(acceptLanguage),
  );

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale} acceptLanguage={acceptLanguage}>
          <ToastProvider>
            <ChunkErrorReload />
            <Header />
            <SessionBanner />
            {children}
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
