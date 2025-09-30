"use client";

import type { StageScheduleMatch } from "../../lib/api";
import type { PlayerInfo } from "../../components/PlayerName";

export type PlayerLookup =
  | Map<string, PlayerInfo>
  | Record<string, PlayerInfo | undefined>;

function getPlayerName(lookup: PlayerLookup, id: string): string {
  if (lookup instanceof Map) {
    const entry = lookup.get(id);
    if (entry) return entry.name;
  } else if (Object.prototype.hasOwnProperty.call(lookup, id)) {
    const entry = lookup[id];
    if (entry) return entry.name;
  }
  return "Unknown player";
}

interface StageScheduleTableProps {
  matches: StageScheduleMatch[];
  playerLookup: PlayerLookup;
  title?: string;
  emptyLabel?: string;
  error?: string;
}

export default function StageScheduleTable({
  matches,
  playerLookup,
  title = "Stage schedule",
  emptyLabel = "No matches have been scheduled yet.",
  error,
}: StageScheduleTableProps) {
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

  if (!matches.length) {
    return (
      <p className="form-hint" role="status">
        {emptyLabel}
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
              <th scope="col">Match</th>
              <th scope="col">Side A</th>
              <th scope="col">Side B</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, index) => {
              const participants = match.participants
                .slice()
                .sort((a, b) => a.side.localeCompare(b.side));
              const sideA = participants.find((p) => p.side === "A");
              const sideB = participants.find((p) => p.side === "B");
              const sideAPlayers = sideA
                ? sideA.playerIds.map((id) => getPlayerName(playerLookup, id)).join(", ")
                : "TBD";
              const sideBPlayers = sideB
                ? sideB.playerIds.map((id) => getPlayerName(playerLookup, id)).join(", ")
                : "TBD";
              return (
                <tr key={match.id}>
                  <th scope="row">
                    Match {index + 1}
                    {match.rulesetId && (
                      <div className="form-hint">Ruleset: {match.rulesetId}</div>
                    )}
                  </th>
                  <td>{sideAPlayers}</td>
                  <td>{sideBPlayers}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

