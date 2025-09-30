// apps/web/src/app/layout.tsx
import './globals.css';
import Header from './header';
import ChunkErrorReload from '../components/ChunkErrorReload';
import ToastProvider from '../components/ToastProvider';
import SessionBanner from '../components/SessionBanner';
import { cookies } from 'next/headers';
import { createTranslator } from 'next-intl';
import { LocaleProvider } from '../lib/LocaleContext';
import { resolveServerLocale } from '../lib/server-locale';
import { prepareMessages } from '../i18n/messages';

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
  const { locale: normalizedLocale, messages } = prepareMessages(locale);
  const commonTranslator = createTranslator({
    locale: normalizedLocale,
    messages,
    namespace: 'Common',
  });

  return (
    <html lang={normalizedLocale}>
      <body>
        <a className="skip-link" href="#main-content">
          {commonTranslator('skipToContent')}
        </a>
        <LocaleProvider
          locale={normalizedLocale}
          acceptLanguage={acceptLanguage}
          timeZone={preferredTimeZone}
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
