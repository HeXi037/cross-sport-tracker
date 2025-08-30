"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

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
      const res = await apiFetch("/v0/players?limit=100&offset=0", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.players);
      } else {
        setError("Failed to load players.");
      }
    } catch (err) {
      setError("Unable to reach the server.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create() {
    setError(null);
    try {
      const res = await apiFetch("/v0/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | Record<string, unknown>
          | null;
        let message = "Failed to create player.";
        if (data) {
          if (typeof data["detail"] === "string") message = data["detail"];
          else if (typeof data["message"] === "string") message = data["message"];
        }
        setError(message);
        return;
      }
    } catch {
      setError("Failed to create player.");
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
      {error && (
        <div className="text-red-500 mt-2">
          {error}
          <button className="ml-2 underline" onClick={load}>
            Retry
          </button>
        </div>
      )}
    </main>
  );
}
