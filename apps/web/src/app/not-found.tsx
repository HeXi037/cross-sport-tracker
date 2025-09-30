import Link from 'next/link';
import { createTranslator } from 'next-intl';
import { resolveServerLocale } from '../lib/server-locale';
import { prepareMessages } from '../i18n/messages';

export default function NotFound() {
  const { locale } = resolveServerLocale();
  const { locale: normalizedLocale, messages } = prepareMessages(locale);
  const t = createTranslator({
    locale: normalizedLocale,
    messages,
    namespace: 'NotFound',
  });

  return (
    <main className="container">
      <section className="card">
        <h1 className="heading">{t('title')}</h1>
        <p>
          <Link href="/">{t('returnHome')}</Link>
        </p>
      </section>
    </main>
  );
}
