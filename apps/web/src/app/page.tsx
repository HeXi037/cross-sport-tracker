export const dynamic = 'force-dynamic'; // make sure it fetches per request

async function getSports() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
  const res = await fetch(`${base}/v0/sports`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch sports');
  return res.json();
}

export default async function Page() {
  const sports = await getSports().catch(() => []);
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>cross-sport-tracker</h1>
      <p>Padel + Bowling MVP</p>
      <h2>Sports</h2>
      <ul>
        {sports.map((s: any) => <li key={s.id}>{s.name} ({s.id})</li>)}
      </ul>
      <nav>
        <a href="/players">Players</a> | <a href="/matches">Matches</a> | <a href="/record">Record</a>
      </nav>
    </main>
  );
}
