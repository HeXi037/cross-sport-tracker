"use client";

import type { StageStanding } from "../../lib/api";
import type { PlayerLookup } from "./stage-schedule";

function resolvePlayerName(lookup: PlayerLookup, id: string): string {
  if (lookup instanceof Map) {
    const entry = lookup.get(id);
    if (entry) return entry.name;
  } else if (Object.prototype.hasOwnProperty.call(lookup, id)) {
    const entry = lookup[id];
    if (entry) return entry?.name ?? "Unknown player";
  }
  return "Unknown player";
}

interface StageStandingsProps {
  standings: StageStanding[];
  playerLookup: PlayerLookup;
  title?: string;
  error?: string;
}

export default function StageStandings({
  standings,
  playerLookup,
  title = "Stage standings",
  error,
}: StageStandingsProps) {
  if (error) {
    return (
      <section className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{title}</h3>
        <p className="error" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!standings.length) {
    return (
      <p className="form-hint" role="status">
        Standings will appear after matches have been recorded.
      </p>
    );
  }

  return (
    <section className="card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{title}</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="scoreboard-table" aria-label={title}>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Matches</th>
              <th scope="col">Wins</th>
              <th scope="col">Losses</th>
              <th scope="col">Draws</th>
              <th scope="col">Points</th>
              <th scope="col">Points diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.playerId}>
                <th scope="row">{resolvePlayerName(playerLookup, row.playerId)}</th>
                <td>{row.matchesPlayed}</td>
                <td>{row.wins}</td>
                <td>{row.losses}</td>
                <td>{row.draws}</td>
                <td>{row.points}</td>
                <td>{row.pointsDiff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

