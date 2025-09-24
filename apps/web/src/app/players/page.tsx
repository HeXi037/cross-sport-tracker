"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  apiFetch,
  isAdmin,
  updatePlayerLocation,
  withAbsolutePhotoUrl,
} from "../../lib/api";
import { COUNTRY_OPTIONS } from "../../lib/countries";
import PlayerName, { PlayerInfo } from "../../components/PlayerName";

const NAME_REGEX = /^[A-Za-z0-9 '-]{1,50}$/;

interface Player extends PlayerInfo {
  location?: string | null;
  country_code?: string | null;
  region_code?: string | null;
  club_id?: string | null;
  badges?: { id: string; name: string; icon?: string | null }[];
}

interface PlayerStats {
  playerId: string;
  matchSummary: {
    wins: number;
    losses: number;
    draws: number;
    total: number;
    winPct: number;
  };
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerStats, setPlayerStats] = useState<
    Record<string, PlayerStats | null>
  >({});
  const [statsError, setStatsError] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState<string | null>(null);
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
        const normalized = ((data.players as Player[]) ?? []).map((p) =>
          withAbsolutePhotoUrl(p)
        );
        setPlayers(normalized);
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
    if (!players.length) {
      setPlayerStats({});
      setStatsError(false);
      return;
    }
    let cancelled = false;
    async function loadStats() {
      setStatsError(false);
      let hadError = false;
      const entries = await Promise.all(
        players.map(async (p) => {
          try {
            const res = await apiFetch(
              `/v0/players/${encodeURIComponent(p.id)}/stats`,
              { cache: "no-store" }
            );
            const data = (await res.json()) as PlayerStats;
            return [p.id, data] as const;
          } catch {
            hadError = true;
            return [p.id, null] as const;
          }
        })
      );
      if (!cancelled) {
        setPlayerStats(
          Object.fromEntries(entries) as Record<string, PlayerStats | null>
        );
        if (hadError) {
          setStatsError(true);
        }
      }
    }
    loadStats();
    return () => {
      cancelled = true;
    };
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
      const created = (await res.json()) as Player;
      if (photoFile) {
        const form = new FormData();
        form.append("file", photoFile);
        await apiFetch(`/v0/players/${created.id}/photo`, {
          method: "POST",
          body: form,
        });
      }
      setName("");
      setPhotoFile(null);
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

  async function handleCountryChange(player: Player, nextValue: string) {
    const normalizedValue = nextValue === "" ? null : nextValue;
    if ((player.country_code ?? null) === normalizedValue) {
      return;
    }
    setUpdatingLocation(player.id);
    setError(null);
    try {
      const updated = await updatePlayerLocation(player.id, {
        country_code: normalizedValue,
      });
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                country_code: updated.country_code,
                location: updated.location,
                region_code: updated.region_code,
                club_id: updated.club_id,
              }
            : p
        )
      );
    } catch {
      setError("Failed to update player location.");
    } finally {
      setUpdatingLocation(null);
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search"
          />
          {filteredPlayers.length === 0 && debouncedSearch.trim() !== "" ? (
            <p>No players found.</p>
          ) : (
            <ul>
              {filteredPlayers.map((p) => (
                <li key={p.id}>
                  <div>
                    <Link href={`/players/${p.id}`}>
                      <PlayerName player={p} />
                    </Link>
                    <p className="text-sm text-gray-600 mt-1">
                      {(() => {
                        const stats = playerStats[p.id];
                        if (stats === undefined) return "Loading stats…";
                        if (!stats || !stats.matchSummary)
                          return "Stats unavailable";
                        const { wins, losses, draws, winPct } =
                          stats.matchSummary;
                        const parts = [wins, losses];
                        if (draws) parts.push(draws);
                        const pct = Number.isFinite(winPct)
                          ? Math.round(winPct * 100)
                          : 0;
                        return `${parts.join("-")} (${pct}%)`;
                      })()}
                    </p>
                  </div>
                  {admin && (
                    <div style={{ marginTop: 8 }}>
                      <label className="mr-2" htmlFor={`country-${p.id}`}>
                        Country:
                      </label>
                      <select
                        id={`country-${p.id}`}
                        aria-label={`Country for ${p.name}`}
                        value={p.country_code ?? ""}
                        onChange={(e) => handleCountryChange(p, e.target.value)}
                        disabled={updatingLocation === p.id}
                        className="input"
                        style={{ maxWidth: 220, display: "inline-block", marginRight: 8 }}
                      >
                        <option value="">Unspecified</option>
                        {COUNTRY_OPTIONS.map((option) => (
                          <option key={option.code} value={option.code}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      <button
                        style={{ marginLeft: 8 }}
                        onClick={() => handleDelete(p.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {statsError && (
            <p className="mt-2 text-sm text-amber-600">
              Unable to load some player stats right now. They may be
              incomplete.
            </p>
          )}
        </>
      )}
      {admin ? (
        <div className="mt-4">
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
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="input mt-2"
          />
          <button
            className="button"
            onClick={create}
            disabled={creating || name.trim() === ""}
          >
            {creating ? "Saving…" : "Add"}
          </button>
          {success && <div className="text-green-600 mt-2">{success}</div>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-600">
          Only administrators can add new players.
        </p>
      )}
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
