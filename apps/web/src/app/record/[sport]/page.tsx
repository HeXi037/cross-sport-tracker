// apps/web/src/app/record/[sport]/page.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useLocale } from "../../../lib/LocaleContext";
import {
  summarizeBowlingInput,
  type BowlingSummaryResult,
} from "../../../lib/bowlingSummary";

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

const BOWLING_FRAME_COUNT = 10;
const MAX_BOWLING_PLAYERS = 6;

type BowlingFrames = string[][];

interface BowlingEntry {
  playerId: string;
  frames: BowlingFrames;
}

function createEmptyBowlingFrames(): BowlingFrames {
  return Array.from({ length: BOWLING_FRAME_COUNT }, (_, idx) =>
    idx === BOWLING_FRAME_COUNT - 1 ? ["", "", ""] : ["", ""]
  );
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
    { playerId: "", frames: createEmptyBowlingFrames() },
  ]);
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [doubles, setDoubles] = useState(isPadel);
  const [submitting, setSubmitting] = useState(false);
  const locale = useLocale();

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

  const handleBowlingPlayerChange = (index: number, value: string) => {
    setBowlingEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, playerId: value } : entry
      )
    );
  };

  const handleBowlingRollChange = (
    entryIndex: number,
    frameIndex: number,
    rollIndex: number,
    value: string
  ) => {
    setBowlingEntries((prev) =>
      prev.map((entry, idx) => {
        if (idx !== entryIndex) return entry;
        const frames = entry.frames.map((frame, fIdx) => {
          if (fIdx !== frameIndex) return frame;
          const updated = frame.slice();
          updated[rollIndex] = value;
          return updated;
        });
        return { ...entry, frames };
      })
    );
  };

  const handleAddBowlingPlayer = () => {
    setBowlingEntries((prev) =>
      prev.concat({ playerId: "", frames: createEmptyBowlingFrames() })
    );
  };

  const handleRemoveBowlingPlayer = (index: number) => {
    setBowlingEntries((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== index) : prev
    );
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
    let bowlingData: { id: string; frames: BowlingFrames; index: number }[] = [];
    let bowlingTotals: number[] = [];
    let bowlingDetails: Record<string, unknown> | null = null;

    if (isBowling) {
      bowlingData = bowlingEntries
        .map((entry, idx) => ({ id: entry.playerId, frames: entry.frames, index: idx }))
        .filter((entry) => entry.id);
      if (!bowlingData.length) {
        setError("Please select at least one player.");
        return;
      }
      if (new Set(bowlingData.map((entry) => entry.id)).size !== bowlingData.length) {
        setError("Please select unique players.");
        return;
      }
      const normalized: {
        id: string;
        side: string;
        summary: BowlingSummaryResult;
        playerName?: string;
      }[] = [];
      for (let i = 0; i < bowlingData.length; i += 1) {
        const entry = bowlingData[i];
        const player = players.find((p) => p.id === entry.id);
        const label = player?.name?.trim()
          ? player.name
          : `Player ${entry.index + 1}`;
        try {
          const summary = summarizeBowlingInput(entry.frames, {
            playerLabel: label,
          });
          normalized.push({
            id: entry.id,
            side: String.fromCharCode(65 + i),
            summary,
            playerName: player?.name,
          });
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : "Please review bowling frames and try again.";
          setError(message);
          return;
        }
      }
      participants = normalized.map((entry) => ({
        side: entry.side,
        playerIds: [entry.id],
      }));
      bowlingTotals = normalized.map((entry) => entry.summary.total);
      bowlingDetails = {
        config: { frames: BOWLING_FRAME_COUNT, tenthFrameBonus: true },
        players: normalized.map((entry) => ({
          side: entry.side,
          playerId: entry.id,
          playerName: entry.playerName,
          frames: entry.summary.frames,
          scores: entry.summary.frameScores,
          total: entry.summary.total,
        })),
      };
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
        const payload = {
          sport,
          participants,
          score: bowlingTotals,
          ...(bowlingDetails ? { details: bowlingDetails } : {}),
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
      <form onSubmit={handleSubmit} className="form-stack">
        {isPickleball && (
          <label
            className="form-field form-field--checkbox"
            htmlFor="record-doubles"
          >
            <input
              id="record-doubles"
              type="checkbox"
              checked={doubles}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            Doubles
          </label>
        )}

        <fieldset className="form-fieldset">
          <legend className="form-legend">Match details</legend>
          <div className="form-grid form-grid--two">
            <label className="form-field" htmlFor="record-date">
              <span className="form-label">Date</span>
              <input
                id="record-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                lang={locale}
              />
            </label>
            <label className="form-field" htmlFor="record-time">
              <span className="form-label">Start time</span>
              <input
                id="record-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                lang={locale}
              />
            </label>
          </div>
          <label className="form-field" htmlFor="record-location">
            <span className="form-label">Location</span>
            <input
              id="record-location"
              type="text"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        </fieldset>

        {isBowling ? (
          <fieldset className="form-fieldset">
            <legend className="form-legend">Players and scores</legend>
            <p className="form-hint">
              Enter each roll per frame (use 0 for gutter balls). Leave roll 2
              empty after a strike and roll 3 blank unless you earn it in the
              final frame.
            </p>
            <div className="form-stack">
              {bowlingEntries.map((entry, idx) => {
                const player = players.find((p) => p.id === entry.playerId);
                const playerLabel = player?.name?.trim()
                  ? player.name
                  : `Player ${idx + 1}`;
                let previewTotal: number | null = null;
                try {
                  const summary = summarizeBowlingInput(entry.frames, {
                    playerLabel,
                  });
                  previewTotal = summary.total;
                } catch {
                  previewTotal = null;
                }
                return (
                  <section key={idx} className="bowling-entry">
                    <div className="bowling-entry-header">
                      <label
                        className="form-field"
                        htmlFor={`bowling-player-${idx}`}
                      >
                        <span className="form-label">Player {idx + 1}</span>
                        <select
                          id={`bowling-player-${idx}`}
                          value={entry.playerId}
                          onChange={(e) =>
                            handleBowlingPlayerChange(idx, e.target.value)
                          }
                        >
                          <option value="">Select player</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="bowling-entry-meta">
                        <span className="bowling-total-preview">
                          Total: {previewTotal != null ? previewTotal : "—"}
                        </span>
                        {bowlingEntries.length > 1 && (
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => handleRemoveBowlingPlayer(idx)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="bowling-frames-grid">
                      {entry.frames.map((frame, frameIdx) => (
                        <div key={frameIdx} className="bowling-frame-card">
                          <span className="bowling-frame-label">
                            Frame {frameIdx + 1}
                          </span>
                          <div
                            className={`bowling-rolls bowling-rolls--${frame.length}`}
                          >
                            {frame.map((roll, rollIdx) => {
                              const inputId = `bowling-${idx}-${frameIdx}-${rollIdx}`;
                              return (
                                <div key={rollIdx} className="bowling-roll-field">
                                  <label
                                    className="bowling-roll-label"
                                    htmlFor={inputId}
                                  >
                                    R{rollIdx + 1}
                                  </label>
                                  <input
                                    id={inputId}
                                    type="number"
                                    min={0}
                                    max={10}
                                    step={1}
                                    value={roll}
                                    inputMode="numeric"
                                    onChange={(e) =>
                                      handleBowlingRollChange(
                                        idx,
                                        frameIdx,
                                        rollIdx,
                                        e.target.value
                                      )
                                    }
                                    aria-label={`${playerLabel} frame ${
                                      frameIdx + 1
                                    } roll ${rollIdx + 1}`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
            {bowlingEntries.length < MAX_BOWLING_PLAYERS && (
              <button
                type="button"
                className="button-secondary"
                onClick={handleAddBowlingPlayer}
              >
                Add player
              </button>
            )}
          </fieldset>
        ) : (
          <>
            <fieldset className="form-fieldset">
              <legend className="form-legend">Players</legend>
              <div className="form-grid form-grid--two">
                <label className="form-field" htmlFor="record-player-a1">
                  <span className="form-label">Team A player 1</span>
                  <select
                    id="record-player-a1"
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
                </label>
                {doubles && (
                  <label className="form-field" htmlFor="record-player-a2">
                    <span className="form-label">Team A player 2</span>
                    <select
                      id="record-player-a2"
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
                  </label>
                )}
                <label className="form-field" htmlFor="record-player-b1">
                  <span className="form-label">Team B player 1</span>
                  <select
                    id="record-player-b1"
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
                </label>
                {doubles && (
                  <label className="form-field" htmlFor="record-player-b2">
                    <span className="form-label">Team B player 2</span>
                    <select
                      id="record-player-b2"
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
                  </label>
                )}
              </div>
            </fieldset>

            <fieldset className="form-fieldset">
              <legend className="form-legend">Match score</legend>
              <div className="form-grid form-grid--two">
                <label className="form-field" htmlFor="record-score-a">
                  <span className="form-label">Team A score</span>
                  <input
                    id="record-score-a"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="A"
                    value={scoreA}
                    onChange={(e) => setScoreA(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label className="form-field" htmlFor="record-score-b">
                  <span className="form-label">Team B score</span>
                  <input
                    id="record-score-b"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="B"
                    value={scoreB}
                    onChange={(e) => setScoreB(e.target.value)}
                    inputMode="numeric"
                  />
                </label>
              </div>
            </fieldset>
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
