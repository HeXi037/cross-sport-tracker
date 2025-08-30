export const dynamic = 'force-dynamic'; // fetch per request on the server

import Link from 'next/link';
import { apiFetch } from '../lib/api';

type Sport = { id: string; name: string };

export default async function HomePage() {
  let sports: Sport[] = [];
  try {
    const r = await apiFetch('/v0/sports', { cache: 'no-store' });
    if (r.ok) {
      sports = (await r.json()) as Sport[];
    }
  } catch {
    // ignore; render with empty list
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">cross-sport-tracker</h1>
        <p className="text-gray-700">Padel + Bowling MVP</p>
      </header>

      <section>
        <h2 className="mb-2 text-lg font-medium">Sports</h2>
        {sports.length === 0 ? (
          <p className="text-gray-600">No sports found.</p>
        ) : (
          <ul className="list-disc pl-6">
            {sports.map((s) => (
              <li key={s.id}>
                {s.name} <span className="text-gray-500">({s.id})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className="space-x-3">
        <Link href="/players">Players</Link>
        <Link href="/matches">Matches</Link>
        <Link href="/record">Record</Link>
      </nav>
    </main>
  );
}
