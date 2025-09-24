// apps/web/src/app/record/[sport]/page.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

interface IdMap {
  a1: string;
  a2: string;
  b1: string;
  b2: string;
}

type BowlingEntry = {
  id: string;
  frames: string[][];
};

const MAX_BOWLING_PLAYERS = 6;
const TOTAL_BOWLING_FRAMES = 10;
const FINAL_FRAME_INDEX = TOTAL_BOWLING_FRAMES - 1;

function createEmptyBowlingFrames(): string[][] {
  return Array.from({ length: TOTAL_BOWLING_FRAMES }, (_, idx) =>
    idx === FINAL_FRAME_INDEX ? ["", "", ""] : ["", ""]
  );
}

function parseRoll(
  value: string | undefined,
  label: string,
  frameNumber: number,
  rollNumber: number
): number {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") {
    throw new Error(
      `${label}: enter roll ${rollNumber} for frame ${frameNumber}.`
    );
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) {
    throw new Error(
      `${label}: roll ${rollNumber} in frame ${frameNumber} must be a whole number.`
    );
  }
  if (parsed < 0 || parsed > 10) {
    throw new Error(
      `${label}: roll ${rollNumber} in frame ${frameNumber} must be between 0 and 10.`
    );
  }
  return parsed;
}

function scoreBowlingFrames(frames: number[][]): number {
  const normalized = frames.map((frame, idx) => {
    if (idx < FINAL_FRAME_INDEX) {
      if (frame[0] === 10) return [10];
      return [frame[0] ?? 0, frame[1] ?? 0];
    }
    return [frame[0] ?? 0, frame[1] ?? 0, frame[2] ?? 0];
  });

  let total = 0;
  for (let i = 0; i < TOTAL_BOWLING_FRAMES; i += 1) {
    const frame = normalized[i] ?? [];
    if (i < FINAL_FRAME_INDEX) {
      if (frame[0] === 10) {
        const bonus: number[] = [];
        for (let j = i + 1; j < normalized.length; j += 1) {
          bonus.push(...normalized[j]);
          if (bonus.length >= 2) break;
        }
        const [b1 = 0, b2 = 0] = bonus;
        total += 10 + b1 + b2;
        continue;
      }
      const first = frame[0] ?? 0;
      const second = frame[1] ?? 0;
      if (first + second === 10) {
        const next = normalized[i + 1];
        const bonus = next ? next[0] ?? 0 : 0;
        total += 10 + bonus;
      } else {
        total += first + second;
      }
      continue;
    }

    const first = frame[0] ?? 0;
    const second = frame[1] ?? 0;
    const third = frame[2] ?? 0;
    if (first === 10) {
      total += 10 + second + third;
    } else if (first + second === 10) {
      total += 10 + third;
    } else {
      total += first + second;
    }
  }

  return total;
}

function parseBowlingFrames(frames: string[][], label: string): number {
  const normalized: number[][] = [];

  for (let frameIdx = 0; frameIdx < TOTAL_BOWLING_FRAMES; frameIdx += 1) {
    const frame = frames[frameIdx] ?? [];
    const frameNumber = frameIdx + 1;
    const first = parseRoll(frame[0], label, frameNumber, 1);

    if (frameIdx < FINAL_FRAME_INDEX) {
      if (first === 10) {
        const secondRaw = (frame[1] ?? "").trim();
        if (secondRaw) {
          const second = parseRoll(frame[1], label, frameNumber, 2);
          if (second !== 0) {
            throw new Error(
              `${label}: frame ${frameNumber} ends after a strike; leave roll 2 blank or set it to 0.`
            );
          }
        }
        normalized.push([10]);
        continue;
      }

      const second = parseRoll(frame[1], label, frameNumber, 2);
      if (first + second > 10) {
        throw new Error(
          `${label}: frame ${frameNumber} cannot exceed 10 pins.`
        );
      }
      normalized.push([first, second]);
      continue;
    }

    const second = parseRoll(frame[1], label, frameNumber, 2);
    if (first < 10 && first + second > 10) {
      throw new Error(
        `${label}: frame ${frameNumber} cannot exceed 10 pins before the bonus roll.`
      );
    }
    const needsThird = first === 10 || first + second === 10;
    const thirdRaw = (frame[2] ?? "").trim();
    if (needsThird) {
      if (!thirdRaw) {
        throw new Error(
          `${label}: frame ${frameNumber} requires a third roll after a strike or spare.`
        );
      }
      const third = parseRoll(frame[2], label, frameNumber, 3);
      normalized.push([first, second, third]);
    } else {
      if (thirdRaw) {
        const third = parseRoll(frame[2], label, frameNumber, 3);
        if (third !== 0) {
          throw new Error(
            `${label}: frame ${frameNumber} does not allow a third roll unless you record a strike or spare.`
          );
        }
      }
      normalized.push([first, second]);
    }
  }

  return scoreBowlingFrames(normalized);
}

