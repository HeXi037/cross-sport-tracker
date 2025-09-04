"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, isAdmin } from "../../lib/api";

const NAME_REGEX = /^[A-Za-z0-9 '-]{1,50}$/;

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
  badges?: { id: string; name: string; icon?: string | null }[];
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [recentMatches, setRecentMatches] =
    useState<Record<string, string | null>>({});
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const admin = isAdmin();

  const trimmedName = name.trim();
  const nameIsValid = NAME_REGEX.test(trimmedName);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      const term = debouncedSearch.trim();
      if (term) params.set("q", term);
      const res = await apiFetch(`/v0/players?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.players as Player[]).filter(
          (p) => !p.name.toLowerCase().startsWith("albert")
        );
        setPlayers(filtered);
        setTotal(data.total ?? filtered.length);
      } else {
        setError("Failed to load players.");
      }
    } catch {
      setError("Unable to reach the server.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [page, debouncedSearch]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (!players.length) return;
    async function loadMatches() {
      const entries = await Promise.all(
        players.map(async (p) => {
          try {
            const r = await apiFetch(
              `/v0/matches?playerId=${encodeURIComponent(p.id)}&limit=1`,
              { cache: "no-store" }
            );
            if (r.ok) {
              const data = (await r.json()) as {
                matches: { id: string }[];
              };
              return [p.id, data.matches[0]?.id ?? null] as const;
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
    if (!nameIsValid) {
      return;
    }
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
      const res = await apiFetch("/v0/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | Record<string, unknown>
          | null;
        let message = "Failed to create player.";
        if (data) {
          if (typeof data["detail"] === "string") message = data["detail"];
          else if (typeof data["message"] === "string")
            message = data["message"];
        }
        setError(message);
        return;
      }
      setName("");
      load();
      setSuccess("Player added successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Failed to create player.");
      return;
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/v0/players/${id}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Failed to delete player.");
    }
  }

  return (
    <main className="container">
      <h1 className="heading">Players</h1>
      {loading && players.length === 0 ? (
        <div>Loading players…</div>
      ) : (
        <>
          <input
            className="input mb-2"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="search"
          />
          {players.length === 0 && debouncedSearch.trim() !== "" ? (
            <p>No players found.</p>
          ) : (
            <>
              <ul>
                {players.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={
                        recentMatches[p.id]
                          ? `/matches/${recentMatches[p.id]}`
                          : `/players/${p.id}`
                      }
                    >
                      {p.name}
                    </Link>
                    {admin && (
                      <button
                        style={{ marginLeft: 8 }}
                        onClick={() => handleDelete(p.id)}
                      >
                        Delete
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button
                  className="button"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 0}
                >
                  Previous
                </button>
                <button
                  className="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= total}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="name"
      />
      {!nameIsValid && trimmedName !== "" && (
        <div className="text-red-500 mt-2">
          Name must be 1-50 characters and contain only letters,
          numbers, spaces, hyphens, or apostrophes.
        </div>
      )}
      <button
        className="button"
        onClick={create}
        disabled={creating || name.trim() === ""}
      >
        {creating ? "Saving…" : "Add"}
      </button>
      {success && <div className="text-green-600 mt-2">{success}</div>}
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
