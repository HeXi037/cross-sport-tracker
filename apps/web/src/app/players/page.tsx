"use client";
import { useState, useEffect } from "react";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export default function PlayersPage() {
  const [players, setPlayers] = useState<any[]>([]);
  const [name, setName] = useState("");

  async function load() {
    const res = await fetch(`${base}/v0/players`, { cache: "no-store" });
    if (res.ok) setPlayers(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function create() {
    await fetch(`${base}/v0/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    load();
  }

  return (
    <main className="container">
      <h1 className="heading">Players</h1>
      <ul>{players.map(p => <li key={p.id}>{p.name}</li>)}</ul>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="name" />
      <button className="button" onClick={create}>Add</button>
    </main>
  );
}
