"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");

  async function load() {
    const res = await fetch(`${base}/v0/players?limit=100&offset=0`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setPlayers(data.players);
    }
  }
  useEffect(() => {
    load();
  }, []);

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
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            <Link href={`/players/${p.id}`}>{p.name}</Link>
          </li>
        ))}
      </ul>
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="name"
      />
      <button className="button" onClick={create}>
        Add
      </button>
    </main>
  );
}
