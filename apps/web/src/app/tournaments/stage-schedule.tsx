"use client";

import type {
  StageScheduleMatch,
  StageScheduleParticipant,
} from "../../lib/api";
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

  const uniqueSides = Array.from(
    new Set(
      matches.flatMap((match) =>
        match.participants
          .map((participant) => participant.side)
          .filter(
            (
              side
            ): side is StageScheduleParticipant["side"] =>
              typeof side === "string" && side.length > 0
          )
      )
    )
  ) as StageScheduleParticipant["side"][];

  const sides = uniqueSides.sort((a, b) => a.localeCompare(b));

  const defaultSides: StageScheduleParticipant["side"][] = ["A", "B"];
  const resolvedSides = sides.length > 0 ? sides : defaultSides;

  return (
    <section className="card" style={{ padding: 16 }}>
      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{title}</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="scoreboard-table" aria-label={title}>
          <thead>
            <tr>
              <th scope="col">Match</th>
              {resolvedSides.map((side) => (
                <th key={side} scope="col">
                  Side {side}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matches.map((match, index) => {
              const participantsBySide = new Map(
                match.participants.map((participant) => [participant.side, participant] as const)
              );
              return (
                <tr key={match.id}>
                  <th scope="row">
                    Match {index + 1}
                    {match.rulesetId && (
                      <div className="form-hint">Ruleset: {match.rulesetId}</div>
                    )}
                    {typeof match.bestOf === "number" && match.bestOf > 0 && (
                      <div className="form-hint">Best of {match.bestOf}</div>
                    )}
                  </th>
                  {resolvedSides.map((side) => {
                    const participant = participantsBySide.get(side);
                    const players = participant?.playerIds ?? [];
                    const names = players
                      .map((id) => getPlayerName(playerLookup, id))
                      .filter((name) => name.trim().length > 0)
                      .join(", ");
                    return <td key={side}>{names || "TBD"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
