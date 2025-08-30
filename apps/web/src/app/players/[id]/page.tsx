import Link from "next/link";
import { apiFetch } from "../../../lib/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

interface Match {
  id: string;
  sport: string;
  bestOf?: number | null;
  playedAt?: string | null;
  location?: string | null;
}

export default async function PlayerPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const res = await apiFetch(`/v0/players/${params.id}`, { cache: "no-store" });
    if (!res.ok) throw new Error();
    const p: Player = await res.json();

    const matchesRes = await apiFetch(
      `/v0/matches?playerId=${params.id}`,
      { cache: "no-store" }
    );
    const matches: Match[] = matchesRes.ok ? await matchesRes.json() : [];

    return (
      <main className="container">
        <h1 className="heading">{p.name}</h1>
        {p.club_id && <p>Club: {p.club_id}</p>}
        <h2 className="heading mt-4">Recent Matches</h2>
        {matches.length ? (
          <ul>
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/matches/${m.id}`}>Match {m.id}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>No matches found.</p>
        )}
        <Link href="/players" className="block mt-4">
          Back to players
        </Link>
      </main>
    );
  } catch {
    return (
      <main className="container">
        <p className="text-red-500">Failed to load player.</p>
        <Link href="/players">Back to players</Link>
      </main>
    );
  }
}

