"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

export default function RecordSportPage() {
  const router = useRouter();
  const params = useParams();
  const sport = typeof params.sport === "string" ? params.sport : "";
  const isPadel = sport === "padel";

  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState({ a1: "", a2: "", b1: "", b2: "" });
  const [sets, setSets] = useState<Array<{ A: string; B: string }>>(
    isPadel ? [{ A: "", B: "" }] : []
  );
  const [bestOf, setBestOf] = useState(3);
  const [playedAt, setPlayedAt] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await fetch(`${base}/v0/players?limit=100&offset=0`);
        if (res.ok) {
          const data = await res.json();
          setPlayers(data.players);
        }
      } catch {
        // ignore errors
      }
    }
    loadPlayers();
  }, []);

  function onIdChange(key: keyof typeof ids, value: string) {
    setIds((n) => ({ ...n, [key]: value }));
  }

  function onSetChange(idx: number, field: "A" | "B", value: string) {
    setSets((prev) => {
      const copy = prev.slice();
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  }

  function addSet() {
    setSets((prev) => [...prev, { A: "", B: "" }]);
  }

  async function submit() {
    const parsedSets = isPadel
      ? sets
          .map((s) => [parseInt(s.A, 10), parseInt(s.B, 10)] as [number, number])
          .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
      : [];

    if (isPadel && parsedSets.length === 0) {
      alert("Please enter at least one completed set score.");
      return;
    }

    const requiredIds = isPadel
      ? [ids.a1, ids.a2, ids.b1, ids.b2]
      : [ids.a1, ids.b1];
    if (!requiredIds.every(Boolean)) {
      alert(
        isPadel
          ? "Please select all four players."
          : "Please select at least one player per side."
      );
      return;
    }

    const idValues = [ids.a1, ids.a2, ids.b1, ids.b2].filter(Boolean);
    if (new Set(idValues).size !== idValues.length) {
      alert("Please select unique players.");
      return;
    }

    const body: Record<string, unknown> = {
      sport,
      participants: [
        { side: "A", playerIds: [ids.a1, ids.a2].filter(Boolean) },
        { side: "B", playerIds: [ids.b1, ids.b2].filter(Boolean) },
      ],
      // Avoid sending timezone-aware timestamps; the API expects a naive
      // datetime string.  Using Date#toISOString() would include a "Z" suffix
      // (UTC) which caused the backend to reject the request.  Instead, send
      // an ISO date without timezone information if a value was provided.
      playedAt: playedAt ? `${playedAt}T00:00:00` : undefined,
      location: location || undefined,
    };
    if (isPadel) {
      body.bestOf = bestOf;
    }

    const createRes = await fetch(`${base}/v0/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!createRes.ok) {
      alert("Failed to create match.");
      return;
    }
    const { id } = (await createRes.json()) as { id: string };

    if (isPadel && parsedSets.length > 0) {
      const setsRes = await fetch(`${base}/v0/matches/${id}/sets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sets: parsedSets }),
      });
      if (!setsRes.ok) {
        alert("Failed to submit set scores.");
        return;
      }
    }

    router.push(`/matches/${id}`);
  }

  function isUsedElsewhere(id: string, key: keyof typeof ids) {
    return Object.entries(ids).some(([k, v]) => k !== key && v === id);
  }

  return (
    <main className="container">
      <h1 className="heading">Record {sport} Match</h1>

      <section className="section">
        <h2 className="heading">Players</h2>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label htmlFor="player-a1" style={{ display: "flex", flexDirection: "column" }}>
              Player A1
              <select
                id="player-a1"
                className="input"
                value={ids.a1}
                onChange={(e) => onIdChange("a1", e.target.value)}
              >
                <option value="">Player A1</option>
                {players.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={isUsedElsewhere(p.id, "a1")}
                  >
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label htmlFor="player-a2" style={{ display: "flex", flexDirection: "column" }}>
              Player A2
              <select
                id="player-a2"
                className="input"
                value={ids.a2}
                onChange={(e) => onIdChange("a2", e.target.value)}
              >
                <option value="">Player A2</option>
                {players.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={isUsedElsewhere(p.id, "a2")}
                  >
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label htmlFor="player-b1" style={{ display: "flex", flexDirection: "column" }}>
              Player B1
              <select
                id="player-b1"
                className="input"
                value={ids.b1}
                onChange={(e) => onIdChange("b1", e.target.value)}
              >
                <option value="">Player B1</option>
                {players.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={isUsedElsewhere(p.id, "b1")}
                  >
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label htmlFor="player-b2" style={{ display: "flex", flexDirection: "column" }}>
              Player B2
              <select
                id="player-b2"
                className="input"
                value={ids.b2}
                onChange={(e) => onIdChange("b2", e.target.value)}
              >
                <option value="">Player B2</option>
                {players.map((p) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={isUsedElsewhere(p.id, "b2")}
                  >
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {isPadel && (
        <section className="section">
          <h2 className="heading">Sets</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {sets.map((s, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <label
                  htmlFor={`set-${idx}-a`}
                  style={{ display: "flex", flexDirection: "column" }}
                >
                  Team A
                  <input
                    id={`set-${idx}-a`}
                    className="input"
                    value={s.A}
                    onChange={(e) => onSetChange(idx, "A", e.target.value)}
                    placeholder="A"
                  />
                </label>
                <span aria-label="to">–</span>
                <label
                  htmlFor={`set-${idx}-b`}
                  style={{ display: "flex", flexDirection: "column" }}
                >
                  Team B
                  <input
                    id={`set-${idx}-b`}
                    className="input"
                    value={s.B}
                    onChange={(e) => onSetChange(idx, "B", e.target.value)}
                    placeholder="B"
                  />
                </label>
              </div>
            ))}
          </div>
          <button className="button mt-8" onClick={addSet} type="button">
            Add Set
          </button>
        </section>
      )}

      <section className="section">
        <h2 className="heading">Details</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {isPadel && (
            <label htmlFor="best-of" style={{ display: "flex", flexDirection: "column" }}>
              Best of
              <select
                id="best-of"
                className="input"
                value={bestOf}
                onChange={(e) => setBestOf(parseInt(e.target.value, 10))}
              >
                {[1, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    Best of {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label htmlFor="played-at" style={{ display: "flex", flexDirection: "column" }}>
            Date
            <input
              id="played-at"
              className="input"
              type="date"
              value={playedAt}
              onChange={(e) => setPlayedAt(e.target.value)}
            />
          </label>
          <label htmlFor="location" style={{ display: "flex", flexDirection: "column" }}>
            Location
            <input
              id="location"
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
            />
          </label>
        </div>
      </section>

      <button className="button" onClick={submit} type="button">
        Save
      </button>
    </main>
  );
}
