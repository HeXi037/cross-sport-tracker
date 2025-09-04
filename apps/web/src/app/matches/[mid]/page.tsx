import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import LiveSummary from "./live-summary";

type ID = string;

// "side" can be any identifier (A, B, C, ...), so keep it loose
type Participant = { side: string; playerIds: string[] };

type MatchDetail = {
  id: ID;
  sport?: string | null;
  ruleset?: string | null;
  status?: string | null;
  playedAt?: string | null;
  location?: string | null;
  participants?: Participant[] | null;
  // sets can be [[A,B], ...] or [{A,B}, ...] depending on backend normalization
  sets?: Array<[number, number] | { A: number; B: number }> | null;
};

async function fetchMatch(mid: string): Promise<MatchDetail> {
  const res = (await apiFetch(`/v0/matches/${encodeURIComponent(mid)}`, {
    cache: "no-store",
  } as RequestInit)) as Response;
  if (!res.ok) throw new Error(`match ${mid}`);
  return (await res.json()) as MatchDetail;
}

async function fetchPlayerName(pid: string): Promise<string> {
  const res = (await apiFetch(`/v0/players/${encodeURIComponent(pid)}`, {
    cache: "no-store",
  } as RequestInit)) as Response;
  if (!res.ok) return pid;
  const data = (await res.json()) as { id: string; name: string };
  return data?.name ?? pid;
}

function normalizeSet(s: [number, number] | { A?: number; B?: number }): [number, number] {
  // Accept either tuple or object
  if (Array.isArray(s) && s.length === 2) return [Number(s[0]) || 0, Number(s[1]) || 0];
  const obj = s as { A?: number; B?: number };
  return [Number(obj.A) || 0, Number(obj.B) || 0];
}

export default async function MatchDetailPage({
  params,
}: {
  params: { mid: string };
}) {
  const match = await fetchMatch(params.mid);

  // Resolve participant names (parallel)
  const parts = match.participants ?? [];
  const uniqueIds = Array.from(
    new Set(parts.flatMap((p) => p.playerIds ?? []))
  );
  const idToName = new Map<string, string>();
  await Promise.all(
    uniqueIds.map(async (pid) => {
      const name = await fetchPlayerName(pid);
      idToName.set(pid, name);
    })
  );

  const sideNames: Record<string, string[]> = {};
  for (const p of parts) {
    const names = (p.playerIds ?? []).map((id) => idToName.get(id) ?? id);
    sideNames[p.side] = names;
  }

  const playedAtDate = match.playedAt ? new Date(match.playedAt) : null;
  const playedAtStr = playedAtDate
    ? playedAtDate.getHours() || playedAtDate.getMinutes() || playedAtDate.getSeconds() || playedAtDate.getMilliseconds()
      ? playedAtDate.toLocaleString()
      : playedAtDate.toLocaleDateString()
    : "";

  return (
    <main className="container">
      <div className="text-sm">
        <Link href="/matches" className="underline underline-offset-2">
          ← Back to matches
        </Link>
      </div>

      <header className="section">
        <h1 className="heading">
          {Object.keys(sideNames)
            .map((s) => (sideNames[s]?.length ? sideNames[s].join(" / ") : s))
            .join(" vs ") || "A vs B"}
        </h1>
        <p className="match-meta">
          {match.sport || "sport"} · {match.ruleset || "rules"} · {" "}
          {match.status || "status"}
          {playedAtStr ? ` · ${playedAtStr}` : ""}
          {match.location ? ` · ${match.location}` : ""}
        </p>
      </header>

      <section className="section">
        <h2>Sets</h2>
        {match.sets && match.sets.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-4">#</th>
                <th className="py-1 pr-4">A</th>
                <th className="py-1">B</th>
              </tr>
            </thead>
            <tbody>
              {match.sets.map((s, i) => {
                const [a, b] = normalizeSet(s);
                return (
                  <tr key={i} className="border-t">
                    <td className="py-1 pr-4">{i + 1}</td>
                    <td className={`py-1 pr-4${a > b ? " font-bold" : ""}`}>{a}</td>
                    <td className={`py-1${b > a ? " font-bold" : ""}`}>{b}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="match-meta">No sets recorded yet.</p>
        )}
      </section>
      <LiveSummary mid={params.mid} initialSets={match.sets} />
    </main>
  );
}
