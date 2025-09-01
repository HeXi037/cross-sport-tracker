"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch } from "../../lib/api";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [recentMatches, setRecentMatches] = useState<Record<string, string | null>>({});
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError(null);
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!players.length) return;
    async function loadMatches() {
      const entries = await Promise.all(
        players.map(async (p) => {
          try {
            const r = await apiFetch(`/v0/matches?playerId=${encodeURIComponent(p.id)}`, {
              cache: "no-store",
            });
            if (r.ok) {
              const data = (await r.json()) as { id: string }[];
              return [p.id, data[0]?.id ?? null] as const;
            }
          } catch {
            /* ignore */
          }
          return [p.id, null] as const;
        })
      );
      setRecentMatches(Object.fromEntries(entries));
    }
    loadMatches();
  }, [players]);

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    setError(null);
    try {
      const res = await apiFetch("/v0/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
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
      {loading && players.length === 0 ? (
        <div>Loading players…</div>
      ) : (
        <ul>
          {players.map((p) => (
            <li key={p.id}>
              <Link href={recentMatches[p.id] ? `/matches/${recentMatches[p.id]}` : `/players/${p.id}`}>
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="name"
      />
      <button
        className="button"
        onClick={create}
        disabled={name.trim() === ""}
      >
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
