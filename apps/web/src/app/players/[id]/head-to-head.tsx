import React from "react";
import type { EnrichedMatch, MatchSummary } from "./types";

function winner(summary?: MatchSummary): "A" | "B" | null {
  if (!summary) return null;
  if (summary.sets) {
    if (summary.sets.A > summary.sets.B) return "A";
    if (summary.sets.B > summary.sets.A) return "B";
  }
  if (summary.games) {
    if (summary.games.A > summary.games.B) return "A";
    if (summary.games.B > summary.games.A) return "B";
  }
  if (summary.points) {
    if (summary.points.A > summary.points.B) return "A";
    if (summary.points.B > summary.points.A) return "B";
  }
  return null;
}

export type HeadToHeadRecord = {
  opponentId: string;
  opponentName: string;
  wins: number;
  losses: number;
  encounters: number;
  winRate: number;
};

export function computeHeadToHead(
  playerId: string,
  matches: EnrichedMatch[],
): HeadToHeadRecord[] {
  const map = new Map<string, { name: string; wins: number; losses: number }>();

  for (const m of matches) {
    const side = m.playerIds.A.includes(playerId)
      ? "A"
      : m.playerIds.B.includes(playerId)
        ? "B"
        : null;
    if (!side) continue;
    const oppSide = side === "A" ? "B" : "A";
    const winSide = winner(m.summary);
    if (!winSide) continue;
    const playerWon = winSide === side;
    m.playerIds[oppSide].forEach((oppId, idx) => {
      const oppName = m.names[oppSide][idx] ?? oppId;
      const rec = map.get(oppId) || { name: oppName, wins: 0, losses: 0 };
      if (playerWon) rec.wins += 1; else rec.losses += 1;
      rec.name = oppName;
      map.set(oppId, rec);
    });
  }

  return Array.from(map.entries())
    .map(([opponentId, { name, wins, losses }]) => {
      const encounters = wins + losses;
      const winRate = encounters ? wins / encounters : 0;
      return { opponentId, opponentName: name, wins, losses, encounters, winRate };
    })
    .sort((a, b) => b.encounters - a.encounters);
}

export default function HeadToHead({
  playerId,
  matches,
}: {
  playerId: string;
  matches: EnrichedMatch[];
}) {
  const records = computeHeadToHead(playerId, matches);
  if (!records.length) return null;
  return (
    <div className="mt-4">
      <h2 className="heading">Head-to-Head Records</h2>
      <table className="mt-2">
        <thead>
          <tr>
            <th className="text-left">Opponent</th>
            <th className="text-left">Record</th>
            <th className="text-left">Win Rate</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.opponentId}>
              <td>{r.opponentName}</td>
              <td>
                {r.wins}-{r.losses}
              </td>
              <td>{Math.round(r.winRate * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
