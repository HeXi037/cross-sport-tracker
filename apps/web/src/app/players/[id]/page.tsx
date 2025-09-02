import React from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import PlayerCharts from "./PlayerCharts";
import PlayerComments from "./comments-client";

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
  participants: Participant[];
  summary?: MatchDetail["summary"];
  playerSide: "A" | "B" | null;
  playerWon?: boolean;
};

interface VersusRecord {
  playerId: string;
  playerName: string;
  wins: number;
  losses: number;
  winPct: number;
}

interface PlayerStats {
  playerId: string;
  bestAgainst?: VersusRecord | null;
  worstAgainst?: VersusRecord | null;
  bestWith?: VersusRecord | null;
  worstWith?: VersusRecord | null;
  withRecords: VersusRecord[];
}

async function getPlayer(id: string): Promise<Player> {
  const res = await apiFetch(`/v0/players/${encodeURIComponent(id)}`, {
    cache: "no-store",
  } as RequestInit);
  if (!res.ok) throw new Error("player");
  return (await res.json()) as Player;
}

async function getMatches(playerId: string): Promise<EnrichedMatch[]> {
  const r = await apiFetch(
    `/v0/matches?playerId=${encodeURIComponent(playerId)}`,
    {
      cache: "no-store",
    } as RequestInit
  );
  if (!r.ok) return [];
  // Only keep the most recent five matches
  const rows = ((await r.json()) as MatchRow[]).slice(0, 5);

  const details = await Promise.all(
    rows.map(async (m) => {
      const resp = await apiFetch(`/v0/matches/${encodeURIComponent(m.id)}`, {
        cache: "no-store",
      } as RequestInit);
      if (!resp.ok) throw new Error(`match ${m.id}`);
      return { row: m, detail: (await resp.json()) as MatchDetail };
    })
  );

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
      const ids = p.playerIds ?? [];
      names[p.side] = ids.map((id) => idToName.get(id) ?? id);
      if (ids.includes(playerId)) {
        playerSide = p.side;
      }
    }
    let playerWon: boolean | undefined = undefined;
    const summary = detail.summary;
    if (playerSide && summary) {
      const opp = playerSide === "A" ? "B" : "A";
      const sets = summary.sets;
      const games = summary.games;
      const points = summary.points;
      if (sets) {
        playerWon = sets[playerSide] > sets[opp];
      } else if (games) {
        playerWon = games[playerSide] > games[opp];
      } else if (points) {
        playerWon = points[playerSide] > points[opp];
      }
    }
    return {
      ...row,
      names,
      participants: detail.participants ?? [],
      summary,
      playerSide,
      playerWon,
    };
  });
}

async function getStats(playerId: string): Promise<PlayerStats | null> {
  const r = await apiFetch(`/v0/players/${encodeURIComponent(playerId)}/stats`, {
    cache: "no-store",
  } as RequestInit);
  if (!r.ok) return null;
  return (await r.json()) as PlayerStats;
}

function formatSummary(s?: MatchDetail["summary"]): string {
  if (!s) return "";
  if (s.sets) return `Sets ${s.sets.A}-${s.sets.B}`;
  if (s.games) return `Games ${s.games.A}-${s.games.B}`;
  if (s.points) return `Points ${s.points.A}-${s.points.B}`;
  return "";
}

function winnerFromSummary(
  s?: MatchDetail["summary"]
): "A" | "B" | null {
  if (!s) return null;
  const checks: (keyof NonNullable<typeof s>)[] = [
    "sets",
    "points",
    "games",
    // fallbacks for other summary shapes
    // @ts-expect-error dynamic
    "total",
    // @ts-expect-error dynamic
    "score",
  ];
    for (const key of checks) {
      const raw = (s as Record<string, unknown>)[key];
      if (
        raw &&
        typeof raw === "object" &&
        "A" in raw &&
        "B" in raw &&
        typeof (raw as { A: unknown }).A === "number" &&
        typeof (raw as { B: unknown }).B === "number"
      ) {
        const val = raw as { A: number; B: number };
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
    const [player, matches, stats] = await Promise.all([
      getPlayer(params.id),
      getMatches(params.id),
      getStats(params.id),
    ]);

    const view = searchParams?.view === "summary" ? "summary" : "timeline";
    const seasons = summariseSeasons(matches);
    const sortedMatches = [...matches].sort((a, b) => {
      const da = a.playedAt ? new Date(a.playedAt).getTime() : 0;
      const db = b.playedAt ? new Date(b.playedAt).getTime() : 0;
      return da - db;
    });

    const recentOpponents = matches
      .map((m) => {
        const part = m.participants.find((p) =>
          (p.playerIds ?? []).includes(player.id)
        );
        if (!part) return null;
        const mySide = part.side;
        const oppSide = mySide === "A" ? "B" : "A";
        const opponentName = m.names[oppSide].join(" & ");
        const winner = winnerFromSummary(m.summary);
        const result = winner ? (winner === mySide ? "Win" : "Loss") : "—";
        const date = m.playedAt
          ? new Date(m.playedAt).toLocaleDateString()
          : "—";
        return { id: m.id, opponentName, date, result };
      })
      .filter(Boolean) as {
      id: string;
      opponentName: string;
      date: string;
      result: string;
    }[];

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

        <h2 className="heading mt-4">Recent Opponents</h2>
        {recentOpponents.length ? (
          <ul>
            {recentOpponents.map((o) => (
              <li key={o.id} className="mb-2">
                <div>{o.opponentName}</div>
                <div className="text-sm text-gray-700">
                  {o.date} · {o.result}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No recent opponents found.</p>
        )}

        {stats?.withRecords?.length ? (
          <>
            <h2 className="heading mt-4">Teammate Records</h2>
            <ul>
              {stats.withRecords.map((r) => (
                <li key={r.playerId}>
                  {r.wins}-{r.losses} with {r.playerName || r.playerId}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <PlayerCharts matches={matches} />

        <PlayerComments playerId={player.id} />

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
