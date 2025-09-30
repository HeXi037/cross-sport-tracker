import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('NotFound');
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
