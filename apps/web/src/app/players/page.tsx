"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { apiFetch, isAdmin } from "../../lib/api";
import PlayerLabel from "../../components/PlayerLabel";
import InputField from "../../components/InputField";
import ErrorBoundary from "../../components/ErrorBoundary";

const NAME_REGEX = /^[A-Za-z0-9 '-]{1,50}$/;

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
  badges?: { id: string; name: string; icon?: string | null }[];
  photo_url?: string | null;
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [recentMatches, setRecentMatches] =
    useState<Record<string, string | null>>({});
  the const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const admin = isAdmin();

  const trimmedName = name.trim();
  const nameIsValid = NAME_REGEX.test(trimmedName);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch("/v0/players?limit=100&offset=0", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.players as Player[]).filter(
          (p) => !p.name.toLowerCase().startsWith("albert")
        );
        setPlayers(filtered);
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
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const filteredPlayers = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return players;
    return players.filter((p) => p.name.toLowerCase().includes(term));
  }, [players, debouncedSearch]);

  useEffect(() => {
    if (!players.length) return;
    async function loadMatches() {
      const entries = await Promise.all(
        players.map(async (p) => {
          try {
            const r = await apiFetch(
              `/v0/matches?playerId=${encodeURIComponent(p.id)}`,
              { cache: "no-store" }
            );
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
      const data = (await res.json().catch(() => null)) as
        | Player
        | (Record<string, unknown> & { detail?: string; message?: string })
        | null;
      if (!res.ok || !data || !("id" in data)) {
        let message = "Failed to create player.";
        if (data && typeof (data as any)["detail"] === "string")
          message = (data as any)["detail"] as string;
        else if (data && typeof (data as any)["message"] === "string")
          message = (data as any)["message"] as string;
        setError(message);
        return;
      }
      setName("");
      if (photo) {
        const form = new FormData();
        form.append("file", photo);
        await apiFetch(`/v0/players/${data.id}/photo`, {
          method: "POST",
          body: form,
        });
        setPhoto(null);
      }
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
    <ErrorBoundary>
      <main className="container">
        <h1 className="heading">Players</h1>
        {loading && players.length === 0 ? (
          <div>Loading players…</div>
        ) : (
          <>
            <InputField
              id="player-search"
              label="Search"
              className="input mb-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search"
            />
            {filteredPlayers.length === 0 && debouncedSearch.trim() !== "" ? (
              <p>No players found.</p>
            ) : (
              <ul>
                {filteredPlayers.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={
                        recentMatches[p.id]
                          ? `/matches/${recentMatches[p.id]}`
                          : `/players/${p.id}`
                      }
                    >
                      <PlayerLabel
                        id={p.id}
                        name={p.name}
                        photoUrl={p.photo_url}
                      />
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
            )}
          </>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <InputField
            id="new-player"
            label="Player name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="name"
            error={
              !nameIsValid && trimmedName !== ""
                ? "Name must be 1-50 characters and contain only letters, numbers, spaces, hyphens, or apostrophes."
                : undefined
            }
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="my-2"
          />
          <button
            className="button"
            type="submit"
            disabled={creating || name.trim() === ""}
          >
            {creating ? "Saving…" : "Add"}
          </button>
        </form>
        {success && (
          <div className="text-green-600 mt-2" role="alert">
            {success}
          </div>
        )}
        {error && (
          <div className="text-red-500 mt-2" role="alert">
            {error}
            <button className="ml-2 underline" onClick={load}>
              Retry
            </button>
          </div>
        )}
      </main>
    </ErrorBoundary>
  );
}
