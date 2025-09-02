import React from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
};

type Participant = { side: "A" | "B"; playerIds: string[] };
type MatchDetail = {
  participants: Participant[];
  summary?:
    | {
        sets?: { A: number; B: number };
        games?: { A: number; B: number };
        points?: { A: number; B: number };
      }
    | null;
};

type EnrichedMatch = MatchRow & {
  names: Record<"A" | "B", string[]>;
  summary?: MatchDetail["summary"];
  playerSide?: "A" | "B" | null;
};

async function getPlayer(id: string): Promise<Player> {
  const res = await apiFetch(`/v0/players/${encodeURIComponent(id)}`, {
    cache: "no-store",
  } as RequestInit);
  // apiFetch returns a Response in this app
  if (!res.ok) throw new Error("player");
  return (await res.json()) as Player;
}

async function getMatches(playerId: string): Promise<EnrichedMatch[]> {
  const r = await apiFetch(`/v0/matches?playerId=${encodeURIComponent(playerId)}`, {
    cache: "no-store",
  } as RequestInit);
  if (!r.ok) return [];
  const rows = (await r.json()) as MatchRow[];

  // Load details for participants and summaries
  const details = await Promise.all(
    rows.map(async (m) => {
      const resp = await apiFetch(`/v0/matches/${encodeURIComponent(m.id)}`, {
        cache: "no-store",
      } as RequestInit);
      if (!resp.ok) throw new Error(`match ${m.id}`);
      return { row: m, detail: (await resp.json()) as MatchDetail };
    })
  );

  // Fetch player names for all participants
  const ids = new Set<string>();
  for (const { detail } of details) {
    const parts = detail?.participants ?? [];
    for (const p of parts) {
      (p?.playerIds ?? []).forEach((id) => ids.add(id));
    }
  }

  const idToName = new Map<string, string>();
  await Promise.all(
    Array.from(ids).map(async (pid) => {
      const resp = await apiFetch(`/v0/players/${encodeURIComponent(pid)}`, {
        cache: "no-store",
      } as RequestInit);
      if (resp.ok) {
        const j = (await resp.json()) as { id: string; name: string };
        idToName.set(pid, j.name);
      }
    })
  );

  return details.map(({ row, detail }) => {
    const names: Record<"A" | "B", string[]> = { A: [], B: [] };
    let playerSide: "A" | "B" | null = null;
    for (const p of detail.participants ?? []) {
      names[p.side] = (p.playerIds ?? []).map((id) => idToName.get(id) ?? id);
      if (p.playerIds?.includes(playerId)) playerSide = p.side;
    }
    return { ...row, names, summary: detail.summary, playerSide };
  });
}

function formatSummary(s?: MatchDetail["summary"]): string {
  if (!s) return "";
  if (s.sets) return `Sets ${s.sets.A}-${s.sets.B}`;
  if (s.games) return `Games ${s.games.A}-${s.games.B}`;
  if (s.points) return `Points ${s.points.A}-${s.points.B}`;
  return "";
}

function winnerFromSummary(s?: MatchDetail["summary"]): "A" | "B" | null {
  if (!s) return null;
  for (const key of ["sets", "games", "points"] as const) {
    const val = (s as any)[key] as { A?: number; B?: number } | undefined;
    if (val && typeof val.A === "number" && typeof val.B === "number") {
      if (val.A > val.B) return "A";
      if (val.B > val.A) return "B";
    }
  }
  return null;
}

type SeasonSummary = { season: string; wins: number; losses: number };

function summariseSeasons(matches: EnrichedMatch[]): SeasonSummary[] {
  const byYear: Record<string, { wins: number; losses: number }> = {};
  for (const m of matches) {
    if (!m.playedAt) continue;
    const year = new Date(m.playedAt).getFullYear().toString();
    if (!byYear[year]) byYear[year] = { wins: 0, losses: 0 };
    const winner = winnerFromSummary(m.summary);
    if (winner && m.playerSide) {
      if (winner === m.playerSide) byYear[year].wins += 1;
      else byYear[year].losses += 1;
    }
  }
  return Object.keys(byYear)
    .sort()
    .map((season) => ({ season, ...byYear[season] }));
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string };
}) {
  try {
    const [player, matches] = await Promise.all([
      getPlayer(params.id),
      getMatches(params.id),
    ]);

    const view = searchParams?.view === "summary" ? "summary" : "timeline";
    const seasons = summariseSeasons(matches);
    const sortedMatches = [...matches].sort((a, b) => {
      const da = a.playedAt ? new Date(a.playedAt).getTime() : 0;
      const db = b.playedAt ? new Date(b.playedAt).getTime() : 0;
      return da - db;
    });

    return (
      <main className="container">
        <h1 className="heading">{player.name}</h1>
        {player.club_id && <p>Club: {player.club_id}</p>}

        <nav className="mt-4 mb-4 space-x-4">
          <Link
            href={`/players/${params.id}?view=timeline`}
            className={view === "timeline" ? "font-bold" : ""}
          >
            Timeline
          </Link>
          <Link
            href={`/players/${params.id}?view=summary`}
            className={view === "summary" ? "font-bold" : ""}
          >
            Season Summary
          </Link>
        </nav>

        {view === "timeline" ? (
          <section>
            <h2 className="heading">Matches</h2>
            {sortedMatches.length ? (
              <ul>
                {sortedMatches.map((m) => {
                  const winner = winnerFromSummary(m.summary);
                  const result =
                    winner && m.playerSide
                      ? winner === m.playerSide
                        ? "Win"
                        : "Loss"
                      : "";
                  return (
                    <li key={m.id} className="mb-2">
                      <div>
                        <Link href={`/matches/${m.id}`}>
                          {m.names.A.join(" & ")} vs {m.names.B.join(" & ")}
                        </Link>
                      </div>
                      <div className="text-sm text-gray-700">
                        {formatSummary(m.summary)}
                        {result ? ` · ${result}` : ""}
                        {m.summary || result ? " · " : ""}
                        {m.sport} · Best of {m.bestOf ?? "—"} ·{" "}
                        {m.playedAt
                          ? new Date(m.playedAt).toLocaleDateString()
                          : "—"}
                        {" · "}
                        {m.location ?? "—"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>No matches found.</p>
            )}
          </section>
        ) : (
          <section>
            <h2 className="heading">Season Summary</h2>
            {seasons.length ? (
              <ul>
                {seasons.map((s) => (
                  <li key={s.season} className="mb-2">
                    <div className="font-semibold">{s.season}</div>
                    <div className="text-sm text-gray-700">
                      Wins: {s.wins} · Losses: {s.losses}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No matches found.</p>
            )}
          </section>
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
