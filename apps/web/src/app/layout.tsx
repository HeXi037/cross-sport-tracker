// apps/web/src/app/layout.tsx
import './globals.css';
import Header from './header';
import ChunkErrorReload from '../components/ChunkErrorReload';
import { headers } from 'next/headers';
import { LocaleProvider } from '../lib/LocaleContext';
import { parseAcceptLanguage } from '../lib/i18n';
import { ToastProvider } from '../lib/toast';

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
  const locale = parseAcceptLanguage(acceptLanguage);

  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>
          <ToastProvider>
            <ChunkErrorReload />
            <Header />
            {children}
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
