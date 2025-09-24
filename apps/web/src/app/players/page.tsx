"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  apiFetch,
  isAdmin,
  updatePlayerLocation,
  withAbsolutePhotoUrl,
} from "../../lib/api";
import { COUNTRY_OPTIONS } from "../../lib/countries";
import PlayerName, { PlayerInfo } from "../../components/PlayerName";
import { normalizePlayerStats, type MatchSummary } from "../../lib/stats";
import { useToast } from "../../components/ToastProvider";

const NAME_REGEX = /^[A-Za-z0-9 '-]{1,50}$/;

interface Player extends PlayerInfo {
  location?: string | null;
  country_code?: string | null;
  region_code?: string | null;
  club_id?: string | null;
  badges?: { id: string; name: string; icon?: string | null }[];
}

type PlayerStatsRaw = {
  playerId?: string;
  matchSummary?: unknown;
  [key: string]: unknown;
};

type PlayerStats = PlayerStatsRaw & { matchSummary: MatchSummary };

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerStats, setPlayerStats] = useState<
    Record<string, PlayerStats | null>
  >({});
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
  const { showToast } = useToast();
  const lastStatsError = useRef(false);
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
      try {
        const entries = await Promise.all(
          players.map(async (p) => {
            try {
              const res = await apiFetch(
                `/v0/players/${encodeURIComponent(p.id)}/stats`,
                { cache: "no-store" }
              );
              const data = (await res.json()) as PlayerStatsRaw | null;
              const normalized = normalizePlayerStats<PlayerStatsRaw>(data);
              return {
                id: p.id,
                stats: normalized,
                failed: false,
              } as const;
            } catch (err) {
              console.warn(`Failed to load stats for player ${p.id}`, err);
              return {
                id: p.id,
                stats: null,
                failed: true,
              } as const;
            }
          })
        );
        if (!cancelled) {
          const statsMap = entries.reduce<Record<string, PlayerStats | null>>(
            (acc, entry) => {
              acc[entry.id] = entry.stats;
              return acc;
            },
            {}
          );
          setPlayerStats(statsMap);
          setStatsError(entries.some((entry) => entry.failed));
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load player stats list", err);
          setPlayerStats(
            Object.fromEntries(players.map((p) => [p.id, null] as const))
          );
          setStatsError(true);
        }
      }
    }
    loadStats();
    return () => {
      cancelled = true;
    };
  }, [players]);

  useEffect(() => {
    if (statsError && !lastStatsError.current) {
      showToast({
        message:
          "We couldn't load some player stats. Displayed records may be incomplete.",
        type: "error",
      });
    }
    lastStatsError.current = statsError;
  }, [statsError, showToast]);

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
          <div className="form-field mb-12">
            <label htmlFor="player-search" className="sr-only">
              Search players
            </label>
            <input
              id="player-search"
              type="search"
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players"
            />
          </div>
          {filteredPlayers.length === 0 && debouncedSearch.trim() !== "" ? (
            <p>No players found.</p>
          ) : filteredPlayers.length === 0 ? (
            <p>No players available yet.</p>
          ) : (
            <>
              {statsError && (
                <p className="player-list__error" role="alert">
                  We couldn&apos;t load some player stats. Displayed records may
                  be incomplete.
                </p>
              )}
              <ul className="player-list">
                {filteredPlayers.map((p) => (
                  <li key={p.id} className="player-list__item">
                    <div className="player-list__row">
                      <Link href={`/players/${p.id}`} className="player-list__link">
                        <PlayerName player={p} />
                      </Link>
                      <span className="player-list__stats">
                        {(() => {
                          const stats = playerStats[p.id];
                          if (stats === undefined) return "Loading stats…";
                          if (!stats) return "Stats unavailable";
                          const { wins, losses, draws, winPct } =
                            stats.matchSummary;
                          const parts = [wins, losses];
                          if (draws) parts.push(draws);
                          const pct = Number.isFinite(winPct)
                            ? Math.round(winPct * 100)
                            : 0;
                          return `${parts.join("-")} (${pct}%)`;
                        })()}
                      </span>
                    </div>
                    {admin && (
                      <div className="player-list__admin">
                        <label className="player-list__label" htmlFor={`country-${p.id}`}>
                          Country:
                        </label>
                        <select
                          id={`country-${p.id}`}
                          aria-label={`Country for ${p.name}`}
                          value={p.country_code ?? ""}
                          onChange={(e) => handleCountryChange(p, e.target.value)}
                          disabled={updatingLocation === p.id}
                          className="input player-list__select"
                        >
                          <option value="">Unspecified</option>
                          {COUNTRY_OPTIONS.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        <button
                          className="player-list__delete"
                          onClick={() => handleDelete(p.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {admin ? (
        <>
          <div className="form-field">
            <label htmlFor="player-name" className="form-label">
              Player name
            </label>
            <input
              id="player-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter player name"
              autoComplete="name"
            />
          </div>
          {!nameIsValid && trimmedName !== "" && (
            <div className="text-red-500 mt-2">
              Name must be 1-50 characters and contain only letters,
              numbers, spaces, hyphens, or apostrophes.
            </div>
          )}
          <div className="form-field">
            <label htmlFor="player-photo" className="form-label">
              Upload profile photo (optional)
            </label>
            <input
              id="player-photo"
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              className="input"
            />
          </div>
          <button
            className="button"
            onClick={create}
            disabled={creating || name.trim() === ""}
          >
            {creating ? "Saving…" : "Add"}
          </button>
          {success && <div className="text-green-600 mt-2">{success}</div>}
        </>
      ) : (
        <p className="player-list__admin-note">
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
