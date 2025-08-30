import Link from "next/link";
import { apiFetch } from "../../lib/api";

type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
};

async function getMatches(): Promise<MatchRow[]> {
  const r = await apiFetch("/v0/matches", { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to load matches: ${r.status}`);
  return (await r.json()) as MatchRow[];
}

export default async function MatchesPage() {
  try {
    const matches = await getMatches();

    return (
      <main className="mx-auto max-w-3xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Matches</h1>
        <ul className="space-y-2">
          {matches.map((m) => (
            <li key={m.id} className="rounded border p-3">
              <div className="font-medium">
                <Link href={`/matches/${m.id}`}>Match {m.id}</Link>
              </div>
              <div className="text-sm text-gray-700">
                {m.sport} · Best of {m.bestOf ?? "—"} ·{" "}
                {m.playedAt ? new Date(m.playedAt).toLocaleString() : "—"} ·{" "}
                {m.location ?? "—"}
              </div>
            </li>
          ))}
        </ul>
      </main>
    );
  } catch {
    return (
      <main className="mx-auto max-w-3xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Matches</h1>
        <p className="text-red-600">Failed to load matches.</p>
        <Link href="/matches" className="text-blue-600 underline">
          Retry
        </Link>
      </main>
    );
  }
}
