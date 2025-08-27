"use client";
import { useState, useEffect } from "react";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function MatchesPage() {
  const [matches, setMatches] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  async function load() {
    const mres = await fetch(`${base}/v0/matches`, { cache: "no-store" });
    if (mres.ok) setMatches(await mres.json());
    const pres = await fetch(`${base}/v0/players`, { cache: "no-store" });
    if (pres.ok) setPlayers(await pres.json());
  }
  useEffect(() => { load(); }, []);

  async function create() {
    await fetch(`${base}/v0/matches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sport: "padel",
        participants: [
          { side: "A", playerIds: [a] },
          { side: "B", playerIds: [b] },
        ],
      }),
    });
    setA(""); setB("");
    load();
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Matches</h1>
      <ul>
        {matches.map(m => (
          <li key={m.id}><a href={`/matches/${m.id}`}>{m.id}</a> - {m.sport}</li>
        ))}
      </ul>
      <h2>Create Match</h2>
      <select value={a} onChange={e => setA(e.target.value)}>
        <option value="">Side A</option>
        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select value={b} onChange={e => setB(e.target.value)}>
        <option value="">Side B</option>
        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <button onClick={create} disabled={!a || !b}>Create</button>
    </main>
  );
}
