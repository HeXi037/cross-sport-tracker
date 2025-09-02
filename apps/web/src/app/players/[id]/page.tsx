import React from "react";
import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import PlayerCharts from "./PlayerCharts";

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
  playerSide: "A" | "B" | null;
  playerWon?: boolean;
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
    return { ...row, names, summary, playerSide, playerWon };
  });
}

function formatSummary(s?: MatchDetail["summary"]): string {
  if (!s) return "";
  if (s.sets) return `Sets ${s.sets.A}-${s.sets.B}`;
  if (s.games) return `Games ${s.games.A}-${s.games.B}`;
  if (s.points) return `Points ${s.points.A}-${s.points.B}`;
  return "";
}

export default async function PlayerPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const [player, matches] = await Promise.all([
      getPlayer(params.id),
      getMatches(params.id),
    ]);

    return (
      <main className="container">
        <h1 className="heading">{player.name}</h1>
        {player.club_id && <p>Club: {player.club_id}</p>}

        <h2 className="heading mt-4">Recent Matches</h2>
        {matches.length ? (
          <ul>
            {matches.map((m) => (
              <li key={m.id} className="mb-2">
                <div>
                  <Link href={`/matches/${m.id}`}>
                    {m.names.A.join(" & ")} vs {m.names.B.join(" & ")}
                  </Link>
                </div>
                <div className="text-sm text-gray-700">
                  {formatSummary(m.summary)}
                  {m.summary ? " · " : ""}
                  {m.sport} · Best of {m.bestOf ?? "—"} ·{" "}
                  {m.playedAt ? new Date(m.playedAt).toLocaleDateString() : "—"}
                  {" · "}
                  {m.location ?? "—"}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No matches found.</p>
        )}

        <PlayerCharts matches={matches} />

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
