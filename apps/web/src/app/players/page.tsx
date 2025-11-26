"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import {
  apiFetch,
  isAdmin,
  updatePlayerLocation,
  withAbsolutePhotoUrl,
  type ApiError,
} from "../../lib/api";
import { COUNTRY_OPTIONS } from "../../lib/countries";
import PlayerName, { PlayerInfo } from "../../components/PlayerName";
import { useToast } from "../../components/ToastProvider";
import {
  formatMatchRecord,
  normalizeMatchSummary,
  type NormalizedMatchSummary,
} from "../../lib/player-stats";
import { useDebounce } from "../../lib/useDebounce";
import { rememberLoginRedirect } from "../../lib/loginRedirect";

const NAME_REGEX = /^[A-Za-z0-9 '-]{1,50}$/;

interface PlayerBadge {
  id: string;
  name: string;
  icon?: string | null;
  category: string;
  rarity: string;
  description?: string | null;
  sport_id?: string | null;
  earned_at?: string | null;
}

interface Player extends PlayerInfo {
  location?: string | null;
  country_code?: string | null;
  region_code?: string | null;
  club_id?: string | null;
  badges?: PlayerBadge[];
  hidden: boolean;
  matchSummary?: NormalizedMatchSummary | null;
}

type ApiPlayer = Omit<Player, "hidden" | "matchSummary"> & {
  hidden?: boolean;
  match_summary?: unknown;
  matchSummary?: unknown;
};

const LOAD_TIMEOUT_MS = 15000;
const PLAYERS_ERROR_MESSAGE = "Failed to load players.";
const PLAYERS_SERVER_ERROR_MESSAGE =
  "Failed to load players due to a server error. Please try again later.";
const PLAYERS_NETWORK_ERROR_MESSAGE =
  "Failed to load players because we couldn't reach the network. Check your connection and retry.";
const PLAYERS_TIMEOUT_ERROR_MESSAGE = "Unable to load players.";
const PLAYERS_FORBIDDEN_MESSAGE =
  "You do not have permission to view hidden players.";

const PLAYER_ERROR_COPY: Record<string, string> = {
  players_include_hidden_forbidden: PLAYERS_FORBIDDEN_MESSAGE,
};

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [error, setError] = useState<string | null>(null);
  const [playersLoadError, setPlayersLoadError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState<string | null>(null);
  const [updatingVisibility, setUpdatingVisibility] = useState<string | null>(null);
  const [admin, setAdmin] = useState(() => isAdmin());
  const loadRequestId = useRef(0);
  const activeLoadController = useRef<AbortController | null>(null);
  const activeLoadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const updateAdmin = () => {
      setAdmin(isAdmin());
    };
    updateAdmin();
    window.addEventListener("storage", updateAdmin);
    return () => {
      window.removeEventListener("storage", updateAdmin);
    };
  }, []);

  const trimmedName = name.trim();
  const nameIsValid = NAME_REGEX.test(trimmedName);
  const showNameError = !nameIsValid && trimmedName !== "";
  const nameInputErrorId = "player-name-error";

  const load = useCallback(async (query: string = debouncedSearch) => {
    const requestId = loadRequestId.current + 1;
    loadRequestId.current = requestId;

    setError(null);
    setPlayersLoadError(null);
    setLoading(true);
    if (activeLoadController.current) {
      activeLoadController.current.abort();
      activeLoadController.current = null;
    }
    if (activeLoadTimeout.current) {
      clearTimeout(activeLoadTimeout.current);
      activeLoadTimeout.current = null;
    }
    const controller = new AbortController();
    activeLoadController.current = controller;
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, LOAD_TIMEOUT_MS);
    activeLoadTimeout.current = timeoutId;
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (admin) {
        params.set("include_hidden", "true");
      }
      const trimmedQuery = query.trim();
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }
      const res = await apiFetch(`/v0/players?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json();
      const normalized = ((data.players ?? []) as ApiPlayer[])
        .map(({ matchSummary, match_summary, hidden: maybeHidden, ...rest }) => {
          const normalizedBadges = (rest.badges ?? []).map((badge) => ({
            ...badge,
            earned_at: (badge as { earnedAt?: string }).earnedAt ?? badge.earned_at ?? null,
          }));
          return withAbsolutePhotoUrl<Player>({
            ...rest,
            badges: normalizedBadges,
            hidden: Boolean(maybeHidden),
            matchSummary:
              normalizeMatchSummary(matchSummary ?? match_summary) ?? null,
          });
        })
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
      if (loadRequestId.current !== requestId) {
        return;
      }
      setPlayers(normalized);
      setPlayersLoadError(null);
    } catch (err) {
      console.warn("Failed to fetch players", err);
      if (loadRequestId.current !== requestId) {
        return;
      }
      const apiError = err as ApiError | null;
      const code = typeof apiError?.code === "string" ? apiError.code : null;
      let message: string | null = null;

      if (code) {
        message = PLAYER_ERROR_COPY[code] ?? null;
        if (!message) {
          console.error(
            "Unhandled players fetch error code",
            code,
            apiError?.parsedMessage ?? apiError?.message ?? null
          );
        }
      }

      if (!message) {
        const abortError = err as DOMException;
        if (abortError?.name === "AbortError") {
          message = didTimeout ? PLAYERS_TIMEOUT_ERROR_MESSAGE : null;
        }
      }

      if (!message) {
        if (typeof apiError?.status === "number") {
          if (apiError.status === 0) {
            message = PLAYERS_NETWORK_ERROR_MESSAGE;
          } else if (apiError.status === 403) {
            message = PLAYERS_FORBIDDEN_MESSAGE;
          } else if (apiError.status >= 500) {
            message = PLAYERS_SERVER_ERROR_MESSAGE;
          }
        } else {
          message = PLAYERS_NETWORK_ERROR_MESSAGE;
        }
      }

      if (!message) {
        if (apiError?.parsedMessage) {
          console.error(
            "Unhandled players fetch error message",
            apiError.parsedMessage
          );
        }
        message = PLAYERS_ERROR_MESSAGE;
      }
      setPlayersLoadError(message);
      setError(message);
      if (message) {
        showToast({ message, variant: "error" });
      }
    } finally {
      if (activeLoadTimeout.current) {
        clearTimeout(activeLoadTimeout.current);
        activeLoadTimeout.current = null;
      }
      if (activeLoadController.current === controller) {
        activeLoadController.current = null;
      }
      if (loadRequestId.current === requestId) {
        setLoading(false);
      }
    }
  }, [admin, debouncedSearch, showToast]);
  useEffect(() => {
    void load();
    return () => {
      if (activeLoadTimeout.current) {
        clearTimeout(activeLoadTimeout.current);
        activeLoadTimeout.current = null;
      }
      if (activeLoadController.current) {
        activeLoadController.current.abort();
        activeLoadController.current = null;
      }
    };
  }, [load]);

  const filteredPlayers = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return players;
    return players.filter((p) => p.name.toLowerCase().includes(term));
  }, [players, debouncedSearch]);

  async function create() {
    if (!admin) {
      return;
    }
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
      void load();
      setSuccess("Player added successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError("Failed to create player.");
      return;
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, hard = false) {
    if (!admin) {
      return;
    }
    try {
      const query = hard ? "?hard=true" : "";
      await apiFetch(`/v0/players/${id}${query}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Failed to delete player.");
    }
  }

  async function handleToggleVisibility(player: Player) {
    if (!admin) {
      return;
    }
    setError(null);
    setUpdatingVisibility(player.id);
    try {
      const res = await apiFetch(`/v0/players/${player.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: !player.hidden }),
      });
      const updated = (await res.json()) as Player & { hidden?: boolean };
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? withAbsolutePhotoUrl<Player>({
                ...p,
                ...updated,
                hidden: Boolean(updated.hidden),
              })
            : p
        )
      );
    } catch {
      setError("Failed to update player visibility.");
    } finally {
      setUpdatingVisibility(null);
    }
  }

  async function handleCountryChange(player: Player, nextValue: string) {
    if (!admin) {
      return;
    }
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
        <div role="status" aria-live="polite" className="player-list__loading">
          <p className="player-list__loading-text">Loading players…</p>
          <PlayerListSkeleton />
        </div>
      ) : playersLoadError && !loading && players.length === 0 ? (
        <div
          className="player-list__error"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <p>{playersLoadError}</p>
          <nav
            aria-label="Player loading recovery options"
            className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <button
              type="button"
              className="underline"
              onClick={() => {
                void load();
              }}
            >
              Retry
            </button>
            <Link className="underline" href="/">
              Go back home
            </Link>
          </nav>
        </div>
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
              aria-label="Search players"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players"
            />
          </div>
          {filteredPlayers.length === 0 && debouncedSearch.trim() !== "" ? (
            <div role="status" aria-live="polite" className="player-list__empty">
              <p className="font-semibold">No players match your search.</p>
              <p className="text-sm text-gray-600">
                Try different spellings or remove filters to see more players.
              </p>
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="player-list__empty">
              <p role="status" className="font-semibold">
                No players have been added yet.
              </p>
              <Link className="underline" href="/record">
                Record a match to start building the roster
              </Link>
            </div>
          ) : (
            <>
              <ul className="player-list">
                {filteredPlayers.map((p) => (
                  <li key={p.id} className="player-list__item">
                    <div className="player-list__card">
                      <Link
                        href={`/players/${p.id}`}
                        className="player-list__card-link"
                        tabIndex={0}
                      >
                        <div className="player-list__row">
                          <span className="player-list__name">
                            <PlayerName
                              player={p}
                              showInitialsText={false}
                              decorativeAvatar
                            />
                          </span>
                          <span className="player-list__stats">
                            {(() => {
                              const summary = p.matchSummary;
                              if (!summary || summary.total <= 0) {
                                return "No matches yet";
                              }
                              return formatMatchRecord(summary);
                            })()}
                          </span>
                          {p.hidden && (
                            <span className="player-list__status" aria-label="Hidden player">
                              Hidden
                            </span>
                          )}
                        </div>
                        {p.badges && p.badges.length > 0 ? (
                          <div className="player-list__badges" aria-label="Highlight badges">
                            {p.badges.slice(0, 2).map((badge) => (
                              <span
                                key={badge.id}
                                className={`badge-pill badge-pill--${(badge.rarity || "common").toLowerCase()}`}
                              >
                                <span aria-hidden>{badge.icon || "🏅"}</span>
                                <span className="sr-only">{badge.rarity} badge:</span>
                                <span>{badge.name}</span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </Link>
                      {admin && (
                        <div
                          className="player-list__admin"
                          role="group"
                          aria-label={`Admin controls for ${p.name}`}
                        >
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
                            type="button"
                            className="player-list__action player-list__toggle"
                            onClick={() => handleToggleVisibility(p)}
                            disabled={updatingVisibility === p.id}
                          >
                            {p.hidden ? "Unhide" : "Hide"}
                          </button>
                          <button
                            type="button"
                            className="player-list__action player-list__delete"
                            onClick={() => handleDelete(p.id)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="player-list__action player-list__delete"
                            onClick={() => handleDelete(p.id, true)}
                          >
                            Hard delete
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {admin ? (
        <div data-testid="player-create-controls">
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
              aria-invalid={showNameError}
              aria-describedby={showNameError ? nameInputErrorId : undefined}
            />
          </div>
          {showNameError && (
            <div
              id={nameInputErrorId}
              className="text-red-500 mt-2"
              role="alert"
              aria-live="assertive"
            >
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
            type="button"
            className="button"
            onClick={create}
            disabled={creating || name.trim() === ""}
          >
            {creating ? "Saving…" : "Add"}
          </button>
          {success && (
            <div className="text-green-600 mt-2" role="status" aria-live="polite">
              {success}
            </div>
          )}
        </div>
      ) : (
        <div className="player-list__admin-note">
          <p>Sign in as an admin to add players.</p>
          <Link
            className="button-secondary inline-block mt-2"
            href="/login"
            onClick={() => rememberLoginRedirect()}
          >
            Login
          </Link>
        </div>
      )}
      {error && !playersLoadError && (
        <div className="text-red-500 mt-2" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
    </main>
  );
}

function PlayerListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="player-list" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <li key={`player-skeleton-${index}`} className="player-list__item">
          <div className="player-list__card" aria-hidden>
            <div className="player-list__row">
              <span
                className="skeleton"
                style={{ width: "45%", maxWidth: "220px", height: "1rem" }}
              />
              <span
                className="skeleton"
                style={{ width: "30%", maxWidth: "140px", height: "0.8rem" }}
              />
            </div>
            <div className="player-list__row" style={{ gap: "0.35rem" }}>
              <span
                className="skeleton"
                style={{ width: "28%", maxWidth: "120px", height: "0.75rem" }}
              />
              <span
                className="skeleton"
                style={{ width: "22%", maxWidth: "100px", height: "0.75rem" }}
              />
              <span
                className="skeleton"
                style={{ width: "18%", maxWidth: "80px", height: "0.75rem" }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
