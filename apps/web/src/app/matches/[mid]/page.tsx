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
  const [data, setData] = React.useState<MatchDetail | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
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
      setData(j);
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
      <main className="mx-auto max-w-3xl p-6">
        <p>Loading…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p className="text-red-700">Error: {error}</p>
        <button
          onClick={() => void load()}
          className="mt-3 rounded border px-3 py-2"
        >
          Retry
        </button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <p>No data.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Match {data.id}</h1>
        <p className="text-sm text-gray-600">
          Sport: <strong>{data.sport}</strong>
          {' · '}Best of: <strong>{data.bestOf ?? '—'}</strong>
          {' · '}Played:{' '}
          <strong>{data.playedAt ? new Date(data.playedAt).toLocaleString() : '—'}</strong>
          {' · '}Location: <strong>{data.location ?? '—'}</strong>
        </p>
      </header>

      <section>
        <h2 className="mb-2 font-medium">Participants</h2>
        <ul className="list-disc pl-6">
          {data.participants.map((p) => (
            <li key={p.id}>
              Side {p.side} — players: {p.playerIds.join(', ')}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Events</h2>
        {data.events.length === 0 ? (
          <p className="text-gray-600">No events yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.events.map((ev) => {
              const created = new Date(ev.createdAt).toLocaleString();
              const payloadPreview =
                ev.type === 'ROLL'
                  ? `sum=${rollsTotal(ev.payload)}`
                  : JSON.stringify(ev.payload);
              return (
                <li
                  key={ev.id}
                  className="rounded border p-3 text-sm"
                >
                  <div className="font-medium">
                    {ev.type}{' '}
                    <span className="text-gray-500">({created})</span>
                  </div>
                  <div className="text-gray-800 break-words">
                    {payloadPreview}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Summary</h2>
        <pre className="overflow-auto rounded border bg-gray-50 p-3 text-sm">
          {typeof data.summary === 'string'
            ? data.summary
            : JSON.stringify(data.summary, null, 2)}
        </pre>
      </section>

      <div>
        <button
          onClick={() => void load()}
          className="rounded border px-3 py-2"
        >
          Refresh
        </button>
      </div>
    </main>
  );
}
