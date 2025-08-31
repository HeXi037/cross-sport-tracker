export const dynamic = 'force-dynamic'; // fetch per request on the server

import Link from 'next/link';
import { apiFetch } from '../lib/api';

type Sport = { id: string; name: string };
type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
};

const sportIcons: Record<string, string> = {
  padel: '\uD83C\uDFBE', // tennis ball
  bowling: '🎳',
};

export default async function HomePage() {
  let sports: Sport[] = [];
  let matches: MatchRow[] = [];
  try {
    const r = await apiFetch('/v0/sports', { cache: 'no-store' });
    if (r.ok) {
      sports = (await r.json()) as Sport[];
    }
  } catch {
    // ignore; render with empty list
  }
  try {
    const r = await apiFetch('/v0/matches', { cache: 'no-store' });
    if (r.ok) {
      matches = (await r.json()) as MatchRow[];
    }
  } catch {
    // ignore; render with empty list
  }

  return (
    <main className="container">
      <section className="card">
        <h1 className="heading">cross-sport-tracker</h1>
        <p>Ongoing self-hosted project</p>
      </section>

      <section className="section">
        <h2 className="heading">Sports</h2>
        {sports.length === 0 ? (
          <p>No sports found.</p>
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
          <p>No matches recorded yet.</p>
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
