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
  describeStreak,
  formatMatchRecord,
  formatRatingValue,
  formatWinRate,
  normalizeMatchSummary,
  normalizeRatingSummaries,
  type NormalizedMatchSummary,
  type SportRatingSummary,
} from "../../lib/player-stats";
import { useDebounce } from "../../lib/useDebounce";
import { rememberLoginRedirect } from "../../lib/loginRedirect";

const NAME_REGEX = /^[A-Za-z0-9 '-]{1,50}$/;

const SPORT_VISUALS: Record<
  string,
  { icon: string; colorVar: string; backgroundVar: string }
> = {
  tennis: { icon: "🎾", colorVar: "var(--color-accent-green)", backgroundVar: "#ecfdf3" },
  soccer: { icon: "⚽", colorVar: "var(--color-accent-blue)", backgroundVar: "#e0f2fe" },
  football: { icon: "🏈", colorVar: "#ea580c", backgroundVar: "#fff7ed" },
  basketball: { icon: "🏀", colorVar: "#f97316", backgroundVar: "#fff7ed" },
  pickleball: { icon: "🏓", colorVar: "#0ea5e9", backgroundVar: "#e0f2fe" },
  volleyball: { icon: "🏐", colorVar: "#6366f1", backgroundVar: "#eef2ff" },
  baseball: { icon: "⚾", colorVar: "#c026d3", backgroundVar: "#faf5ff" },
  default: { icon: "🏅", colorVar: "var(--color-accent-blue)", backgroundVar: "#e5e7eb" },
};

const COUNTRY_NAME_BY_CODE = COUNTRY_OPTIONS.reduce<Record<string, string>>(
  (acc, option) => {
    acc[option.code] = option.name;
    return acc;
  },
  {},
);

function getCountryName(code?: string | null): string | null {
  if (!code) return null;
  return COUNTRY_NAME_BY_CODE[code] ?? null;
}

function resolveSportVisuals(sport?: string | null) {
  if (!sport) return SPORT_VISUALS.default;
  const key = sport.toLowerCase();
  return SPORT_VISUALS[key] ?? SPORT_VISUALS.default;
}

function summarizeRating(snapshot?: SportRatingSummary | null) {
  if (!snapshot) return null;
  const preferred = snapshot.elo ?? snapshot.glicko;
  const value = preferred?.value ?? snapshot.elo?.value ?? snapshot.glicko?.value;
  const systemName = snapshot.elo ? "Elo" : snapshot.glicko ? "Glicko" : null;
  if (value === null || value === undefined) {
    return { label: systemName ?? "Rating", value: "Unranked" };
  }
  return { label: systemName ?? "Rating", value: formatRatingValue(value) };
}

function formatLastPlayed(summary?: NormalizedMatchSummary | null): string {
  if (summary?.lastPlayedAt) {
    const date = new Date(summary.lastPlayedAt);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  }
  if (summary?.total && summary.total > 0) {
    return "Recorded";
  }
  return "—";
}

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
  ratings?: SportRatingSummary[];
}

