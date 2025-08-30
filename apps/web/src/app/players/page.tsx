"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "../../lib/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await apiFetch(`/v0/players?limit=100&offset=0`, {
        cache: "no-store",
      });
      const data = await res.json();
      setPlayers(data.players);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load players.");
      setPlayers([]);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setError(null);
    try {
      await apiFetch(`/v0/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    } catch (e) {
      let message = "Failed to create player.";
      if (e instanceof ApiError && e.body && typeof e.body === "object") {
        const b = e.body as Record<string, unknown>;
        if (typeof b["detail"] === "string") message = b["detail"] as string;
        else if (typeof b["message"] === "string") message = b["message"] as string;
      } else if (e instanceof Error) {
        message = e.message;
      }
      setError(message);
      return;
    }
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
      {error && <p className="text-red-500 mt-2">{error}</p>}
    </main>
  );
}
