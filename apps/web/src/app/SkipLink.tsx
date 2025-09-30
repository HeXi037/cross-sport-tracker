'use client';

import { useTranslations } from 'next-intl';

export default function SkipLink() {
  const t = useTranslations('app');
  return (
    <a className="skip-link" href="#main-content">
      {t('skipToContent')}
    </a>
  );
}
