'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

const features = [
  {
    titleKey: 'features.multiSport.title',
    bodyKey: 'features.multiSport.body',
  },
  {
    titleKey: 'features.tournaments.title',
    bodyKey: 'features.tournaments.body',
  },
  {
    titleKey: 'features.leaderboards.title',
    bodyKey: 'features.leaderboards.body',
  },
  {
    titleKey: 'features.notifications.title',
    bodyKey: 'features.notifications.body',
  },
];

export default function LandingPage() {
  const t = useTranslations('Landing');

  return (
    <main className="page landing-page">
      <section className="hero hero--accent">
        <div className="hero__content">
          <h1 className="hero__title">{t('title')}</h1>
          <p className="hero__subtitle">{t('subtitle')}</p>
          <div className="hero__actions">
            <Link href="/login" className="button hero__cta">
              {t('primaryCta')}
            </Link>
          </div>
          <p className="hero__supporting">{t('supportingCopy')}</p>
        </div>
      </section>

      <section className="section">
        <h2 className="heading">{t('featureHeading')}</h2>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.titleKey} className="feature-card">
              <h3 className="feature-card__title">{t(feature.titleKey)}</h3>
              <p className="feature-card__body">{t(feature.bodyKey)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <h2 className="heading">{t('workflowHeading')}</h2>
          <p>{t('workflowBody')}</p>
          <ul className="feature-list">
            <li>{t('workflowItems.capture')}</li>
            <li>{t('workflowItems.manage')}</li>
            <li>{t('workflowItems.share')}</li>
          </ul>
          <div className="hero__actions">
            <Link href="/login" className="button hero__cta">
              {t('primaryCta')}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
