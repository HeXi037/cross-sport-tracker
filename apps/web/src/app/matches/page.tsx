import Link from "next/link";

type Match = { id: number | string };

const httpBase = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

async function getMatches(): Promise<Match[]> {
  const res = await fetch(`${httpBase}/v0/matches`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch matches");
  return (await res.json()) as Match[];
}

export default async function MatchesPage() {
  const matches = await getMatches();
  return (
    <main className="container">
      <h1 className="heading">Matches</h1>
      <ul>
        {matches.map((m) => (
          <li key={m.id}>
            <Link href={`/matches/${m.id}`}>{m.id}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