type ApiPlayer = Omit<Player, "hidden" | "matchSummary"> & {
  hidden?: boolean;
  match_summary?: unknown;
  matchSummary?: unknown;
  ratings?: unknown;
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
          const normalizedRatings = normalizeRatingSummaries(
            (rest as { ratings?: unknown }).ratings,
          );
          return withAbsolutePhotoUrl<Player>({
            ...rest,
            badges: normalizedBadges,
            hidden: Boolean(maybeHidden),
            matchSummary:
              normalizeMatchSummary(matchSummary ?? match_summary) ?? null,
            ratings: normalizedRatings,
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
              <ul className="player-list player-card-grid" aria-label="Players">
                {filteredPlayers.map((p) => {
                  const summary = p.matchSummary;
                  const countryName = getCountryName(p.country_code);
                  const matchesPlayed = summary?.total ?? 0;
                  const winRate = formatWinRate(summary);
                  const streak = describeStreak(summary);
                  const ratingBadges = (p.ratings ?? []).slice(0, 3);

                  return (
                    <li key={p.id} className="player-list__item">
                      <div className="player-list__card player-card">
                        <Link
                          href={`/players/${p.id}`}
                          className="player-list__card-link player-card__link"
                          tabIndex={0}
                          aria-label={`View ${p.name}'s profile`}
                        >
                            <div className="player-card__header">
                              <div className="player-card__identity">
                                <span className="player-list__name">
                                <PlayerName
                                  player={p}
                                  showInitialsText={false}
                                  decorativeAvatar
                                />
                              </span>
                              <div className="player-card__meta">
                                {countryName ? (
                                  <span className="player-card__meta-pill">
                                    <span aria-hidden>🌍</span> {countryName}
                                  </span>
                                ) : null}
                                {p.location ? (
                                  <span className="player-card__meta-pill">
                                    <span aria-hidden>📍</span> {p.location}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="player-card__record" aria-label={`Record for ${p.name}`}>
                              {summary && summary.total > 0 ? formatMatchRecord(summary) : "No matches yet"}
                            </div>
                            {p.hidden && (
                              <span className="player-list__status" aria-label="Hidden player">
                                Hidden
                              </span>
                            )}
                          </div>

                          <div
                            className="player-card__ratings"
                            aria-label={`Rating snapshots for ${p.name}`}
                            role="list"
                          >
                            {ratingBadges.length ? (
                              ratingBadges.map((rating) => {
                                const visuals = resolveSportVisuals(rating.sport);
                                const ratingSummary = summarizeRating(rating);
                                return (
                                  <span
                                    key={`${p.id}-${rating.sport}`}
                                    className="player-card__rating"
                                    role="listitem"
                                    style={{
                                      color: visuals.colorVar,
                                      backgroundColor: visuals.backgroundVar,
                                    }}
                                    aria-label={`${rating.sport} ${ratingSummary?.label ?? "Rating"}: ${ratingSummary?.value ?? "Unranked"}`}
                                  >
                                    <span aria-hidden>{visuals.icon}</span>
                                    <span className="player-card__rating-text">
                                      <span className="player-card__rating-sport">{rating.sport}</span>
                                      <span className="player-card__rating-value">
                                        {ratingSummary?.value ?? "Unranked"}
                                      </span>
                                    </span>
                                  </span>
                                );
                              })
                            ) : (
                              <span className="player-card__rating player-card__rating--empty" role="listitem">
                                <span aria-hidden>🏅</span>
                                <span className="player-card__rating-value">No ratings yet</span>
                              </span>
                            )}
                          </div>

                          <dl
                            className="player-card__quick-stats"
                            aria-label={`Quick stats for ${p.name}`}
                          >
                            <div className="player-card__stat">
                              <dt>Matches</dt>
                              <dd>{matchesPlayed > 0 ? matchesPlayed : "—"}</dd>
                            </div>
                            <div className="player-card__stat">
                              <dt>Win rate</dt>
                              <dd>{winRate}</dd>
                            </div>
                            <div className="player-card__stat">
                              <dt>Last played</dt>
                              <dd>{formatLastPlayed(summary)}</dd>
                            </div>
                          </dl>

                          <div
                            className={`player-card__streak player-card__streak--${streak.tone}`}
                            aria-label={`${streak.label}: ${streak.value}`}
                          >
                            <span className="player-card__streak-label">{streak.label}</span>
                            <span className="player-card__streak-value">{streak.value}</span>
                          </div>

                          {p.badges && p.badges.length > 0 ? (
                            <div
                              className="player-list__badges player-card__badges"
                              aria-label={`Badges for ${p.name}`}
                            >
                              {p.badges.slice(0, 3).map((badge) => (
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
                          ) : (
                            <div className="player-card__badges player-card__badges--empty" aria-label="No badges earned yet">
                              <span className="player-card__badge-placeholder">Earn badges by playing matches</span>
                            </div>
                          )}
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
                  );
                })}
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
    <ul className="player-list player-card-grid" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <li key={`player-skeleton-${index}`} className="player-list__item">
          <div className="player-list__card player-card" aria-hidden>
            <div className="player-card__header">
              <span
                className="skeleton"
                style={{ width: "55%", maxWidth: "240px", height: "1.1rem" }}
              />
              <span
                className="skeleton"
                style={{ width: "26%", maxWidth: "140px", height: "0.95rem" }}
              />
            </div>
            <div className="player-card__ratings">
              <span className="skeleton" style={{ width: "38%", height: "1.85rem" }} />
              <span className="skeleton" style={{ width: "32%", height: "1.85rem" }} />
            </div>
            <div className="player-card__quick-stats">
              <span className="skeleton" style={{ width: "30%", height: "1.4rem" }} />
              <span className="skeleton" style={{ width: "30%", height: "1.4rem" }} />
              <span className="skeleton" style={{ width: "30%", height: "1.4rem" }} />
            </div>
            <div className="player-card__streak player-card__streak--neutral">
              <span className="skeleton" style={{ width: "28%", height: "1rem" }} />
            </div>
            <div className="player-card__badges">
              <span className="skeleton" style={{ width: "22%", height: "1.4rem" }} />
              <span className="skeleton" style={{ width: "22%", height: "1.4rem" }} />
              <span className="skeleton" style={{ width: "22%", height: "1.4rem" }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
