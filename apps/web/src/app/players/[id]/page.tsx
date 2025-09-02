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
    for (const p of detail.participants ?? []) {
      names[p.side] = (p.playerIds ?? []).map((id) => idToName.get(id) ?? id);
    }
    return { ...row, names, summary: detail.summary };
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

export default async function PlayerPage({
  params,
}: {
  params: { id: string };
}) {
  try {
    const [player, matches, stats] = await Promise.all([
      getPlayer(params.id),
      getMatches(params.id),
      getStats(params.id),
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
