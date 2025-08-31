'use client';

import React from 'react';

type Participant = {
  id: string;
  side: 'A' | 'B';
  playerIds: string[];
};

type EventOut = {
  id: string;
  type: string; // "POINT" | "ROLL" | "UNDO" | etc.
  payload: unknown;
  createdAt: string;
};

type MatchDetail = {
  id: string;
  sport: string;
  rulesetId: string | null;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  participants: Participant[];
  events: EventOut[];
  summary: unknown;
};

const BASE: string =
  (process.env.NEXT_PUBLIC_API_BASE_URL as string | undefined) ?? '/api';

type PlayerMap = Record<string, string>;

// type guard for numbers
const isNumber = (x: unknown): x is number => typeof x === 'number';

// safely sum rolls from an unknown payload shape
function rollsTotal(payload: unknown): number {
  const withRolls = payload as { rolls?: unknown };
  const rolls = withRolls?.rolls;
  if (!Array.isArray(rolls)) return 0;
  return (rolls as unknown[]).filter(isNumber).reduce<number>((acc, n) => acc + n, 0);
}

export default function MatchDetailPage({
  params,
}: {
  params: { mid: string };
}) {
  const { mid } = params;
  const [data, setData] = React.useState<(MatchDetail & { names: PlayerMap }) | null>(null);
  the [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/v0/matches/${mid}`, { cache: 'no-store' });
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }
      const j = (await r.json()) as MatchDetail;
      const ids = Array.from(new Set(j.participants.flatMap((p) => p.playerIds)));
      const names: PlayerMap = {};
      await Promise.all(
        ids.map(async (pid) => {
          const pr = await fetch(`${BASE}/v0/players/${pid}`, { cache: 'no-store' });
          if (pr.ok) {
            const pj = (await pr.json()) as { id: string; name: string };
            names[pj.id] = pj.name;
          }
        })
      );
      setData({ ...j, names });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [mid]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <main className="container">
        <p>Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container">
        <p className="error">Error: {error}</p>
        <button className="button mt-8" onClick={() => void load()}>
          Retry
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="container">
        <p>No data.</p>
      </main>
    );
  }

  const nameList = (ids: string[]) => ids.map((id) => data.names[id] ?? id).join(' & ');
  const sideA = data.participants.find((p) => p.side === 'A');
  const sideB = data.participants.find((p) => p.side === 'B');

  return (
    <main className="container">
      <header className="section">
        <h1 className="heading">
          {nameList(sideA?.playerIds ?? [])} vs {nameList(sideB?.playerIds ?? [])}
        </h1>
        <p className="match-meta">
          Match ID: <strong>{data.id}</strong>
          {' · '}Sport: <strong>{data.sport}</strong>
          {' · '}Best of: <strong>{data.bestOf ?? '—'}</strong>
          {' · '}Played:{' '}
          <strong>{data.playedAt ? new Date(data.playedAt).toLocaleDateString() : '—'}</strong>
          {' · '}Location: <strong>{data.location ?? '—'}</strong>
        </p>
      </header>

      <section className="section">
        <h2 className="heading">Participants</h2>
        <ul style={{ listStyle: 'disc', paddingLeft: '1.5rem' }}>
          {data.participants.map((p) => (
            <li key={p.id}>
              Side {p.side} — players: {p.playerIds.map((id) => data.names[id] ?? id).join(', ')}
            </li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="heading">Events</h2>
        {data.events.length === 0 ? (
          <p className="match-meta">No events yet.</p>
        ) : (
          <ul className="match-list">
            {data.events.map((ev) => {
              const created = new Date(ev.createdAt).toLocaleString();
              const payloadPreview =
                ev.type === 'ROLL'
                  ? `sum=${rollsTotal(ev.payload)}`
                  : JSON.stringify(ev.payload);
              return (
                <li key={ev.id} className="card">
                  <div style={{ fontWeight: 500 }}>
                    {ev.type}{' '}
                    <span className="match-meta">({created})</span>
                  </div>
                  <div style={{ wordBreak: 'break-word', fontSize: '0.9rem' }}>
                    {payloadPreview}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="heading">Summary</h2>
        <pre className="card" style={{ overflow: 'auto', fontSize: '0.9rem' }}>
          {typeof data.summary === 'string'
            ? data.summary
            : JSON.stringify(data.summary, null, 2)}
        </pre>
      </section>

      <div>
        <button className="button" onClick={() => void load()}>
          Refresh
        </button>
      </div>
    </main>
  );
}
