// apps/web/src/app/record/[sport]/page.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
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
    setDoubles(checked);
    if (!checked) {
      setIds((prev) => ({ ...prev, a2: "", b2: "" }));
    }
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
          score: entries.map((e) => Number(e.score)),
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
          <div className="players">
            {bowlingIds.map((id, idx) => (
              <div key={idx} className="bowling-player">
                <select
                  aria-label={`Player ${idx + 1}`}
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
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Score"
                  value={bowlingScores[idx]}
                  onChange={(e) => handleBowlingScoreChange(idx, e.target.value)}
                />
              </div>
            ))}
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
