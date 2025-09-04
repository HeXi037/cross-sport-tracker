"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

interface Player {
  id: string;
  name: string;
}

interface IdMap {
  a1: string;
  a2: string;
  b1: string;
  b2: string;
}

interface SetScore {
  A: string;
  B: string;
}

interface CreateMatchPayload {
  sport: string;
  participants: { side: string; playerIds: string[] }[];
  bestOf: number;
  playedAt?: string;
  location?: string;
}

export default function RecordPadelPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState<IdMap>({ a1: "", a2: "", b1: "", b2: "" });
  const [bestOf, setBestOf] = useState("3");
  const [sets, setSets] = useState<SetScore[]>([{ A: "", B: "" }]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);

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

  const handleSetChange = (idx: number, side: keyof SetScore, value: string) => {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [side]: value };
      return next;
    });
  };

  const addSet = () => {
    setSets((prev) => [...prev, { A: "", B: "" }]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const idValues = [ids.a1, ids.a2, ids.b1, ids.b2];
    const filtered = idValues.filter((v) => v);
    if (new Set(filtered).size !== filtered.length) {
      setError("Please select unique players.");
      return;
    }

    const participants = [
      { side: "A", playerIds: [ids.a1, ids.a2].filter(Boolean) },
      { side: "B", playerIds: [ids.b1, ids.b2].filter(Boolean) },
    ];

    try {
      const payload: CreateMatchPayload = {
        sport: "padel",
        participants,
        bestOf: Number(bestOf),
      };
      if (date) {
        payload.playedAt = time
          ? new Date(`${date}T${time}`).toISOString()
          : `${date}T00:00:00`;
      }
      if (location) {
        payload.location = location;
      }

      const res = await apiFetch(`/v0/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { id: string };
      const setPayload = {
        sets: sets
          .filter((s) => s.A !== "" && s.B !== "")
          .map((s) => ({ A: Number(s.A), B: Number(s.B) })),
      };
      if (setPayload.sets.length) {
        await apiFetch(`/v0/matches/${data.id}/sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(setPayload),
        });
      }
      router.push(`/matches`);
    } catch {
      // ignore network errors
    }
  };

  return (
    <main className="container">
      <form onSubmit={handleSubmit}>
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
        </div>

        <label>
          Best of
          <select
            aria-label="Best of"
            value={bestOf}
            onChange={(e) => setBestOf(e.target.value)}
          >
            <option value="1">1</option>
            <option value="3">3</option>
            <option value="5">5</option>
          </select>
        </label>

        <div className="sets">
          {sets.map((s, idx) => (
            <div key={idx} className="set">
              <input
                type="number"
                min="0"
                step="1"
                placeholder={`Set ${idx + 1} A`}
                value={s.A}
                onChange={(e) => handleSetChange(idx, "A", e.target.value)}
              />
              <input
                type="number"
                min="0"
                step="1"
                placeholder={`Set ${idx + 1} B`}
                value={s.B}
                onChange={(e) => handleSetChange(idx, "B", e.target.value)}
              />
            </div>
          ))}
        </div>
        <button type="button" onClick={addSet}>
          Add Set
        </button>

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

