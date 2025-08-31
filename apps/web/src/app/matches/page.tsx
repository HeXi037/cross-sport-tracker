import Link from "next/link";
import { apiFetch } from "../../lib/api";

type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
};

type Participant = {
  side: "A" | "B";
  playerIds: string[];
};

type MatchDetail = {
  participants: Participant[];
  summary?: {
    sets?: { A: number; B: number };
    games?: { A: number; B: number };
    points?: { A: number; B: number };
  } | null;
};

type EnrichedMatch = MatchRow & {
  names: Record<"A" | "B", string[]>;
  summary?: MatchDetail["summary"];
};

async function getMatches(): Promise<MatchRow[]> {
  const r = await apiFetch("/v0/matches", { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to load matches: ${r.status}`);
  return (await r.json()) as MatchRow[];
}

async function enrichMatches(rows: MatchRow[]): Promise<EnrichedMatch[]> {
  // Load match details for participants + score summaries.
  const details = await Promise.all(
    rows.map(async (m) => {
      const r = await apiFetch(`/v0/matches/${m.id}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Failed to load match ${m.id}`);
      const d = (await r.json()) as MatchDetail;
      return { row: m, detail: d };
    })
  );

  // Fetch all unique player names.
  const ids = new Set<string>();
  for (const { detail } of details) {
    for (const p of detail.participants) p.playerIds.forEach((id) => ids.add(id));
  }
  const idToName = new Map<string, string>();
  await Promise.all(
    Array.from(ids).map(async (pid) => {
      const r = await apiFetch(`/v0/players/${pid}`, { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { id: string; name: string };
        idToName.set(pid, j.name);
      }
    })
  );

  return details.map(({ row, detail }) => {
    const names: Record<"A" | "B", string[]> = { A: [], B: [] };
    for (const p of detail.participants) {
      names[p.side] = p.playerIds.map((id) => idToName.get(id) ?? id);
    }
    return { ...row, names, summary: detail.summary };
  });
}

function formatSummary(s?: MatchDetail["summary"]): string {
  if (!s) return "";
  if (s.sets) return `Sets ${s.sets.A}-${s.sets.B}`;
  if (s.games) return `Games ${s.games.A}-${s.games.B}`;
  if (s.points) return `Points ${s.points.A}-${s.points.B}`;
  return "";
}

export default async function MatchesPage() {
  try {
    const rows = await getMatches();
    const matches = await enrichMatches(rows);

    return (
      <main className="container">
        <h1 className="heading">Matches</h1>
        <ul className="match-list">
          {matches.map((m) => (
            <li key={m.id} className="card match-item">
              <div style={{ fontWeight: 500 }}>
                {m.names.A.join(" & ")} vs {m.names.B.join(" & ")}
              </div>
              <div className="match-meta">
                {formatSummary(m.summary)}
                {m.summary ? " · " : ""}
                {m.sport} · Best of {m.bestOf ?? "—"} · {" "}
                {m.playedAt ? new Date(m.playedAt).toLocaleDateString() : "—"} · {" "}
                {m.location ?? "—"}
              </div>
              <div>
                <Link href={`/matches/${m.id}`}>More info</Link>
              </div>
            </li>
          ))}
        </ul>
      </main>
    );
  } catch {
    return (
      <main className="container">
        <h1 className="heading">Matches</h1>
        <p className="error">Failed to load matches.</p>
        <Link href="/matches" style={{ textDecoration: "underline" }}>
          Retry
        </Link>
      </main>
    );
  }
}
