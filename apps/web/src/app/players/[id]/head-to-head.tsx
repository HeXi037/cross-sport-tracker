import React from "react";
import type { EnrichedMatch, MatchSummary } from "./types";

function winner(summary?: MatchSummary): string | null {
  if (!summary) return null;
  const checks: (keyof NonNullable<MatchSummary>)[] = [
    "sets",
    "games",
    "points",
  ];
  for (const key of checks) {
    const scores = summary[key];
    if (scores) {
      const entries = Object.entries(scores);
      let maxSide: string | null = null;
      let maxVal = -Infinity;
      let tie = false;
      for (const [side, val] of entries) {
        if (val > maxVal) {
          maxVal = val;
          maxSide = side;
          tie = false;
        } else if (val === maxVal) {
          tie = true;
        }
      }
      if (!tie && maxSide !== null) return maxSide;
    }
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
    const myEntry = Object.entries(m.playerIds).find(([, ids]) =>
      ids.includes(playerId)
    );
    if (!myEntry) continue;
    const mySide = myEntry[0];
    const winSide = winner(m.summary);
    if (!winSide) continue;
    const playerWon = winSide === mySide;
    for (const [side, ids] of Object.entries(m.playerIds)) {
      if (side === mySide) continue;
      ids.forEach((oppId, idx) => {
        const oppName = m.names[side][idx] ?? oppId;
        const rec = map.get(oppId) || { name: oppName, wins: 0, losses: 0 };
        if (playerWon) rec.wins += 1; else rec.losses += 1;
        rec.name = oppName;
        map.set(oppId, rec);
      });
    }
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
