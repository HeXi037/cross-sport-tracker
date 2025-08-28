"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

interface Player {
  id: string;
  name: string;
}

export default function RecordPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState({ a1: "", a2: "", b1: "", b2: "" });
  const [sets, setSets] = useState([{ A: "", B: "" }]);
  const [playedAt, setPlayedAt] = useState("");
  const [location, setLocation] = useState("");

  useEffect(() => {
    fetch(`${base}/v0/players`)
      .then(res => res.json())
      .then(setPlayers)
      .catch(() => {});
  }, []);

  function onIdChange(key: keyof typeof ids, value: string) {
    setIds({ ...ids, [key]: value });
  }

  function onSetChange(idx: number, field: "A" | "B", value: string) {
    const copy = sets.slice();
    copy[idx][field] = value;
    setSets(copy);
  }

  function addSet() {
    setSets([...sets, { A: "", B: "" }]);
  }

  async function submit() {
    const body = {
      sport: "padel",
      participants: [
        { side: "A", playerIds: [ids.a1, ids.a2].filter(Boolean) },
        { side: "B", playerIds: [ids.b1, ids.b2].filter(Boolean) }
      ],
      bestOf: 3,
      playedAt: playedAt ? new Date(playedAt).toISOString() : undefined,
      location: location || undefined,
    };
    const res = await fetch(`${base}/v0/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      alert("Failed to create match");
      return;
    }
    const { id } = await res.json();
    const payload = { sets: sets.map(s => [Number(s.A), Number(s.B)]) };
    await fetch(`${base}/v0/matches/${id}/sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    router.push(`/matches/${id}`);
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Record Match</h1>
      <div>
        <select value={ids.a1} onChange={e => onIdChange("a1", e.target.value)}>
          <option value="">Player A1</option>
          {players.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={ids.a2} onChange={e => onIdChange("a2", e.target.value)}>
          <option value="">Player A2</option>
          {players.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <select value={ids.b1} onChange={e => onIdChange("b1", e.target.value)}>
          <option value="">Player B1</option>
          {players.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={ids.b2} onChange={e => onIdChange("b2", e.target.value)}>
          <option value="">Player B2</option>
          {players.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        {sets.map((s, idx) => (
          <div key={idx}>
            <input value={s.A} onChange={e => onSetChange(idx, "A", e.target.value)} placeholder="A" />
            -
            <input value={s.B} onChange={e => onSetChange(idx, "B", e.target.value)} placeholder="B" />
          </div>
        ))}
        <button onClick={addSet}>Add Set</button>
      </div>
      <div>
        <input type="date" value={playedAt} onChange={e => setPlayedAt(e.target.value)} />
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Location" />
      </div>
      <button onClick={submit}>Save</button>
    </main>
  );
}

