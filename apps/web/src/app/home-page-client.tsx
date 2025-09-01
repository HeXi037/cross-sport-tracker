'use client';

import React, { useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';

interface Sport { id: string; name: string }
interface MatchRow {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
}

const sportIcons: Record<string, string> = {
  padel: '\uD83C\uDFBE', // tennis ball
  bowling: '🎳',
};

interface Props {
  sports: Sport[];
  matches: MatchRow[];
  sportError: boolean;
  matchError: boolean;
}

export default function HomePageClient({
  sports: initialSports,
  matches: initialMatches,
  sportError: initialSportError,
  matchError: initialMatchError,
}: Props) {
  React;
  const [sports, setSports] = useState(initialSports);
  const [matches, setMatches] = useState(initialMatches);
  const [sportError, setSportError] = useState(initialSportError);
  const [matchError, setMatchError] = useState(initialMatchError);

  const retrySports = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
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
    }
  };

  const retryMatches = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const r = await apiFetch('/v0/matches', { cache: 'no-store' });
      if (r.ok) {
        setMatches((await r.json()) as MatchRow[]);
        setMatchError(false);
      } else {
        setMatchError(true);
      }
    } catch {
      setMatchError(true);
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
        {sports.length === 0 ? (
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
          <ul className="sport-list">
            {sports.map((s) => {
              const icon = sportIcons[s.id];
              return (
                <li key={s.id} className="sport-item">
                  {icon ? (
                    <span role="img" aria-label={s.name} title={s.name}>
                      {icon}
                    </span>
                  ) : (
                    s.name
                  )}
                  <span className="sport-id">{s.id}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="heading">Recent Matches</h2>
        {matches.length === 0 ? (
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
          <ul className="match-list">
            {matches.slice(0, 5).map((m) => (
              <li key={m.id} className="card match-item">
                <div>
                  <Link href={`/matches/${m.id}`}>Match {m.id}</Link>
                </div>
                <div className="match-meta">
                  {m.sport} · Best of {m.bestOf ?? '—'} ·{' '}
                  {m.playedAt ? new Date(m.playedAt).toLocaleDateString() : '—'}
                  {m.location ? ` · ${m.location}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
