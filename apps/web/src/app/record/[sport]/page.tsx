// apps/web/src/app/record/[sport]/page.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";
import { useLocale } from "../../../lib/LocaleContext";

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

export default function RecordSportPage() {
  const router = useRouter();
  const params = useParams();
  const sport = typeof params.sport === "string" ? params.sport : "";
  const isPadel = sport === "padel";
  const isPickleball = sport === "pickleball";
  const isBowling = sport === "bowling";

  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState<IdMap>({ a1: "", a2: "", b1: "", b2: "" });
  const [bowlingIds, setBowlingIds] = useState<string[]>([""]);
  const [bowlingScores, setBowlingScores] = useState<string[]>(["0"]);
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

  const handleBowlingIdChange = (index: number, value: string) => {
    setBowlingIds((prev) => prev.map((id, i) => (i === index ? value : id)));
  };

  const handleBowlingScoreChange = (index: number, value: string) => {
    setBowlingScores((prev) => prev.map((s, i) => (i === index ? value : s)));
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
      entries = bowlingIds
        .map((id, idx) => ({ id, score: bowlingScores[idx] }))
        .filter((e) => e.id);
      if (!entries.length) {
        setError("Please select at least one player.");
        return;
      }
      if (new Set(entries.map((e) => e.id)).size !== entries.length) {
        setError("Please select unique players.");
        return;
      }
      if (entries.some((e) => e.score === "")) {
        setError("Please enter scores for all players.");
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
            <div className="form-stack">
              {bowlingIds.map((id, idx) => (
                <div key={idx} className="form-grid form-grid--two bowling-player">
                  <label className="form-field" htmlFor={`bowling-player-${idx}`}>
                    <span className="form-label">Player {idx + 1}</span>
                    <select
                      id={`bowling-player-${idx}`}
                      value={id}
                      onChange={(e) => handleBowlingIdChange(idx, e.target.value)}
                    >
                      <option value="">Select player</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field" htmlFor={`bowling-score-${idx}`}>
                    <span className="form-label">Score</span>
                    <input
                      id={`bowling-score-${idx}`}
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Score"
                      value={bowlingScores[idx]}
                      onChange={(e) => handleBowlingScoreChange(idx, e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                </div>
              ))}
            </div>
            {bowlingIds.length < 6 && (
              <button
                type="button"
                onClick={() => {
                  setBowlingIds((prev) => prev.concat(""));
                  setBowlingScores((prev) => prev.concat("0"));
                }}
              >
                Add Player
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
