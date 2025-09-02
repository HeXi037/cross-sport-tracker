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
  participants: Participant[];
  summary?: MatchDetail["summary"];
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
  // Only keep the most recent five matches
  const rows = ((await r.json()) as MatchRow[]).slice(0, 5);

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
    return {
      ...row,
      names,
      participants: detail.participants ?? [],
      summary: detail.summary,
    };
  });
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
    const val: any = (s as any)[key];
    if (val && typeof val.A === "number" && typeof val.B === "number") {
      if (val.A > val.B) return "A";
      if (val.B > val.A) return "B";
    }
  }
  return null;
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

    const recentOpponents = matches
      .map((m) => {
        const part = m.participants.find((p) =>
          p.playerIds.includes(player.id)
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
