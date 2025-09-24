'use client';

import { useMemo, useState, type MouseEvent, type ReactElement } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import {
  enrichMatches,
  type MatchRow,
  type EnrichedMatch,
  type PlayerInfo,
} from '../lib/matches';
import PlayerName from '../components/PlayerName';
import { useLocale } from '../lib/LocaleContext';

interface Sport { id: string; name: string }

const sportIcons: Record<string, string> = {
  padel: '\uD83C\uDFBE', // tennis ball
  bowling: '🎳',
  tennis: '🎾',
  pickleball: '🥒',
  badminton: '🏸',
  table_tennis: '🏓',
};

interface Props {
  sports: Sport[];
  matches: EnrichedMatch[];
  sportError: boolean;
  matchError: boolean;
  initialLocale: string;
}

export default function HomePageClient({
  sports: initialSports,
  matches: initialMatches,
  sportError: initialSportError,
  matchError: initialMatchError,
}: Props): ReactElement {
  const [sports, setSports] = useState(initialSports);
  const [matches, setMatches] = useState(initialMatches);
  const [sportError, setSportError] = useState(initialSportError);
  const [matchError, setMatchError] = useState(initialMatchError);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const localeFromContext = useLocale();
  const activeLocale = localeFromContext || initialLocale;
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(activeLocale, { dateStyle: 'medium' }),
    [activeLocale],
  );

  const retrySports = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setSportsLoading(true);
    try {
      const r = await apiFetch('/v0/sports', { cache: 'no-store' });
      if (r.ok) {
        setSports((await r.json()) as Sport[]);
        setSportError(false);
      } else {
        setSportError(true);
      }
    } catch {
      setSportError(true);
    } finally {
      setSportsLoading(false);
    }
  };

  const retryMatches = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setMatchesLoading(true);
    try {
      const r = await apiFetch('/v0/matches', { cache: 'no-store' });
      if (r.ok) {
        const rows = (await r.json()) as MatchRow[];
        const enriched = await enrichMatches(rows.slice(0, 5));
        setMatches(enriched);
        setMatchError(false);
      } else {
        setMatchError(true);
      }
    } catch {
      setMatchError(true);
    } finally {
      setMatchesLoading(false);
    }
  };

  return (
    <main className="container">
      <section className="card">
        <h1 className="heading">cross-sport-tracker</h1>
        <p>Ongoing self-hosted project</p>
      </section>

      <section className="section">
        <h2 className="heading">Sports</h2>
        {sportsLoading && sports.length === 0 ? (
          <ul className="sport-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={`sport-skeleton-${i}`} className="sport-item">
                <div className="skeleton" style={{ width: '100%', height: '1em' }} />
              </li>
            ))}
          </ul>
        ) : sports.length === 0 ? (
          sportError ? (
            <p>
              Unable to load sports. Check connection.{" "}
              <a href="#" onClick={retrySports}>
                Retry
              </a>
            </p>
          ) : (
            <p>No sports found.</p>
          )
        ) : (
          <ul className="sport-list" role="list">
            {sports.map((s) => {
              const icon = sportIcons[s.id];
              return (
                <li key={s.id} className="sport-item">
                  {icon ? (
                    <span className="sport-icon" aria-hidden="true">
                      {icon}
                    </span>
                  ) : null}
                  {icon ? (
                    <span className="sr-only">{`${s.name} icon`}</span>
                  ) : null}
                  <span className="sport-name">{s.name}</span>
                  <span className="sport-id">{s.id}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="heading">Recent Matches</h2>
        {matchesLoading && matches.length === 0 ? (
          <ul className="match-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={`match-skeleton-${i}`} className="card match-item">
                <div className="skeleton" style={{ width: '60%', height: '1em', marginBottom: '4px' }} />
                <div className="skeleton" style={{ width: '40%', height: '0.8em' }} />
              </li>
            ))}
          </ul>
        ) : matches.length === 0 ? (
          matchError ? (
            <p>
              Unable to load matches. Check connection.{" "}
              <a href="#" onClick={retryMatches}>
                Retry
              </a>
            </p>
          ) : (
            <p>No matches recorded yet.</p>
          )
        ) : (
          <ul className="match-list" role="list">
            {matches.map((m) => (
              <li key={m.id} className="card match-item">
                <div style={{ fontWeight: 500 }}>
                  {Object.values(m.players).map((side: PlayerInfo[], i) => (
                    <span key={i}>
                      {side.map((pl, j) => (
                        <span key={pl.id}>
                          <PlayerName player={pl} />
                          {j < side.length - 1 ? ' & ' : ''}
                        </span>
                      ))}
                      {i < Object.values(m.players).length - 1 ? ' vs ' : ''}
                    </span>
                  ))}
                </div>
                <div className="match-meta">
                  {m.sport} · Best of {m.bestOf ?? '—'} ·{' '}
                  {m.playedAt ? dateFormatter.format(new Date(m.playedAt)) : '—'}
                  {m.location ? ` · ${m.location}` : ''}
                </div>
                <div>
                  <Link href={`/matches/${m.id}`}>Match details</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
