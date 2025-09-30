// apps/web/src/app/layout.tsx
import './globals.css';
import Header from './header';
import ChunkErrorReload from '../components/ChunkErrorReload';
import ToastProvider from '../components/ToastProvider';
import SessionBanner from '../components/SessionBanner';
import LocalizedMessagesProvider from '../components/LocalizedMessagesProvider';
import { cookies } from 'next/headers';
import { createTranslator } from 'next-intl/server';
import { LocaleProvider } from '../lib/LocaleContext';
import { resolveServerLocale } from '../lib/server-locale';
import { loadLocaleMessages } from '../i18n/messages';

export const metadata = {
  title: 'cross-sport-tracker',
  description: 'Ongoing self-hosted project',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const { locale, acceptLanguage, preferredTimeZone } = resolveServerLocale({
    cookieStore,
  });
  const {
    locale: resolvedLocale,
    messages,
  } = await loadLocaleMessages(locale);
  const translator = createTranslator({
    locale: resolvedLocale,
    messages,
  });

  return (
    <html lang={resolvedLocale}>
      <body>
        <a className="skip-link" href="#main-content">
          {translator('Common.nav.skipToContent')}
        </a>
        <LocaleProvider
          locale={locale}
          acceptLanguage={acceptLanguage}
          timeZone={preferredTimeZone}
        >
          <LocalizedMessagesProvider
            initialLocale={resolvedLocale}
            initialMessages={messages}
          >
            <ToastProvider>
              <ChunkErrorReload />
              <Header />
              <SessionBanner />
              <div id="main-content" tabIndex={-1} className="skip-target">
                {children}
              </div>
            </ToastProvider>
          </LocalizedMessagesProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
