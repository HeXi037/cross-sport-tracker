// apps/web/src/app/record/[sport]/page.tsx
"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

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

  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState<IdMap>({ a1: "", a2: "", b1: "", b2: "" });
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  // Padal is always doubles. Other sports default to singles unless specified.
  const [doubles, setDoubles] = useState(isPadel);

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await fetch(`${base}/v0/players`);
        if (res.ok) {
          const data = (await res.json()) as { players: Player[] };
          setPlayers(data.players || []);
        }
      } catch {
        // ignore errors for this simple example
      }
    }
    loadPlayers();
  }, []);

  const handleIdChange = (key: keyof IdMap, value: string) => {
    setIds((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggle = (checked: boolean) => {
    setDoubles(checked);
    if (!checked) {
      // Clear partner ids when switching to singles
      setIds((prev) => ({ ...prev, a2: "", b2: "" }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const idValues = doubles
      ? [ids.a1, ids.a2, ids.b1, ids.b2]
      : [ids.a1, ids.b1];

    const filtered = idValues.filter((v) => v);
    if (new Set(filtered).size !== filtered.length) {
      setError("Please select unique players.");
      return;
    }

    const participants = doubles
      ? [
          { side: "A", playerIds: [ids.a1].concat(ids.a2 ? [ids.a2] : []) },
          { side: "B", playerIds: [ids.b1].concat(ids.b2 ? [ids.b2] : []) },
        ]
      : [
          { side: "A", playerIds: [ids.a1] },
          { side: "B", playerIds: [ids.b1] },
        ];

    try {
      interface MatchParticipant {
        side: "A" | "B";
        playerIds: string[];
      }
      interface MatchPayload {
        sport: string;
        participants: MatchParticipant[];
        score: [string, string];
        playedAt?: string;
      }
      const payload: MatchPayload = {
        sport,
        participants,
        score: [scoreA, scoreB],
      };
      if (date) {
        payload.playedAt = new Date(
          `${date}T${time || "00:00"}`
        ).toISOString();
      }
      const res = await fetch(`${base}/v0/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push(`/matches`);
      }
    } catch {
      // ignore network errors in this simplified component
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
            placeholder="A"
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
          />
          <input
            placeholder="B"
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <button type="submit">Save</button>
      </form>
    </main>
  );
}

