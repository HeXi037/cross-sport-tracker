// apps/web/src/app/layout.tsx
import './globals.css';
import Header from './header';
import ChunkErrorReload from '../components/ChunkErrorReload';
import ToastProvider from '../components/ToastProvider';
import SessionBanner from '../components/SessionBanner';
import { cookies } from 'next/headers';
import { LocaleProvider } from '../lib/LocaleContext';
import { resolveServerLocale } from '../lib/server-locale';

export const metadata = {
  title: 'cross-sport-tracker',
  description: 'Ongoing self-hosted project',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const { locale, acceptLanguage, timeZone } = resolveServerLocale({
    cookieStore,
  });

  return (
    <html lang={locale}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <LocaleProvider
          locale={locale}
          acceptLanguage={acceptLanguage}
          timeZone={timeZone}
        >
          <ToastProvider>
            <ChunkErrorReload />
            <Header />
            <SessionBanner />
            <div id="main-content" tabIndex={-1} className="skip-target">
              {children}
            </div>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
