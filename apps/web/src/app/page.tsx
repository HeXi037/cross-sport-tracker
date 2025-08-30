export const dynamic = 'force-dynamic'; // make sure it fetches per request

import Link from "next/link";

async function getSports() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
  const res = await fetch(`${base}/v0/sports`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch sports');
  return res.json();
}

export default async function Page() {
  const sports = await getSports().catch(() => []);
  return (
    <main className="container">
      <h1 className="heading">cross-sport-tracker</h1>
      <p>Padel + Bowling MVP</p>
      <h2 className="heading">Sports</h2>
      <ul>
        {sports.map((s: { id: string; name: string }) => (
          <li key={s.id}>
            {s.name} ({s.id})
          </li>
        ))}
      </ul>
      <nav>
        <Link href="/players">Players</Link> | <Link href="/matches">Matches</Link> | <Link href="/record">Record</Link>
      </nav>
    </main>
  );
}