export default function RecordSportPage() {
  const router = useRouter();
  const params = useParams();
  const sport = typeof params.sport === "string" ? params.sport : "";
  const isPadel = sport === "padel";
  const isPickleball = sport === "pickleball";
  const isBowling = sport === "bowling";

  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState<IdMap>({ a1: "", a2: "", b1: "", b2: "" });
  const [bowlingEntries, setBowlingEntries] = useState<BowlingEntry[]>([
    { id: "", frames: createEmptyBowlingFrames() },
  ]);
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [doubles, setDoubles] = useState(isPadel);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await fetch(`${base}/v0/players`);
        if (res.ok) {
          const data = (await res.json()) as { players: Player[] };
          setPlayers(data.players || []);
        }
      } catch {
        // ignore errors
      }
    }
    loadPlayers();
  }, []);

  const handleIdChange = (key: keyof IdMap, value: string) => {
    setIds((prev) => ({ ...prev, [key]: value }));
  };

  const handleBowlingIdChange = (index: number, value: string) => {
    setBowlingEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, id: value } : entry))
    );
  };

  const handleBowlingFrameChange = (
    playerIndex: number,
    frameIndex: number,
    rollIndex: number,
    value: string
  ) => {
    setBowlingEntries((prev) =>
      prev.map((entry, idx) => {
        if (idx !== playerIndex) return entry;
        const frames = entry.frames.map((frame, fIdx) => {
          if (fIdx !== frameIndex) return frame;
          return frame.map((roll, rIdx) => (rIdx === rollIndex ? value : roll));
        });
        return { ...entry, frames };
      })
    );
  };

  const removeBowlingEntry = (index: number) => {
    setBowlingEntries((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      return next.length ? next : [{ id: "", frames: createEmptyBowlingFrames() }];
    });
  };

  const handleToggle = (checked: boolean) => {
    flushSync(() => {
      setDoubles(checked);
      if (!checked) {
        setIds((prev) => ({ ...prev, a2: "", b2: "" }));
      }
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (submitting) return;

    interface MatchParticipant {
      side: string;
      playerIds: string[];
    }

    let participants: MatchParticipant[] = [];
    let entries: { id: string; score: string }[] = [];

    if (isBowling) {
      entries = bowlingEntries.filter((entry) => entry.id);
      if (!entries.length) {
        setError("Please select at least one player.");
        return;
      }
      if (new Set(entries.map((e) => e.id)).size !== entries.length) {
        setError("Please select unique players.");
        return;
      }
      try {
        const totals = entries.map((entry, idx) => {
          const name =
            players.find((p) => p.id === entry.id)?.name || `Player ${idx + 1}`;
          const total = parseBowlingFrames(entry.frames, name);
          return { id: entry.id, total };
        });
        entries = totals.map((entry) => ({
          id: entry.id,
          score: String(entry.total),
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Please verify frame scores.";
        setError(message);
        return;
      }
      participants = entries.map((e, idx) => ({
        side: String.fromCharCode(65 + idx),
        playerIds: [e.id],
      }));
    } else {
      const idValues = doubles
        ? [ids.a1, ids.a2, ids.b1, ids.b2]
        : [ids.a1, ids.b1];
      const filtered = idValues.filter((v) => v);
      if (new Set(filtered).size !== filtered.length) {
        setError("Please select unique players.");
        return;
      }
      participants = doubles
        ? [
            { side: "A", playerIds: [ids.a1].concat(ids.a2 ? [ids.a2] : []) },
            { side: "B", playerIds: [ids.b1].concat(ids.b2 ? [ids.b2] : []) },
          ]
        : [
            { side: "A", playerIds: [ids.a1] },
            { side: "B", playerIds: [ids.b1] },
          ];
    }

    try {
      setSubmitting(true);
      const playedAt = date
        ? (time ? new Date(`${date}T${time}`).toISOString() : `${date}T00:00:00`)
        : undefined;

      if (isBowling) {
        // keep bowling IDs flow
        const payload = {
          sport,
          participants,
          sets: entries.map((e) => [Number(e.score)]),
          ...(playedAt ? { playedAt } : {}),
          ...(location ? { location } : {}),
        };
        await apiFetch(`/v0/matches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        router.push(`/matches`);
        return;
      }

      // racket sports: switch to by-name
      const byId = new Map(players.map((p) => [p.id, p.name]));
      const teamA = [ids.a1, ids.a2].filter(Boolean).map((id) => byId.get(id) || "");
      const teamB = [ids.b1, ids.b2].filter(Boolean).map((id) => byId.get(id) || "");

      if (!teamA.length || !teamB.length) {
        setError("Please select players for both sides.");
        return;
      }

      const A = Number(scoreA);
      const B = Number(scoreB);
      const sets: [number, number][] =
        Number.isFinite(A) && Number.isFinite(B) ? [[A, B]] : [];

      const payload = {
        sport,
        createMissing: true,
        teamA,
        teamB,
        sets,
        ...(playedAt ? { playedAt } : {}),
        ...(location ? { location } : {}),
      };

      await apiFetch(`/v0/matches/by-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.push(`/matches`);
    } catch (err) {
      console.error(err);
      setError("Failed to save. Please review players/scores and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container">
      <form onSubmit={handleSubmit}>
        {isPickleball && (
          <label>
            <input
              type="checkbox"
              checked={doubles}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            Doubles
          </label>
        )}

        <div className="datetime">
          <input
            type="date"
            aria-label="Date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <input
            type="time"
            aria-label="Time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>

        <input
          type="text"
          aria-label="Location"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        {isBowling ? (
          <div className="bowling-players">
            {bowlingEntries.map((entry, playerIdx) => (
              <div key={playerIdx} className="bowling-player">
                <div className="bowling-player-header">
                  <select
                    aria-label={`Player ${playerIdx + 1}`}
                    value={entry.id}
                    onChange={(e) => handleBowlingIdChange(playerIdx, e.target.value)}
                  >
                    <option value="">Select player</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {bowlingEntries.length > 1 && (
                    <button
                      type="button"
                      className="bowling-remove"
                      onClick={() => removeBowlingEntry(playerIdx)}
                      aria-label={`Remove player ${playerIdx + 1}`}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="bowling-frames">
                  {entry.frames.map((frame, frameIdx) => (
                    <div key={frameIdx} className="bowling-frame">
                      <span className="bowling-frame-number">
                        Frame {frameIdx + 1}
                      </span>
                      <div className="bowling-frame-rolls">
                        {frame.map((roll, rollIdx) => (
                          <input
                            key={rollIdx}
                            type="number"
                            min="0"
                            max="10"
                            step="1"
                            inputMode="numeric"
                            placeholder={`R${rollIdx + 1}`}
                            aria-label={`Player ${playerIdx + 1} frame ${frameIdx + 1} roll ${rollIdx + 1}`}
                            value={roll}
                            onChange={(e) =>
                              handleBowlingFrameChange(
                                playerIdx,
                                frameIdx,
                                rollIdx,
                                e.target.value
                              )
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {bowlingEntries.length < MAX_BOWLING_PLAYERS && (
              <button
                type="button"
                className="bowling-add"
                onClick={() =>
                  setBowlingEntries((prev) =>
                    prev.concat({ id: "", frames: createEmptyBowlingFrames() })
                  )
                }
              >
                Add Player
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="players">
              <select
                aria-label="Player A1"
                value={ids.a1}
                onChange={(e) => handleIdChange("a1", e.target.value)}
              >
                <option value="">Select player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {doubles && (
                <select
                  aria-label="Player A2"
                  value={ids.a2}
                  onChange={(e) => handleIdChange("a2", e.target.value)}
                >
                  <option value="">Select player</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Player B1"
                value={ids.b1}
                onChange={(e) => handleIdChange("b1", e.target.value)}
              >
                <option value="">Select player</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {doubles && (
                <select
                  aria-label="Player B2"
                  value={ids.b2}
                  onChange={(e) => handleIdChange("b2", e.target.value)}
                >
                  <option value="">Select player</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="score">
              <input
                type="number"
                min="0"
                step="1"
                placeholder="A"
                value={scoreA}
                onChange={(e) => setScoreA(e.target.value)}
              />
              <input
                type="number"
                min="0"
                step="1"
                placeholder="B"
                value={scoreB}
                onChange={(e) => setScoreB(e.target.value)}
              />
            </div>
          </>
        )}

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Save"}
        </button>
      </form>
    </main>
  );
}
