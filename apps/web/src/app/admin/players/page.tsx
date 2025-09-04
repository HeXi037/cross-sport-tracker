'use client';

import { useEffect, useState } from "react";
import { apiFetch, isAdmin } from "../../../lib/api";

interface Player {
  id: string;
  name: string;
}

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch("/v0/players?limit=100&offset=0", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPlayers(data.players || []);
    } catch {
      setError("Failed to load players.");
    }
  };

  useEffect(() => {
    if (!isAdmin()) {
      window.location.href = "/login";
      return;
    }
    load();
  }, []);

  const create = async () => {
    try {
      await apiFetch("/v0/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setName("");
      await load();
    } catch {
      setError("Failed to create player.");
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/v0/players/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <main className="container">
      <h1 className="heading">Admin Players</h1>
      <div className="mb-4">
        <input
          className="input mr-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name"
        />
        <button className="button" onClick={create} disabled={!name.trim()}>
          Add
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <ul>
        {players.map((p) => (
          <li key={p.id} className="mb-2">
            {p.name}
            <button style={{ marginLeft: 8 }} onClick={() => remove(p.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

