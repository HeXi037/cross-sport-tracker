"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function RecordPage() {
  const router = useRouter();

  const [players, setPlayers] = useState<any[]>([]);
  const [ids, setIds] = useState({ a1: "", a2: "", b1: "", b2: "" });
  const [sets, setSets] = useState<Array<{ A: string; B: string }>>([
    { A: "", B: "" },
  ]);
  const [playedAt, setPlayedAt] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    async function loadPlayers() {
      try {
        const res = await fetch(`${base}/v0/players`);
        if (res.ok) {
          setPlayers(await res.json());
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
    // QoL: parse and drop incomplete/blank rows to avoid NaN payloads
    const parsedSets = sets
      .map(
        (s) => [parseInt(s.A, 10), parseInt(s.B, 10)] as [number, number]
      )
      .filter(
        ([a, b]) => Number.isFinite(a) && Number.isFinite(b)
      );

    if (parsedSets.length === 0) {
      alert("Please enter at least one completed set score.");
      return;
    }

    if (![ids.a1, ids.a2, ids.b1, ids.b2].every(Boolean)) {
      alert("Please select all four players.");
      return;
    }

    // 1) Create the match using player IDs
    const body = {
      sport: "padel",
      participants: [
        { side: "A", playerIds: [ids.a1, ids.a2] },
        { side: "B", playerIds: [ids.b1, ids.b2] },
      ],
      bestOf: 3,
      playedAt: playedAt ? new Date(playedAt).toISOString() : undefined,
      location: location || undefined,
    };

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

    // 2) Push the set results
    const setsRes = await fetch(`${base}/v0/matches/${id}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sets: parsedSets }),
    });
    if (!setsRes.ok) {
      alert("Failed to submit set scores.");
      return;
    }

    router.push(`/matches/${id}`);
  }

  return (
    <main className="container">
      <h1 className="heading">Record Match</h1>

      <section className="section">
        <h2 className="heading">Players</h2>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <select
              value={ids.a1}
              onChange={(e) => onIdChange("a1", e.target.value)}
            >
              <option value="">Player A1</option>
              {players.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={ids.a2}
              onChange={(e) => onIdChange("a2", e.target.value)}
            >
              <option value="">Player A2</option>
              {players.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={ids.b1}
              onChange={(e) => onIdChange("b1", e.target.value)}
            >
              <option value="">Player B1</option>
              {players.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={ids.b2}
              onChange={(e) => onIdChange("b2", e.target.value)}
            >
              <option value="">Player B2</option>
              {players.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="heading">Sets</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {sets.map((s, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={s.A}
                onChange={(e) => onSetChange(idx, "A", e.target.value)}
                placeholder="A"
                style={{ width: 64 }}
              />
              <span>-</span>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={s.B}
                onChange={(e) => onSetChange(idx, "B", e.target.value)}
                placeholder="B"
                style={{ width: 64 }}
              />
            </div>
          ))}
        </div>
        <button className="button mt-8" onClick={addSet} type="button">
          Add Set
        </button>
      </section>

      <section className="section">
        <h2 className="heading">Details</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
          />
        </div>
      </section>

      <button className="button" onClick={submit} type="button">
        Save
      </button>
    </main>
  );
}

