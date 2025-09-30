// apps/web/src/app/layout.tsx
import './globals.css';
import Header from './header';
import ChunkErrorReload from '../components/ChunkErrorReload';
import ToastProvider from '../components/ToastProvider';
import SessionBanner from '../components/SessionBanner';
import SkipLink from './SkipLink';
import { cookies } from 'next/headers';
import { LocaleProvider } from '../lib/LocaleContext';
import TranslationProvider from '../lib/TranslationProvider';
import { getAllMessages } from '../lib/messages';
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
  const { locale, acceptLanguage, preferredTimeZone } = resolveServerLocale({
    cookieStore,
  });
  const messagesByLocale = getAllMessages();

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider
          locale={locale}
          acceptLanguage={acceptLanguage}
          timeZone={preferredTimeZone}
        >
          <TranslationProvider
            initialLocale={locale}
            messagesByLocale={messagesByLocale}
          >
            <SkipLink />
            <ToastProvider>
              <ChunkErrorReload />
              <Header />
              <SessionBanner />
              <div id="main-content" tabIndex={-1} className="skip-target">
                {children}
              </div>
            </ToastProvider>
          </TranslationProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
