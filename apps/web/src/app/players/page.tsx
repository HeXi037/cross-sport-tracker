"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

function getRatingValue(summary?: SportRatingSummary | null): number | null {
  if (!summary) return null;
  const preferred = summary.elo ?? summary.glicko;
  const value = preferred?.value ?? summary.elo?.value ?? summary.glicko?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBestRatingValue(player: Player, sportFilter?: string): number | null {
  const normalizedSport = sportFilter?.toLowerCase();
  const ratings = player.ratings ?? [];
  let targetRatings = ratings;

  if (normalizedSport) {
    targetRatings = ratings.filter(
      (r) => r.sport?.toLowerCase() === normalizedSport,
    );
  }

  const snapshot = targetRatings.reduce<
    { value: number | null; deviation?: number | null }
  >(
    (best, current) => {
      const currentValue = getRatingValue(current);
      if (currentValue === null) return best;

      const bestValue = best.value;
      if (bestValue === null || currentValue > bestValue) {
        return { value: currentValue, deviation: current.elo?.deviation };
      }
      return best;
    },
    { value: null },
  );

  return snapshot.value;
}

function getRatingGrowth(player: Player, sportFilter?: string): number | null {
  const normalizedSport = sportFilter?.toLowerCase();
  const ratings = player.ratings ?? [];
  let targetRatings = ratings;

  if (normalizedSport) {
    targetRatings = ratings.filter(
      (r) => r.sport?.toLowerCase() === normalizedSport,
    );
  }

  let bestDelta: number | null = null;
  for (const summary of targetRatings) {
    const delta = summary.elo?.delta30 ?? summary.glicko?.delta30 ?? null;
    if (typeof delta === "number" && Number.isFinite(delta)) {
      if (bestDelta === null || delta > bestDelta) {
        bestDelta = delta;
      }
    }
  }
  return bestDelta;
}

function normalizePlayer(apiPlayer: ApiPlayer): Player {
  const { matchSummary, match_summary, hidden: maybeHidden, ...rest } = apiPlayer;

  const normalizedBadges = (rest.badges ?? []).map((badge) => ({
    ...badge,
    earned_at: (badge as { earnedAt?: string }).earnedAt ?? badge.earned_at ?? null,
  }));

  const normalizedRatings = normalizeRatingSummaries((rest as { ratings?: unknown }).ratings);

  return withAbsolutePhotoUrl<Player>({
    ...rest,
    hidden: Boolean(maybeHidden),
    matchSummary: normalizeMatchSummary(matchSummary ?? match_summary),
    badges: normalizedBadges,
    ratings: normalizedRatings,
  });
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
  created_at?: string | null;
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

type CuratedSectionKey =
  | "topRated"
  | "fastImprovers"
  | "mostActive"
  | "newest";

interface CuratedSectionState {
  loading: boolean;
  players: Player[];
  error: string | null;
}

const CURATED_SECTIONS: Record<CuratedSectionKey, {
  title: string;
  description: string;
  limit: number;
  query: Record<string, string>;
  seeAllParams: Record<string, string>;
}> = {
  topRated: {
    title: "Top rated",
    description: "Highest sport ratings across the community.",
    limit: 5,
    query: { sort: "highest-rating" },
    seeAllParams: { sort: "highest-rating" },
  },
  fastImprovers: {
    title: "Fast improvers",
    description: "Biggest rating gains in the last 30 days.",
    limit: 5,
    query: { sort: "rating-growth", active_within_days: "30" },
    seeAllParams: { sort: "rating-growth", active_within_days: "30" },
  },
  mostActive: {
    title: "Most active",
    description: "Playing the most matches in the last 30 days.",
    limit: 5,
    query: { sort: "most-active", active_within_days: "30" },
    seeAllParams: { sort: "most-active", active_within_days: "30" },
  },
  newest: {
    title: "Newest players",
    description: "Fresh faces who just joined.",
    limit: 5,
    query: { sort: "recently-joined" },
    seeAllParams: { sort: "recently-joined" },
  },
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

const RATING_BANDS = [
  { value: "all", label: "All ratings", min: null, max: null },
  { value: "unranked", label: "Unranked", min: null, max: null },
  { value: "1000-1299", label: "1000-1299", min: 1000, max: 1299 },
  { value: "1300-1599", label: "1300-1599", min: 1300, max: 1599 },
  { value: "1600-1899", label: "1600-1899", min: 1600, max: 1899 },
  { value: "1900+", label: "1900+", min: 1900, max: null },
];

const ACTIVITY_RECENCY_OPTIONS = [
  { value: "any", label: "Any time", days: null },
  { value: "30", label: "Active in last 30 days", days: 30 },
  { value: "90", label: "Active in last 90 days", days: 90 },
  { value: "365", label: "Active in last year", days: 365 },
];

const SORT_OPTIONS = [
  { value: "most-active", label: "Most active" },
  { value: "highest-rating", label: "Highest rating" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "recently-joined", label: "Recently joined" },
  { value: "rating-growth", label: "Rating growth" },
];

const DEFAULT_SORT = "most-active" satisfies (typeof SORT_OPTIONS)[number]["value"];

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [sportFilter, setSportFilter] = useState("all");
  const [clubFilter, setClubFilter] = useState("all");
  const [ratingBand, setRatingBand] = useState("all");
  const [activityRecency, setActivityRecency] = useState("any");
  const [hideInactive, setHideInactive] = useState(false);
  const [sortOption, setSortOption] = useState<string>(DEFAULT_SORT);
  const [error, setError] = useState<string | null>(null);
  const [playersLoadError, setPlayersLoadError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [updatingLocation, setUpdatingLocation] = useState<string | null>(null);
  const [updatingVisibility, setUpdatingVisibility] = useState<string | null>(null);
  const [admin, setAdmin] = useState(() => isAdmin());
  const searchParams = useSearchParams();
  const loadRequestId = useRef(0);
  const activeLoadController = useRef<AbortController | null>(null);
  const activeLoadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showToast } = useToast();

  const [curatedSections, setCuratedSections] = useState<Record<CuratedSectionKey, CuratedSectionState>>(
    () =>
      Object.keys(CURATED_SECTIONS).reduce(
        (acc, key) => {
          acc[key as CuratedSectionKey] = { loading: true, players: [], error: null };
          return acc;
        },
        {} as Record<CuratedSectionKey, CuratedSectionState>,
      ),
  );

  const sportOptions = useMemo(() => {
    const sports = new Set<string>();
    for (const player of players) {
      for (const rating of player.ratings ?? []) {
        if (rating.sport) {
          sports.add(rating.sport);
        }
      }
    }
    return Array.from(sports).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [players]);

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

  useEffect(() => {
    if (!searchParams) return;

    const q = searchParams.get("q");
    const sport = searchParams.get("sport");
    const club = searchParams.get("club");
    const rating = searchParams.get("rating_band");
    const activeWithin = searchParams.get("active_within_days");
    const sort = searchParams.get("sort");
    const includeInactive = searchParams.get("include_inactive");

    if (q !== null) setSearch(q);

    if (sport && sportOptions.includes(sport)) setSportFilter(sport);
    if (club) setClubFilter(club);
    if (rating && RATING_BANDS.some((band) => band.value === rating)) setRatingBand(rating);
    if (
      activeWithin &&
      ACTIVITY_RECENCY_OPTIONS.some((option) => option.value === activeWithin)
    ) {
      setActivityRecency(activeWithin);
    }
    if (sort && SORT_OPTIONS.some((option) => option.value === sort)) setSortOption(sort);
    if (includeInactive === "false") setHideInactive(true);
  }, [searchParams, sportOptions]);

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
      if (sportFilter !== "all") {
        params.set("sport", sportFilter);
      }
      if (clubFilter !== "all") {
        params.set("club", clubFilter);
      }
      if (ratingBand !== "all") {
        params.set("rating_band", ratingBand);
      }
      if (activityRecency !== "any") {
        params.set("active_within_days", activityRecency);
      }
      if (hideInactive) {
        params.set("include_inactive", "false");
      }
      params.set("sort", sortOption);
      const res = await apiFetch(`/v0/players?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json();
      const normalized = ((data.players ?? []) as ApiPlayer[])
        .map(normalizePlayer)
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
  }, [
    activityRecency,
    admin,
    clubFilter,
    debouncedSearch,
    hideInactive,
    ratingBand,
    showToast,
    sortOption,
    sportFilter,
  ]);

  const loadCuratedSections = useCallback(async () => {
    await Promise.all(
      Object.entries(CURATED_SECTIONS).map(async ([key, config]) => {
        const sectionKey = key as CuratedSectionKey;
        setCuratedSections((prev) => ({
          ...prev,
          [sectionKey]: { ...prev[sectionKey], loading: true, error: null },
        }));
        try {
          const params = new URLSearchParams({
            limit: String(config.limit),
            offset: "0",
            ...config.query,
          });
          if (admin) {
            params.set("include_hidden", "true");
          }
          const res = await apiFetch(`/v0/players?${params.toString()}`, {
            cache: "no-store",
          });
          const data = await res.json();
          const normalized = ((data.players ?? []) as ApiPlayer[])
            .map(normalizePlayer)
            .filter((player): player is Player => !!player);
          setCuratedSections((prev) => ({
            ...prev,
            [sectionKey]: { loading: false, players: normalized, error: null },
          }));
        } catch (err) {
          console.error(`Failed to load curated section ${sectionKey}`, err);
          setCuratedSections((prev) => ({
            ...prev,
            [sectionKey]: {
              ...prev[sectionKey],
              loading: false,
              error: PLAYERS_ERROR_MESSAGE,
            },
          }));
        }
      }),
    );
  }, [admin]);
  useEffect(() => {
    void load();
    void loadCuratedSections();
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
  }, [load, loadCuratedSections]);

  const clubOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const player of players) {
      if (player.club_id) {
        options.set(player.club_id, player.location ?? `Club ${player.club_id}`);
      } else if (player.location) {
        options.set(player.location, player.location);
      }
    }
    return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
  }, [players]);

  const hasActiveFilters =
    sportFilter !== "all" ||
    clubFilter !== "all" ||
    ratingBand !== "all" ||
    activityRecency !== "any" ||
    hideInactive;

  const clearFilters = () => {
    setSportFilter("all");
    setClubFilter("all");
    setRatingBand("all");
    setActivityRecency("any");
    setHideInactive(false);
    setSortOption(DEFAULT_SORT);
  };

  const filteredPlayers = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    const today = new Date();
    const recentDays = ACTIVITY_RECENCY_OPTIONS.find(
      (option) => option.value === activityRecency,
    )?.days;

    const matches: Player[] = players.filter((player) => {
      const normalizedName = player.name.toLowerCase();
      if (term && !normalizedName.includes(term)) {
        return false;
      }

      if (sportFilter !== "all") {
        const normalizedSport = sportFilter.toLowerCase();
        const hasSport = (player.ratings ?? []).some(
          (rating) => rating.sport?.toLowerCase() === normalizedSport,
        );
        const sportBadge = (player.badges ?? []).some(
          (badge) => badge.sport_id?.toLowerCase() === normalizedSport,
        );
        if (!hasSport && !sportBadge) return false;
      }

      if (clubFilter !== "all") {
        const clubMatch =
          player.club_id === clubFilter ||
          (player.location && player.location === clubFilter);
        if (!clubMatch) return false;
      }

      if (ratingBand !== "all") {
        const currentRating = getBestRatingValue(player, sportFilter);
        if (ratingBand === "unranked") {
          if (currentRating !== null) return false;
        } else {
          const band = RATING_BANDS.find((band) => band.value === ratingBand);
          if (band) {
            const meetsMin =
              band.min === null ||
              (typeof currentRating === "number" && currentRating >= band.min);
            const meetsMax =
              band.max === null ||
              (typeof currentRating === "number" && currentRating <= band.max);
            if (currentRating === null || !meetsMin || !meetsMax) return false;
          }
        }
      }

      if (recentDays !== null && recentDays !== undefined) {
        const lastPlayed = player.matchSummary?.lastPlayedAt;
        if (!lastPlayed) return false;
        const lastPlayedDate = new Date(lastPlayed);
        if (Number.isNaN(lastPlayedDate.getTime())) return false;
        const diffMs = today.getTime() - lastPlayedDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > recentDays) return false;
      }

      if (hideInactive) {
        const summary = player.matchSummary;
        const lastPlayed = summary?.lastPlayedAt;
        const matchesPlayed = summary?.total ?? 0;
        const lastPlayedDate = lastPlayed ? new Date(lastPlayed) : null;
        const stale =
          !lastPlayedDate ||
          Number.isNaN(lastPlayedDate.getTime()) ||
          today.getTime() - lastPlayedDate.getTime() > 1000 * 60 * 60 * 24 * 180;
        if (!matchesPlayed || stale) {
          return false;
        }
      }

      return true;
    });

    const sorted = [...matches].sort((a, b) => {
      if (sortOption === "alphabetical") {
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }

      if (sortOption === "recently-joined") {
        const joinedA = a.created_at ? new Date(a.created_at).getTime() : null;
        const joinedB = b.created_at ? new Date(b.created_at).getTime() : null;
        if (joinedA !== null && joinedB !== null && joinedA !== joinedB) {
          return joinedB - joinedA;
        }
        if (joinedA !== null && joinedB === null) return -1;
        if (joinedA === null && joinedB !== null) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }

      if (sortOption === "highest-rating") {
        const ratingA = getBestRatingValue(a, sportFilter);
        const ratingB = getBestRatingValue(b, sportFilter);
        if (ratingA !== ratingB) {
          return (ratingB ?? -Infinity) - (ratingA ?? -Infinity);
        }
      }

      if (sortOption === "rating-growth") {
        const growthA = getRatingGrowth(a, sportFilter);
        const growthB = getRatingGrowth(b, sportFilter);
        if (growthA !== growthB) {
          return (growthB ?? -Infinity) - (growthA ?? -Infinity);
        }
      }

      // default to most active
      const matchesA = a.matchSummary?.total ?? 0;
      const matchesB = b.matchSummary?.total ?? 0;
      if (matchesA !== matchesB) {
        return matchesB - matchesA;
      }
      const lastPlayedA = a.matchSummary?.lastPlayedAt
        ? new Date(a.matchSummary.lastPlayedAt).getTime()
        : null;
      const lastPlayedB = b.matchSummary?.lastPlayedAt
        ? new Date(b.matchSummary.lastPlayedAt).getTime()
        : null;
      if (lastPlayedA !== null && lastPlayedB !== null && lastPlayedA !== lastPlayedB) {
        return lastPlayedB - lastPlayedA;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return sorted;
  }, [
    activityRecency,
    clubFilter,
    debouncedSearch,
    hideInactive,
    players,
    ratingBand,
    sortOption,
    sportFilter,
  ]);

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
          <div className="player-list__filters mb-6 flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="form-field">
                <label htmlFor="sport-filter" className="form-label">
                  Sport
                </label>
                <select
                  id="sport-filter"
                  className="input"
                  value={sportFilter}
                  onChange={(e) => setSportFilter(e.target.value)}
                >
                  <option value="all">All sports</option>
                  {sportOptions.map((sport) => (
                    <option key={sport} value={sport.toLowerCase()}>
                      {sport}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="club-filter" className="form-label">
                  Club / venue
                </label>
                <select
                  id="club-filter"
                  className="input"
                  value={clubFilter}
                  onChange={(e) => setClubFilter(e.target.value)}
                >
                  <option value="all">All clubs & venues</option>
                  {clubOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="rating-band" className="form-label">
                  Rating band
                </label>
                <select
                  id="rating-band"
                  className="input"
                  value={ratingBand}
                  onChange={(e) => setRatingBand(e.target.value)}
                >
                  {RATING_BANDS.map((band) => (
                    <option key={band.value} value={band.value}>
                      {band.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="activity-recency" className="form-label">
                  Activity recency
                </label>
                <select
                  id="activity-recency"
                  className="input"
                  value={activityRecency}
                  onChange={(e) => setActivityRecency(e.target.value)}
                >
                  {ACTIVITY_RECENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="sort-option" className="form-label">
                  Sort by
                </label>
                <select
                  id="sort-option"
                  className="input"
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={hideInactive}
                  onChange={(e) => setHideInactive(e.target.checked)}
                />
                Hide inactive players
              </label>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
          <CuratedHighlights
            sections={curatedSections}
            admin={admin}
            sportFilter={sportFilter}
          />
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
                {players.length === 0 && !hasActiveFilters && debouncedSearch.trim() === ""
                  ? "No players have been added yet."
                  : "No players match your filters."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {hasActiveFilters && (
                  <button type="button" className="underline" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
                <Link className="underline" href="/record">
                  Record a match to start building the roster
                </Link>
              </div>
            </div>
          ) : (
            <>
              <ul className="player-list player-card-grid" aria-label="Players">
                {filteredPlayers.map((p) => {
                  return (
                    <li key={p.id} className="player-list__item">
                      <PlayerDirectoryCard
                        player={p}
                        admin={admin}
                        sportFilter={sportFilter}
                        onCountryChange={handleCountryChange}
                        onToggleVisibility={handleToggleVisibility}
                        onDelete={handleDelete}
                        updatingLocation={updatingLocation}
                        updatingVisibility={updatingVisibility}
                      />
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

interface PlayerCardProps {
  player: Player;
  admin: boolean;
  sportFilter: string;
  variant?: "full" | "compact";
  onCountryChange?: (player: Player, nextValue: string) => void;
  onToggleVisibility?: (player: Player) => void;
  onDelete?: (playerId: string, hard?: boolean) => void;
  updatingLocation?: string | null;
  updatingVisibility?: string | null;
}

function PlayerDirectoryCard({
  player: p,
  admin,
  sportFilter,
  variant = "full",
  onCountryChange,
  onToggleVisibility,
  onDelete,
  updatingLocation,
  updatingVisibility,
}: PlayerCardProps) {
  const summary = p.matchSummary;
  const countryName = getCountryName(p.country_code);
  const matchesPlayed = summary?.total ?? 0;
  const winRate = formatWinRate(summary);
  const streak = describeStreak(summary);
  const normalizedSportFilter = sportFilter?.toLowerCase();
  const sortedRatings = (p.ratings ?? [])
    .slice()
    .sort((a, b) => {
      if (!normalizedSportFilter) return 0;
      const matchesA = a.sport?.toLowerCase() === normalizedSportFilter;
      const matchesB = b.sport?.toLowerCase() === normalizedSportFilter;
      if (matchesA === matchesB) return 0;
      return matchesA ? -1 : 1;
    });
  const ratingBadges = sortedRatings.slice(0, variant === "compact" ? 2 : 3);
  const showBadges = variant === "full";

  const compactStats = [
    { label: "Matches", value: matchesPlayed > 0 ? matchesPlayed : "—" },
    { label: "Last played", value: formatLastPlayed(summary) },
  ];

  return (
    <div
      className={`player-list__card player-card${
        variant === "compact" ? " player-card--compact" : ""
      }`}
    >
      <Link
        href={`/players/${p.id}`}
        className="player-list__card-link player-card__link"
        tabIndex={0}
        aria-label={`View ${p.name}'s profile`}
      >
        <div className="player-card__header">
          <div className="player-card__identity">
            <span className="player-list__name">
              <PlayerName player={p} showInitialsText={false} decorativeAvatar />
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
                  aria-label={`${rating.sport} ${ratingSummary?.label ?? "Rating"}: ${
                    ratingSummary?.value ?? "Unranked"
                  }`}
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

        <dl className="player-card__quick-stats" aria-label={`Quick stats for ${p.name}`}>
          {(variant === "compact" ? compactStats : [
            { label: "Matches", value: matchesPlayed > 0 ? matchesPlayed : "—" },
            { label: "Win rate", value: winRate },
            { label: "Last played", value: formatLastPlayed(summary) },
          ]).map((stat) => (
            <div key={stat.label} className="player-card__stat">
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>

        <div
          className={`player-card__streak player-card__streak--${streak.tone}`}
          aria-label={`${streak.label}: ${streak.value}`}
        >
          <span className="player-card__streak-label">{streak.label}</span>
          <span className="player-card__streak-value">{streak.value}</span>
        </div>

        {showBadges ? (
          p.badges && p.badges.length > 0 ? (
            <div className="player-list__badges player-card__badges" aria-label={`Badges for ${p.name}`}>
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
          )
        ) : null}
      </Link>

      {variant === "full" && admin && (
        <div className="player-list__admin" role="group" aria-label={`Admin controls for ${p.name}`}>
          <label className="player-list__label" htmlFor={`country-${p.id}`}>
            Country:
          </label>
          <select
            id={`country-${p.id}`}
            aria-label={`Country for ${p.name}`}
            value={p.country_code ?? ""}
            onChange={(e) => onCountryChange?.(p, e.target.value)}
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
            onClick={() => onToggleVisibility?.(p)}
            disabled={updatingVisibility === p.id}
          >
            {p.hidden ? "Unhide" : "Hide"}
          </button>
          <button
            type="button"
            className="player-list__action player-list__delete"
            onClick={() => onDelete?.(p.id)}
          >
            Delete
          </button>
          <button
            type="button"
            className="player-list__action player-list__delete"
            onClick={() => onDelete?.(p.id, true)}
          >
            Hard delete
          </button>
        </div>
      )}
    </div>
  );
}

function CuratedHighlights({
  sections,
  admin,
  sportFilter,
}: {
  sections: Record<CuratedSectionKey, CuratedSectionState>;
  admin: boolean;
  sportFilter: string;
}) {
  return (
    <div className="player-highlights" aria-label="Curated player collections">
      {Object.entries(CURATED_SECTIONS).map(([key, config]) => {
        const sectionKey = key as CuratedSectionKey;
        const section = sections[sectionKey];
        const seeAllParams = new URLSearchParams(config.seeAllParams);
        const seeAllHref = `/players?${seeAllParams.toString()}`;
        return (
          <section key={key} className="player-highlights__section">
            <div className="player-highlights__header">
              <div>
                <p className="eyebrow">{config.title}</p>
                <p className="player-highlights__description">{config.description}</p>
              </div>
              <Link className="player-highlights__see-all" href={seeAllHref}>
                See all
              </Link>
            </div>
            {section.error ? (
              <p className="player-highlights__error" role="status" aria-live="polite">
                {section.error}
              </p>
            ) : section.loading ? (
              <CompactPlayerListSkeleton count={config.limit} />
            ) : section.players.length ? (
              <ul
                className="player-list player-card-grid player-card-grid--compact"
                aria-label={`${config.title} players`}
              >
                {section.players.map((player) => (
                  <li key={`${sectionKey}-${player.id}`} className="player-list__item">
                    <PlayerDirectoryCard
                      player={player}
                      admin={admin}
                      sportFilter={sportFilter}
                      variant="compact"
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="player-highlights__empty">No players yet.</p>
            )}
          </section>
        );
      })}
    </div>
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

function CompactPlayerListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <ul className="player-list player-card-grid player-card-grid--compact" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <li key={`compact-player-skeleton-${index}`} className="player-list__item">
          <div className="player-list__card player-card player-card--compact" aria-hidden>
            <div className="player-card__header">
              <span
                className="skeleton"
                style={{ width: "60%", maxWidth: "200px", height: "1.1rem" }}
              />
              <span
                className="skeleton"
                style={{ width: "30%", maxWidth: "120px", height: "0.95rem" }}
              />
            </div>
            <div className="player-card__ratings">
              <span className="skeleton" style={{ width: "42%", height: "1.5rem" }} />
              <span className="skeleton" style={{ width: "36%", height: "1.5rem" }} />
            </div>
            <div className="player-card__quick-stats">
              <span className="skeleton" style={{ width: "32%", height: "1.2rem" }} />
              <span className="skeleton" style={{ width: "32%", height: "1.2rem" }} />
            </div>
            <div className="player-card__streak player-card__streak--neutral">
              <span className="skeleton" style={{ width: "36%", height: "0.95rem" }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
