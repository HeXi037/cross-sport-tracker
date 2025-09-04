'use client';

import { useEffect, useState } from "react";
import { apiFetch, isAdmin } from "../../../lib/api";

interface Tournament {
  id: string;
  sport: string;
  name: string;
  clubId?: string | null;
}

export default function AdminTournamentsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [sport, setSport] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch("/v0/tournaments", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setTournaments(await res.json());
    } catch {
      setError("Failed to load tournaments.");
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
      await apiFetch("/v0/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, name }),
      });
      setSport("");
      setName("");
      await load();
    } catch {
      setError("Failed to create tournament.");
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/v0/tournaments/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <main className="container">
      <h1 className="heading">Admin Tournaments</h1>
      <div className="mb-4">
        <input
          className="input mr-2"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          placeholder="sport"
        />
        <input
          className="input mr-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name"
        />
        <button
          className="button"
          onClick={create}
          disabled={!sport.trim() || !name.trim()}
        >
          Add
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <ul>
        {tournaments.map((t) => (
          <li key={t.id} className="mb-2">
            {t.name} ({t.sport})
            <button style={{ marginLeft: 8 }} onClick={() => remove(t.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

