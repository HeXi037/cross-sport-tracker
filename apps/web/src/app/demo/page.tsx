'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

interface DemoMatch {
  id: string;
  sport: string;
  summary: string;
  players: string;
  location: string;
}

interface DemoTournament {
  id: string;
  name: string;
  format: string;
  status: string;
}

interface DemoLeaderboardEntry {
  name: string;
  sport: string;
  streak: string;
}

interface DemoData {
  sports: string[];
  matches: DemoMatch[];
  tournaments: DemoTournament[];
  leaderboard: DemoLeaderboardEntry[];
}

const SAMPLE_DATA: DemoData = {
  sports: ['Padel', 'Bowling', 'Tennis', 'Disc Golf'],
  matches: [
    {
      id: 'match-1',
      sport: 'Padel',
      summary: '6-3, 5-7, 10-8',
      players: 'Ruiz / Mendez vs Fernandez / Soto',
      location: 'Demo Club – Court 2',
    },
    {
      id: 'match-2',
      sport: 'Bowling',
      summary: '322 – doubles scratch',
      players: 'Vasquez / Castro vs Demo Player / Guest',
      location: 'Demo Lanes – Bay 8',
    },
    {
      id: 'match-3',
      sport: 'Tennis',
      summary: '7-6, 6-4',
      players: 'Fernandez vs Demo Player',
      location: 'City Courts',
    },
  ],
  tournaments: [
    {
      id: 'tour-1',
      name: 'Summer Ladder',
      format: 'Rolling rankings across every sport',
      status: '23 matches logged',
    },
    {
      id: 'tour-2',
      name: 'Padel Masters',
      format: 'Elimination bracket + bronze final',
      status: 'Final underway',
    },
  ],
  leaderboard: [
    { name: 'Bella Fernandez', sport: 'Padel', streak: 'Won 5 of last 6' },
    { name: 'Carlos Mendez', sport: 'Disc Golf', streak: 'Three course records' },
    { name: 'Diana Soto', sport: 'Tennis', streak: 'Climbed 4 spots this week' },
  ],
};

export default function DemoPage() {
  const t = useTranslations('Demo');
  const [data, setData] = useState<DemoData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDemoData = () => {
    setLoading(true);
    window.setTimeout(() => {
      setData(SAMPLE_DATA);
      setLoading(false);
    }, 350);
  };

  useEffect(() => {
    loadDemoData();
  }, []);

  return (
    <main className="page demo-page">
      <section className="hero">
        <div className="hero__content">
          <h1 className="hero__title">{t('title')}</h1>
          <p className="hero__subtitle">{t('subtitle')}</p>
          <div className="hero__actions">
            <button
              type="button"
              className="button hero__cta"
              onClick={loadDemoData}
              disabled={loading}
            >
              {loading ? t('loading') : t('reload')}
            </button>
            <Link href="/landing" className="button button--ghost hero__secondary">
              {t('learnMore')}
            </Link>
          </div>
          <p className="hero__supporting">{t('supportingCopy')}</p>
        </div>
      </section>

      {loading ? (
        <p role="status" aria-live="polite" className="demo-status">
          {t('loading')}
        </p>
      ) : (
        <>
          <p className="demo-status" aria-live="polite">
            {t('loaded')}
          </p>

          <section className="section">
            <h2 className="heading">{t('sections.sports')}</h2>
            <div className="demo-grid">
              {data?.sports.map((sport) => (
                <div key={sport} className="feature-card">
                  <h3 className="feature-card__title">{sport}</h3>
                  <p className="feature-card__body">{t('sportBlurb')}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <h2 className="heading">{t('sections.tournaments')}</h2>
            <div className="demo-grid">
              {data?.tournaments.map((tournament) => (
                <div key={tournament.id} className="feature-card">
                  <div className="feature-card__eyebrow">{tournament.format}</div>
                  <h3 className="feature-card__title">{tournament.name}</h3>
                  <p className="feature-card__body">{tournament.status}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <h2 className="heading">{t('sections.matches')}</h2>
            <div className="demo-grid">
              {data?.matches.map((match) => (
                <div key={match.id} className="feature-card">
                  <div className="feature-card__eyebrow">{match.sport}</div>
                  <h3 className="feature-card__title">{match.players}</h3>
                  <p className="feature-card__body">{match.summary}</p>
                  <p className="feature-card__meta">{match.location}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <div className="card">
              <h2 className="heading">{t('sections.leaders')}</h2>
              <ul className="leaderboard-list">
                {data?.leaderboard.map((entry) => (
                  <li key={entry.name} className="leaderboard-list__item">
                    <div>
                      <p className="leaderboard-list__name">{entry.name}</p>
                      <p className="leaderboard-list__meta">{entry.sport}</p>
                    </div>
                    <p className="leaderboard-list__streak">{entry.streak}</p>
                  </li>
                ))}
              </ul>
              <div className="hero__actions">
                <Link href="/record" className="button hero__cta">
                  {t('cta.record')}
                </Link>
                <Link href="/tournaments" className="button button--ghost hero__secondary">
                  {t('cta.tournaments')}
                </Link>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
