"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  forwardRef,
  type HTMLAttributes,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import CountrySelect from "../../components/CountrySelect";
import ClubSelect from "../../components/ClubSelect";
import { apiUrl, fetchClubs, type ClubSummary } from "../../lib/api";
import { COUNTRY_OPTIONS } from "../../lib/countries";
import { ensureTrailingSlash, recordPathForSport } from "../../lib/routes";
import { isSportIdImplementedForRecording } from "../../lib/recording";
import { formatSportName } from "../../lib/sports";
import { loadUserSettings } from "../user-settings";
import {
  ALL_SPORTS,
  MASTER_SPORT,
  SPORTS,
  type LeaderboardSport,
} from "./constants";
import { PREVIOUS_ROUTE_STORAGE_KEY } from "../../lib/navigation-history";

// Identifier type for players
export type ID = string | number;

// Basic leaderboard entry returned by the API
export type Leader = {
  rank: number;
  playerId: ID;
  playerName: string;
  rating?: number | null;
  setsWon?: number;
  setsLost?: number;
  sport?: string;
  sets?: number;
  setDiff?: number;
  highestScore?: number | null;
  averageScore?: number | null;
  matchesPlayed?: number | null;
  standardDeviation?: number | null;
};

type Props = {
  sport: LeaderboardSport;
  country?: string | null;
  clubId?: string | null;
};

type Filters = {
  country: string;
  clubId: string;
};

type FilterErrors = {
  country?: string;
  clubId?: string;
};

const normalizeCountry = (value?: string | null) =>
  value ? value.trim().toUpperCase() : "";

const normalizeClubId = (value?: string | null) =>
  value ? value.trim() : "";

const RESULTS_TABLE_ID = "leaderboard-results";
const RESULTS_TABLE_CAPTION_ID = `${RESULTS_TABLE_ID}-caption`;
const LEADERBOARD_TIMEOUT_MS = 15000;
const PAGE_SIZE = 50;
const VIRTUALIZATION_THRESHOLD = 50;
const VIRTUAL_ROW_HEIGHT = 40;
const MAX_VIRTUALIZED_HEIGHT = 520;

const canonicalizePathname = (pathname: string) => {
  if (pathname === "/" || pathname === "") {
    return "/";
  }
  return pathname.replace(/\/+$/, "") || "/";
};
const getStoredPreviousUrl = (): URL | null => {
  if (typeof window === "undefined") {
    return null;
  }
  let stored = "";
  try {
    stored = window.sessionStorage?.getItem(PREVIOUS_ROUTE_STORAGE_KEY) ?? "";
  } catch {
    stored = "";
  }
  if (!stored) {
    return null;
  }
  try {
    if (/^https?:/i.test(stored)) {
      return new URL(stored);
    }
    return new URL(stored, window.location.origin);
  } catch {
    return null;
  }
};

const SPORT_ICONS: Record<LeaderboardSport, string> = {
  [ALL_SPORTS]: "🏅",
  [MASTER_SPORT]: "🌍",
  bowling: "🎳",
  padel: "🎾",
  padel_americano: "🎾",
  pickleball: "🥒",
  "table-tennis": "🏓",
  disc_golf: "🥏",
};

const getSportDisplayName = (sportId: LeaderboardSport) => {
  if (sportId === ALL_SPORTS) {
    return "All Sports";
  }
  if (sportId === MASTER_SPORT) {
    return "Master";
  }
  return formatSportName(sportId);
};

type EmptyStateContent = {
  icon: string;
  iconLabel: string;
  title: string;
  description: string;
  cta?: { href: string; label: string };
};

const EmptyState = ({
  icon,
  iconLabel,
  title,
  description,
  cta,
}: EmptyStateContent) => (
  <div
    style={{
      marginTop: "2rem",
      padding: "2rem 1.5rem",
      borderRadius: "12px",
      border: "1px solid var(--color-border-subtle)",
      background: "var(--color-surface-elevated)",
      textAlign: "center",
    }}
  >
    <div
      role="img"
      aria-label={iconLabel}
      style={{ fontSize: "2.25rem", marginBottom: "0.75rem" }}
    >
      {icon}
    </div>
    <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>{title}</h2>
    <p
      style={{
        margin: "0 0 1.25rem",
        color: "var(--color-text-muted)",
        fontSize: "0.95rem",
      }}
    >
      {description}
    </p>
    {cta ? (
      <Link
        href={cta.href}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.5rem 1.25rem",
          borderRadius: "999px",
          border: "1px solid var(--color-button-strong-border)",
          background: "var(--color-button-strong-bg)",
          color: "var(--color-button-strong-text)",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        {cta.label}
      </Link>
    ) : null}
  </div>
);

export default function Leaderboard({ sport, country, clubId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams?.toString() ?? "";
  const lastSyncedUrlRef = useRef<string | null>(null);
  const previousUrlRef = useRef<URL | null>(null);
  const homeT = useTranslations("Home");
  const leaderboardT = useTranslations("Leaderboard");
  const backLinkT = useTranslations("BackLink");

  const initialCountry = normalizeCountry(country);
  const initialClubId = normalizeClubId(clubId);

  const [draftCountry, setDraftCountry] = useState(initialCountry);
  const [draftClubId, setDraftClubId] = useState(initialClubId);
  const [filters, setFilters] = useState<Filters>({
    country: initialCountry,
    clubId: initialClubId,
  });
  const [filterErrors, setFilterErrors] = useState<FilterErrors>({});
  const [clubOptions, setClubOptions] = useState<ClubSummary[]>([]);
  const [clubsLoaded, setClubsLoaded] = useState(false);
  const [backLink, setBackLink] = useState<{ href: string; label: string } | null>(
    null,
  );

  const appliedCountry = filters.country;
  const appliedClubId = filters.clubId;

  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  type CachedLeaderboard = {
    leaders: Leader[];
    total: number;
    nextOffset: number;
  };
  const resultsCacheRef = useRef<Map<string, CachedLeaderboard>>(new Map());
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [tableWidth, setTableWidth] = useState(0);
  type SortDirection = "ascending" | "descending";
  type SortableColumn = "rating" | "wins" | "matches";
  const [sortState, setSortState] = useState<
    { column: SortableColumn; direction: SortDirection } | null
  >(null);

  const resultsCount = leaders.length;
  const hasResults = resultsCount > 0;
  const statusMessage = loading
    ? "Loading leaderboard results…"
    : isLoadingMore
      ? "Loading more leaderboard results…"
      : error
      ? `Error loading leaderboard: ${error}`
      : hasResults
        ? `Loaded ${resultsCount} leaderboard ${resultsCount === 1 ? "entry" : "entries"}.`
        : "No leaderboard results available.";

  const getBackLinkLabel = useCallback(
    (rawPathname: string) => {
      const path = canonicalizePathname(rawPathname);
      if (path === "/") {
        return backLinkT("home");
      }
      if (path.startsWith("/matches")) {
        return backLinkT("matches");
      }
      if (path.startsWith("/players")) {
        return backLinkT("players");
      }
      if (path.startsWith("/tournaments")) {
        return backLinkT("tournaments");
      }
      if (path.startsWith("/record")) {
        return backLinkT("record");
      }
      if (path.startsWith("/leaderboard")) {
        return backLinkT("leaderboards");
      }
      if (path.startsWith("/profile")) {
        return backLinkT("profile");
      }
      return backLinkT("back");
    },
    [backLinkT],
  );

  const locationSignature =
    typeof window === "undefined" ? "" : window.location.href;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let currentUrl: URL;
    try {
      currentUrl = new URL(window.location.href);
    } catch {
      return;
    }

    let candidate = previousUrlRef.current ?? getStoredPreviousUrl();
    const currentPath = canonicalizePathname(currentUrl.pathname || "/");
    const currentSearch = currentUrl.search ?? "";
    const currentHash = currentUrl.hash ?? "";
    let nextBackLink: { href: string; label: string } | null = null;

    if (candidate && candidate.origin === currentUrl.origin) {
      const candidatePath = candidate.pathname || "/";
      const refPath = canonicalizePathname(candidatePath);
      const refSearch = candidate.search ?? "";
      const refHash = candidate.hash ?? "";

      if (
        refPath !== currentPath ||
        refSearch !== currentSearch ||
        refHash !== currentHash
      ) {
        const href = `${candidatePath}${candidate.search}${candidate.hash}`;
        const label = getBackLinkLabel(refPath);
        nextBackLink = { href, label };
      }
    }

    setBackLink((prev) => {
      if (!nextBackLink) {
        return prev ? null : prev;
      }
      if (prev && prev.href === nextBackLink.href && prev.label === nextBackLink.label) {
        return prev;
      }
      return nextBackLink;
    });

    previousUrlRef.current = currentUrl;
  }, [getBackLinkLabel, pathname, searchParamsString, locationSignature]);
  const [preferencesApplied, setPreferencesApplied] = useState(false);

  const countryCodes = useMemo(
    () => new Set(COUNTRY_OPTIONS.map((option) => normalizeCountry(option.code))),
    [],
  );

  const clubIds = useMemo(
    () => new Set(clubOptions.map((club) => normalizeClubId(club.id))),
    [clubOptions],
  );

  const clubNameById = useMemo(() => {
    const map = new Map<string, string>();
    clubOptions.forEach((club) => {
      map.set(normalizeClubId(club.id), club.name);
    });
    return map;
  }, [clubOptions]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clubs = await fetchClubs({
          cache: "force-cache",
          next: { revalidate: 3600 },
        });
        if (cancelled) {
          return;
        }
        setClubOptions(clubs);
      } catch (err) {
        if (cancelled) {
          return;
        }
        setClubOptions([]);
        console.error("Failed to load clubs", err);
      } finally {
        if (!cancelled) {
          setClubsLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (country === undefined) {
      return;
    }
    const normalized = normalizeCountry(country);
    setDraftCountry((prev) => (prev === normalized ? prev : normalized));
  }, [country]);

  useEffect(() => {
    if (clubId === undefined) {
      return;
    }
    const normalized = normalizeClubId(clubId);
    setDraftClubId((prev) => (prev === normalized ? prev : normalized));
  }, [clubId]);

  useEffect(() => {
    const hasCountryProp = country !== undefined;
    const hasClubProp = clubId !== undefined;
    if (!hasCountryProp && !hasClubProp) {
      return;
    }

    const normalizedCountry = hasCountryProp
      ? normalizeCountry(country)
      : undefined;
    const normalizedClubId = hasClubProp ? normalizeClubId(clubId) : undefined;

    const sanitizedCountry =
      normalizedCountry === undefined
        ? undefined
        : normalizedCountry === "" || countryCodes.has(normalizedCountry)
          ? normalizedCountry
          : "";

    const sanitizedClubId =
      normalizedClubId === undefined
        ? undefined
        : normalizedClubId === ""
          ? ""
          : clubsLoaded && !clubIds.has(normalizedClubId)
            ? ""
            : normalizedClubId;

    setFilters((prev) => {
      const nextCountry =
        sanitizedCountry === undefined ? prev.country : sanitizedCountry;
      const nextClubId =
        sanitizedClubId === undefined ? prev.clubId : sanitizedClubId;

      if (prev.country === nextCountry && prev.clubId === nextClubId) {
        return prev;
      }
      return { country: nextCountry, clubId: nextClubId };
    });
  }, [clubId, clubsLoaded, clubIds, country, countryCodes]);

  const validateFilters = useCallback(
    (countryCode: string, clubIdentifier: string) => {
      const errors: FilterErrors = {};
      if (countryCode && !countryCodes.has(countryCode)) {
        errors.country = `We don't support country code "${countryCode}". Please pick a country from the list.`;
      }
      if (clubIdentifier && clubsLoaded) {
        if (!clubIds.has(clubIdentifier)) {
          const label = clubNameById.get(clubIdentifier) ?? clubIdentifier;
          errors.clubId = `We don't recognise the club "${label}". Please choose an option from the list.`;
        }
      }
      setFilterErrors(errors);
      return errors;
    },
    [clubIds, clubNameById, clubsLoaded, countryCodes],
  );


  const updateFiltersInQuery = useCallback(
    (nextFilters: Filters) => {
      if (typeof window === "undefined") {
        return;
      }

      const basePath = canonicalizePathname(
        pathname ?? window.location.pathname ?? "/",
      );
      const params = searchParamsString
        ? new URLSearchParams(searchParamsString)
        : new URLSearchParams(window.location.search);

      let changed = false;
      if (nextFilters.country) {
        if (params.get("country") !== nextFilters.country) {
          params.set("country", nextFilters.country);
          changed = true;
        }
      } else if (params.has("country")) {
        params.delete("country");
        changed = true;
      }

      if (nextFilters.clubId) {
        if (params.get("clubId") !== nextFilters.clubId) {
          params.set("clubId", nextFilters.clubId);
          changed = true;
        }
      } else if (params.has("clubId")) {
        params.delete("clubId");
        changed = true;
      }

      const nextSearch = params.toString();
      const nextHref = nextSearch ? `${basePath}?${nextSearch}` : basePath;
      const currentHref = `${window.location.pathname}${window.location.search}`;

      if (!changed && nextHref === currentHref) {
        lastSyncedUrlRef.current = nextHref;
        return;
      }

      if (lastSyncedUrlRef.current === nextHref) {
        return;
      }

      if (nextHref === currentHref) {
        lastSyncedUrlRef.current = nextHref;
        return;
      }

      lastSyncedUrlRef.current = nextHref;
      startTransition(() => {
        router.replace(nextHref, { scroll: false });
      });
    },
    [pathname, router, searchParamsString],
  );

  useEffect(() => {
    updateFiltersInQuery(filters);
  }, [filters, updateFiltersInQuery]);

  useEffect(() => {
    if (preferencesApplied) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const settings = loadUserSettings();
    const preferredSport = settings.defaultLeaderboardSport;
    const preferredCountry = settings.defaultLeaderboardCountry;
    const url = new URL(window.location.href);
    const hasSportParam = url.searchParams.has("sport");
    const hasCountryParam = url.searchParams.has("country");
    const shouldRedirectSport =
      !hasSportParam &&
      preferredSport &&
      preferredSport !== ALL_SPORTS &&
      sport !== preferredSport;

    if (shouldRedirectSport) {
      url.searchParams.set("sport", preferredSport);
    }

    if (!hasCountryParam && preferredCountry) {
      url.searchParams.set("country", preferredCountry);
      if (appliedCountry !== preferredCountry) {
        setDraftCountry(preferredCountry);
        setFilters((prev) =>
          prev.country === preferredCountry
            ? prev
            : { country: preferredCountry, clubId: prev.clubId }
        );
      }
    }

    if (shouldRedirectSport || (!hasCountryParam && preferredCountry)) {
      const base = canonicalizePathname(url.pathname);
      const search = url.searchParams.toString();
      const nextUrl = search ? `${base}?${search}` : base;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (nextUrl !== currentUrl) {
        router.replace(nextUrl, { scroll: false });
      }
    }

    if (shouldRedirectSport) {
      return;
    }

    setPreferencesApplied(true);
  }, [appliedCountry, preferencesApplied, router, sport]);

  const buildUrl = useCallback(
    (sportId: string, pagination?: { limit?: number; offset?: number }) => {
      const params = new URLSearchParams({ sport: sportId });
      if (appliedCountry) params.set("country", appliedCountry);
      if (appliedClubId) params.set("clubId", appliedClubId);
      const limit = pagination?.limit ?? PAGE_SIZE;
      const offset = pagination?.offset ?? 0;
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      return apiUrl(`/v0/leaderboards?${params.toString()}`);
    },
    [appliedCountry, appliedClubId],
  );

  const sportDisplayName = useMemo(
    () => getSportDisplayName(sport),
    [sport],
  );
  const isBowling = sport === "bowling";

  const locale = useLocale();

  const formatInteger = useCallback(
    (value?: number | null) =>
      value == null ? "—" : Math.round(value).toLocaleString(locale),
    [locale],
  );

  const formatRating = useCallback(
    (value?: number | null) =>
      value == null
        ? "—"
        : value.toLocaleString(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
    [locale],
  );

  const formatDecimal = useCallback(
    (value?: number | null) =>
      value == null
        ? "—"
        : value.toLocaleString(locale, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
          }),
    [locale],
  );

  const computeExpectedWinProbability = useCallback(
    (playerRating?: number | null, opponentRating?: number | null) => {
      if (
        typeof playerRating !== "number" ||
        typeof opponentRating !== "number" ||
        !Number.isFinite(playerRating) ||
        !Number.isFinite(opponentRating)
      ) {
        return null;
      }
      const ratingDifference = opponentRating - playerRating;
      const expected = 1 / (1 + 10 ** (ratingDifference / 400));
      return expected;
    },
    [],
  );

  const formatWinProbability = useCallback(
    (value: number | null) =>
      value == null
        ? "—"
        : `${Math.round(value * 100).toLocaleString(locale)}%`,
    [locale],
  );

  const parseLeaderboardResponse = useCallback(
    (raw: unknown, fallbackOffset: number) => {
      if (Array.isArray(raw)) {
        const leaders = raw as Leader[];
        return { leaders, total: leaders.length, offset: fallbackOffset };
      }
      if (raw && typeof raw === "object") {
        const obj = raw as {
          leaders?: Leader[];
          total?: number;
          offset?: number;
        };
        const leaders = Array.isArray(obj.leaders) ? obj.leaders : [];
        const total = typeof obj.total === "number" ? obj.total : leaders.length;
        const offset = typeof obj.offset === "number" ? obj.offset : fallbackOffset;
        return { leaders, total, offset };
      }
      return { leaders: [] as Leader[], total: 0, offset: fallbackOffset };
    },
    [],
  );

  const mergeLeaders = useCallback((existing: Leader[], incoming: Leader[]) => {
    if (!existing.length) {
      return [...incoming];
    }
    if (!incoming.length) {
      return [...existing];
    }
    const byId = new Map<ID, Leader>();
    existing.forEach((leader) => {
      byId.set(leader.playerId, leader);
    });
    incoming.forEach((leader) => {
      byId.set(leader.playerId, leader);
    });
    return Array.from(byId.values()).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  }, []);

  const getCacheKey = useCallback(
    (sportId: LeaderboardSport) =>
      [sportId, appliedCountry || "", appliedClubId || ""].join("::"),
    [appliedCountry, appliedClubId],
  );

  const getCachedLeaders = useCallback(
    (sportId: LeaderboardSport) => resultsCacheRef.current.get(getCacheKey(sportId)),
    [getCacheKey],
  );

  const storeCachedLeaders = useCallback(
    (
      sportId: LeaderboardSport,
      page: { leaders: Leader[]; total: number; offset: number },
    ) => {
      const key = getCacheKey(sportId);
      const previous = resultsCacheRef.current.get(key);
      const merged = mergeLeaders(previous?.leaders ?? [], page.leaders);
      const nextOffset = page.offset + page.leaders.length;
      const total = page.total;
      resultsCacheRef.current.set(key, {
        leaders: merged,
        total,
        nextOffset: Math.max(previous?.nextOffset ?? 0, nextOffset),
      });
    },
    [getCacheKey, mergeLeaders],
  );

  const combineLeaders = useCallback(
    (entries: { sportId: LeaderboardSport; leaders: Leader[] }[]) =>
      entries
        .flatMap(({ sportId, leaders: source }) =>
          source.map((leader) => ({ ...leader, sport: sportId })),
        )
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .map((leader, index) => ({ ...leader, rank: index + 1 })),
    [],
  );

  const computeHasMoreForSport = useCallback(
    (sportId: LeaderboardSport) => {
      if (sportId === ALL_SPORTS) {
        return SPORTS.some((id) => {
          const cached = getCachedLeaders(id);
          return Boolean(cached && cached.nextOffset < cached.total);
        });
      }
      const cached = getCachedLeaders(sportId);
      return Boolean(cached && cached.nextOffset < cached.total);
    },
    [getCachedLeaders],
  );

  const refreshLeadersFromCache = useCallback(
    (sportId: LeaderboardSport) => {
      if (sportId === ALL_SPORTS) {
        const entries = SPORTS.map((id) => ({
          sportId: id,
          leaders: getCachedLeaders(id)?.leaders ?? [],
        }));
        setLeaders(combineLeaders(entries));
        setHasMore(computeHasMoreForSport(ALL_SPORTS));
        return;
      }
      const cached = getCachedLeaders(sportId);
      setLeaders(cached?.leaders ?? []);
      setHasMore(computeHasMoreForSport(sportId));
    },
    [combineLeaders, computeHasMoreForSport, getCachedLeaders],
  );

  useEffect(() => {
    loadMoreAbortRef.current?.abort();
    setIsLoadingMore(false);
  }, [sport, appliedCountry, appliedClubId]);

  type NavItem = { id: LeaderboardSport; label: string };
  const navItems: NavItem[] = useMemo(
    () => [
      { id: ALL_SPORTS, label: getSportDisplayName(ALL_SPORTS) },
      { id: MASTER_SPORT, label: getSportDisplayName(MASTER_SPORT) },
      ...SPORTS.map((id) => ({
        id,
        label: getSportDisplayName(id),
      })),
    ],
    [],
  );

  const tablistRef = useRef<HTMLUListElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const measureOverflow = useCallback(() => {
    const element = tablistRef.current;
    if (!element) {
      setIsOverflowing(false);
      return;
    }
    const overflow = element.scrollWidth - element.clientWidth > 1;
    setIsOverflowing(overflow);
  }, []);

  useEffect(() => {
    measureOverflow();
    const handleResize = () => measureOverflow();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measureOverflow]);

  useEffect(() => {
    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(() => {
        measureOverflow();
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const timeout = window.setTimeout(() => measureOverflow(), 0);
    return () => window.clearTimeout(timeout);
  }, [measureOverflow, sport]);

  const supportsFilters = sport !== MASTER_SPORT;

  const regionQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedCountry) params.set("country", appliedCountry);
    if (appliedClubId) params.set("clubId", appliedClubId);
    return params.toString();
  }, [appliedCountry, appliedClubId]);

  const withRegion = useCallback(
    (base: string) => {
      const normalizedBase = ensureTrailingSlash(base);
      return regionQueryString
        ? `${normalizedBase}${normalizedBase.includes("?") ? "&" : "?"}${regionQueryString}`
        : normalizedBase;
    },
    [regionQueryString],
  );

  const getSportHref = useCallback(
    (sportId: LeaderboardSport) =>
      sportId === ALL_SPORTS
        ? withRegion("/leaderboard?sport=all")
        : withRegion(`/leaderboard?sport=${sportId}`),
    [withRegion],
  );

  const handleSportChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextSport = event.target.value as LeaderboardSport;
      if (!nextSport || nextSport === sport) {
        return;
      }
      const nextHref = getSportHref(nextSport);
      startTransition(() => {
        router.replace(nextHref, { scroll: false });
      });
    },
    [getSportHref, router, sport],
  );

  const regionDescription = useMemo(() => {
    if (sport === MASTER_SPORT) {
      return "Global master leaderboard";
    }
    const parts: string[] = [];
    if (appliedCountry) parts.push(`Country: ${appliedCountry}`);
    if (appliedClubId) parts.push(`Club: ${appliedClubId}`);
    const region = parts.length > 0 ? parts.join(" · ") : "Global";
    return sport === ALL_SPORTS ? `All sports combined · ${region}` : region;
  }, [sport, appliedCountry, appliedClubId]);

  const regionFiltersCaption = useMemo(() => {
    if (sport === MASTER_SPORT) {
      return "Global master leaderboard coverage.";
    }
    const filters: string[] = [];
    if (appliedCountry) {
      filters.push(`country ${appliedCountry}`);
    }
    if (appliedClubId) {
      const clubName = clubNameById.get(appliedClubId);
      filters.push(
        clubName ? `club ${clubName} (${appliedClubId})` : `club ${appliedClubId}`,
      );
    }
    if (filters.length === 0) {
      return "Global results with no region filters.";
    }
    if (filters.length === 1) {
      return `Filtered by ${filters[0]}.`;
    }
    const lastFilter = filters[filters.length - 1];
    const initialFilters = filters.slice(0, -1).join(", ");
    return `Filtered by ${initialFilters} and ${lastFilter}.`;
  }, [appliedClubId, appliedCountry, clubNameById, sport]);

  const tableCaption = useMemo(() => {
    const base =
      sport === ALL_SPORTS
        ? "Leaderboard results across all sports."
        : sport === MASTER_SPORT
          ? "Master leaderboard results."
          : `${sportDisplayName} leaderboard results.`;
    return `${base} ${regionFiltersCaption}`;
  }, [regionFiltersCaption, sport, sportDisplayName]);

  const columnDescription = useMemo(() => {
    if (sport === ALL_SPORTS) {
      return "Columns display rank, player, sport, rating, win chance versus the #1 player, wins, losses, matches, and win percentage.";
    }
    if (isBowling) {
      return "Columns display rank, player, rating, win chance versus the #1 player, highest score, average score, matches played, and score standard deviation.";
    }
    return "Columns display rank, player, rating, win chance versus the #1 player, wins, losses, matches, and win percentage.";
  }, [isBowling, sport]);

  const captionText = useMemo(
    () => `${tableCaption} ${columnDescription}`,
    [columnDescription, tableCaption],
  );

  const topRatedLeader = useMemo<{ playerId: ID; rating: number } | null>(() => {
    let topByRank: { playerId: ID; rating: number } | null = null;
    let topByRating: { playerId: ID; rating: number } | null = null;

    leaders.forEach((leader) => {
      const rating = leader.rating;
      if (typeof rating !== "number" || !Number.isFinite(rating)) {
        return;
      }

      if (leader.rank === 1) {
        topByRank = { playerId: leader.playerId, rating };
      }

      if (!topByRating || rating > topByRating.rating) {
        topByRating = { playerId: leader.playerId, rating };
      }
    });

    return topByRank ?? topByRating;
  }, [leaders]);

  const normalizedDraftCountry = normalizeCountry(draftCountry);
  const normalizedDraftClubId = normalizeClubId(draftClubId);
  const hasDraftChanges =
    normalizedDraftCountry !== appliedCountry ||
    normalizedDraftClubId !== appliedClubId;
  const canApply = supportsFilters && hasDraftChanges;
  const hasDraftValues = Boolean(normalizedDraftCountry || normalizedDraftClubId);
  const hasAppliedFilters = Boolean(appliedCountry || appliedClubId);
  const canClear = supportsFilters
    ? hasDraftValues || hasAppliedFilters
    : hasAppliedFilters;
  useEffect(() => {
    validateFilters(normalizedDraftCountry, normalizedDraftClubId);
  }, [normalizedDraftClubId, normalizedDraftCountry, validateFilters]);
  const countryErrorId = filterErrors.country ? "leaderboard-country-error" : undefined;
  const clubErrorId = filterErrors.clubId ? "leaderboard-club-error" : undefined;

  const getSportIconLabel = useCallback(
    (sportId: LeaderboardSport) => {
      if (sportId === ALL_SPORTS) {
        return homeT("sportsHeading");
      }
      if (sportId === MASTER_SPORT) {
        return "Master leaderboard";
      }
      const normalized = sportId.replace(/-/g, "_");
      try {
        return homeT(`icons.${normalized}`);
      } catch {
        return getSportDisplayName(sportId);
      }
    },
    [homeT],
  );

  const emptyStateContent = useMemo<EmptyStateContent>(() => {
    const icon = SPORT_ICONS[sport] ?? "🏅";
    const iconLabel = getSportIconLabel(sport);
    if (hasAppliedFilters) {
      const title =
        sport === MASTER_SPORT
          ? "No matches on the master leaderboard for this region yet."
          : sport === ALL_SPORTS
            ? "No matches across all sports in this region yet."
            : `No ${sportDisplayName} matches in this region yet.`;
      const description =
        sport === MASTER_SPORT
          ? "Try clearing the filters or check back soon."
          : "Try adjusting the filters or record a new match.";
      let cta: EmptyStateContent["cta"];
      if (sport === MASTER_SPORT) {
        const firstSport = SPORTS[0];
        cta = {
          href: withRegion(`/leaderboard?sport=${firstSport}`),
          label: leaderboardT("emptyState.viewSportLeaderboard", {
            sport: getSportDisplayName(firstSport),
          }),
        };
      } else if (sport === ALL_SPORTS) {
        cta = {
          href: ensureTrailingSlash("/record"),
          label: leaderboardT("emptyState.recordMatch"),
        };
      } else if (SPORTS.includes(sport as (typeof SPORTS)[number])) {
        const normalizedSportId = sport.replace(/-/g, "_");
        if (isSportIdImplementedForRecording(normalizedSportId)) {
          cta = {
            href: recordPathForSport(normalizedSportId),
            label: leaderboardT("emptyState.recordSportMatch", {
              sport: sportDisplayName,
            }),
          };
        } else {
          cta = {
            href: "/record",
            label: leaderboardT("emptyState.recordSportMatch", {
              sport: sportDisplayName,
            }),
          };
        }
      }
      return { icon, iconLabel, title, description, cta };
    }

    const title =
      sport === MASTER_SPORT
        ? "No matches on the master leaderboard yet."
        : sport === ALL_SPORTS
          ? "No matches recorded across all sports yet."
          : `No ${sportDisplayName} matches recorded yet.`;
    const description =
      sport === MASTER_SPORT
        ? "Once players compete across sports, they'll appear here."
        : "Be the first to record one!";

    let cta: EmptyStateContent["cta"]; // eslint-disable-line prefer-const
    if (sport === MASTER_SPORT) {
      const firstSport = SPORTS[0];
      cta = {
        href: withRegion(`/leaderboard?sport=${firstSport}`),
        label: leaderboardT("emptyState.viewSportLeaderboard", {
          sport: getSportDisplayName(firstSport),
        }),
      };
    } else if (sport === ALL_SPORTS) {
      cta = {
        href: ensureTrailingSlash("/record"),
        label: leaderboardT("emptyState.recordMatch"),
      };
    } else if (SPORTS.includes(sport as (typeof SPORTS)[number])) {
      const normalizedSportId = sport.replace(/-/g, "_");
      if (isSportIdImplementedForRecording(normalizedSportId)) {
        cta = {
          href: recordPathForSport(normalizedSportId),
          label: leaderboardT("emptyState.recordSportMatch", {
            sport: sportDisplayName,
          }),
        };
      } else {
        cta = {
          href: "/record",
          label: leaderboardT("emptyState.recordSportMatch", {
            sport: sportDisplayName,
          }),
        };
      }
    }

    return { icon, iconLabel, title, description, cta };
  }, [
    getSportIconLabel,
    hasAppliedFilters,
    leaderboardT,
    sport,
    sportDisplayName,
    withRegion,
  ]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supportsFilters || !hasDraftChanges) {
      return;
    }
    const nextCountry = normalizedDraftCountry;
    const nextClubId = normalizedDraftClubId;
    const errors = validateFilters(nextCountry, nextClubId);
    if (Object.keys(errors).length > 0) {
      return;
    }
    const nextFilters = { country: nextCountry, clubId: nextClubId };
    setDraftCountry(nextCountry);
    setDraftClubId(nextClubId);
    setFilters((prev) =>
      prev.country === nextCountry && prev.clubId === nextClubId
        ? prev
        : nextFilters
    );
    updateFiltersInQuery(nextFilters);
  };

  const handleClear = () => {
    setDraftCountry("");
    setDraftClubId("");
    setFilterErrors({});
    const cleared = { country: "", clubId: "" };
    setFilters((prev) =>
      prev.country === "" && prev.clubId === "" ? prev : cleared
    );
    updateFiltersInQuery(cleared);
  };

  useEffect(() => {
    if (!preferencesApplied) {
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, LEADERBOARD_TIMEOUT_MS);
    (async () => {
      setError(null);
      let hadCachedResultsForCurrentView = false;
      try {
        if (sport === ALL_SPORTS) {
          const cachedEntries = SPORTS.map((s) => {
            const cached = getCachedLeaders(s);
            return cached ? { sportId: s, leaders: cached.leaders } : null;
          }).filter(Boolean) as { sportId: LeaderboardSport; leaders: Leader[] }[];
          const missingSports = SPORTS.filter((s) => !getCachedLeaders(s));

          if (cachedEntries.length > 0) {
            hadCachedResultsForCurrentView = true;
            if (!cancelled) {
              setLeaders(combineLeaders(cachedEntries));
              setHasMore(computeHasMoreForSport(ALL_SPORTS));
              setLoading(missingSports.length > 0);
            }
            if (missingSports.length === 0) {
              return;
            }
          } else {
            setLoading(true);
          }

          // Leaderboard results update with every match, so we skip caching for active sport fetches.
          const results = await Promise.allSettled(
            missingSports.map(async (s) => {
              const res = await fetch(buildUrl(s), {
                cache: "no-store",
                signal: controller.signal,
              });
              if (!res.ok) {
                storeCachedLeaders(s, { leaders: [], total: 0, offset: 0 });
                return;
              }
              const data = await res.json();
              const page = parseLeaderboardResponse(data, 0);
              storeCachedLeaders(s, page);
            }),
          );

          if (cancelled) {
            return;
          }

          refreshLeadersFromCache(ALL_SPORTS);
          hadCachedResultsForCurrentView =
            hadCachedResultsForCurrentView ||
            SPORTS.some(
              (id) => (getCachedLeaders(id)?.leaders.length ?? 0) > 0,
            );
          setLoading(false);

          const rejected = results.filter(
            (result): result is PromiseRejectedResult => result.status === "rejected",
          );

          if (rejected.length > 0) {
            if (rejected.length === 1) {
              throw rejected[0].reason;
            }
            throw new AggregateError(
              rejected.map((result) => result.reason),
              "Failed to load one or more sports",
            );
          }
        } else if (sport === MASTER_SPORT) {
          const cached = getCachedLeaders(MASTER_SPORT);
          if (cached) {
            hadCachedResultsForCurrentView = true;
            if (!cancelled) {
              setLeaders(cached.leaders);
              setHasMore(computeHasMoreForSport(MASTER_SPORT));
              setLoading(false);
            }
            return;
          }
          setLoading(true);
          const res = await fetch(
            apiUrl(`/v0/leaderboards/master?limit=${PAGE_SIZE}&offset=0`),
            {
              cache: "force-cache",
              next: { revalidate: 300 },
              signal: controller.signal,
            },
          );
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const page = parseLeaderboardResponse(data, 0);
          storeCachedLeaders(MASTER_SPORT, page);
          if (!cancelled) {
            setLeaders(page.leaders);
            setHasMore(computeHasMoreForSport(MASTER_SPORT));
          }
        } else {
          const cached = getCachedLeaders(sport);
          if (cached) {
            hadCachedResultsForCurrentView = true;
            if (!cancelled) {
              setLeaders(cached.leaders);
              setHasMore(computeHasMoreForSport(sport));
              setLoading(false);
            }
            return;
          }
          setLoading(true);
          // Live leaderboard data should always be fetched fresh.
          const res = await fetch(buildUrl(sport), {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const page = parseLeaderboardResponse(data, 0);
          storeCachedLeaders(sport, page);
          if (!cancelled) {
            setLeaders(page.leaders);
            setHasMore(computeHasMoreForSport(sport));
          }
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        const abortError = err as DOMException;
        if (abortError?.name === "AbortError" && !didTimeout) {
          return;
        }
        console.error("Failed to load leaderboard", err);
        if (!(sport === ALL_SPORTS && hadCachedResultsForCurrentView)) {
          setLeaders([]);
        }
        const fallbackMessage = didTimeout
          ? "Loading the leaderboard took too long. Please try again."
          : appliedCountry || appliedClubId
            ? "We couldn't load the leaderboard for this region."
            : "We couldn't load the leaderboard right now.";
        setError(fallbackMessage);
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    sport,
    appliedCountry,
    appliedClubId,
    buildUrl,
    preferencesApplied,
    reloadToken,
    getCachedLeaders,
    storeCachedLeaders,
    combineLeaders,
    computeHasMoreForSport,
    parseLeaderboardResponse,
    refreshLeadersFromCache,
  ]);

  const handleRetryLoad = useCallback(() => {
    setReloadToken((prev) => prev + 1);
    setError(null);
    setLoading(true);
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || isLoadingMore || !hasMore) {
      return;
    }
    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = controller;
    setIsLoadingMore(true);
    try {
      if (sport === ALL_SPORTS) {
        // Load-more requests reflect live results, so bypass caches for each sport.
        const sportsToFetch = SPORTS.filter((id) => {
          const cached = getCachedLeaders(id);
          return cached ? cached.nextOffset < cached.total : true;
        });
        if (sportsToFetch.length === 0) {
          setHasMore(false);
          setIsLoadingMore(false);
          return;
        }
        const results = await Promise.allSettled(
          sportsToFetch.map(async (id) => {
            const cached = getCachedLeaders(id);
            const offset = cached?.nextOffset ?? 0;
            if (cached && offset >= cached.total) {
              return;
            }
            const res = await fetch(buildUrl(id, { offset }), {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!res.ok) {
              throw new Error(`${res.status} ${res.statusText}`);
            }
            const data = await res.json();
            const page = parseLeaderboardResponse(data, offset);
            storeCachedLeaders(id, page);
          }),
        );
        if (controller.signal.aborted) {
          return;
        }

        refreshLeadersFromCache(ALL_SPORTS);

        const rejected = results.filter(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (rejected.length > 0) {
          if (rejected.length === 1) {
            throw rejected[0].reason;
          }
          throw new AggregateError(
            rejected.map((result) => result.reason),
            "Failed to load one or more sports",
          );
        }
      } else if (sport === MASTER_SPORT) {
        const cached = getCachedLeaders(MASTER_SPORT);
        const offset = cached?.nextOffset ?? 0;
        if (cached && offset >= cached.total) {
          setHasMore(false);
        } else {
          const res = await fetch(
            apiUrl(`/v0/leaderboards/master?limit=${PAGE_SIZE}&offset=${offset}`),
            {
              cache: "force-cache",
              next: { revalidate: 300 },
              signal: controller.signal,
            },
          );
          if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
          }
          const data = await res.json();
          const page = parseLeaderboardResponse(data, offset);
          storeCachedLeaders(MASTER_SPORT, page);
          if (!controller.signal.aborted) {
            refreshLeadersFromCache(MASTER_SPORT);
          }
        }
      } else {
        const cached = getCachedLeaders(sport);
        const offset = cached?.nextOffset ?? 0;
        if (cached && offset >= cached.total) {
          setHasMore(false);
        } else {
          // Keep paginated leaderboards fresh for in-progress matches.
          const res = await fetch(buildUrl(sport, { offset }), {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
          }
          const data = await res.json();
          const page = parseLeaderboardResponse(data, offset);
          storeCachedLeaders(sport, page);
          if (!controller.signal.aborted) {
            refreshLeadersFromCache(sport);
          }
        }
      }
      if (!controller.signal.aborted) {
        setError(null);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const abortError = err as DOMException;
      if (abortError?.name === "AbortError") {
        return;
      }
      console.error("Failed to load additional leaderboard results", err);
      setError("We couldn't load additional results. Please try again.");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingMore(false);
        setHasMore(computeHasMoreForSport(sport));
      }
    }
  }, [
    loading,
    isLoadingMore,
    hasMore,
    sport,
    getCachedLeaders,
    buildUrl,
    parseLeaderboardResponse,
    storeCachedLeaders,
    refreshLeadersFromCache,
    computeHasMoreForSport,
  ]);

  useEffect(() => () => {
    loadMoreAbortRef.current?.abort();
  }, []);

  const tableStyle = useMemo(
    () => ({
      width: "100%",
      display: "grid",
      fontSize: "0.9rem",
    }),
    [],
  );

  const columnTemplate = useMemo(() => {
    const columns: string[] = [
      "56px",
      "minmax(160px, 1.6fr)",
    ];

    if (sport === ALL_SPORTS) {
      columns.push("minmax(120px, 1fr)");
    }

    columns.push("minmax(90px, 0.7fr)", "minmax(150px, 1fr)");

    if (isBowling) {
      columns.push(
        "minmax(120px, 0.9fr)",
        "minmax(120px, 0.9fr)",
        "minmax(140px, 1fr)",
        "minmax(180px, 1fr)",
      );
    } else {
      columns.push("72px", "72px", "96px", "72px");
    }

    return columns.join(" ");
  }, [isBowling, sport]);

  const headerRowStyle = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: columnTemplate,
      alignItems: "center",
    }),
    [columnTemplate],
  );

  const rowGridStyle = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: columnTemplate,
      alignItems: "center",
      borderTop: "1px solid var(--color-border-subtle)",
      boxSizing: "border-box" as const,
      height: VIRTUAL_ROW_HEIGHT,
    }),
    [columnTemplate],
  );

  const VirtualRowGroup = useMemo(
    () =>
      forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
        (props, ref) => <div ref={ref} role="rowgroup" {...props} />,
      ),
    [],
  );

  const headerCellStyle = useMemo(
    () => ({
      position: "sticky" as const,
      top: 0,
      zIndex: 1,
      textAlign: "left" as const,
      padding: "4px 16px 4px 0",
      background: "var(--leaderboard-table-header-bg)",
    }),
    [],
  );

  const lastHeaderCellStyle = useMemo(
    () => ({
      ...headerCellStyle,
      padding: "4px 0",
    }),
    [headerCellStyle],
  );

  const cellStyle = useMemo(
    () => ({
      padding: "4px 16px 4px 0",
    }),
    [],
  );

  const lastCellStyle = useMemo(
    () => ({
      padding: "4px 0",
    }),
    [],
  );

  const getSortForColumn = useCallback(
    (column: SortableColumn): SortDirection | undefined =>
      sortState?.column === column ? sortState.direction : undefined,
    [sortState],
  );

  const toggleSort = useCallback((column: SortableColumn) => {
    setSortState((prev) => {
      if (!prev || prev.column !== column) {
        return { column, direction: "descending" };
      }
      if (prev.direction === "descending") {
        return { column, direction: "ascending" };
      }
      return null;
    });
  }, []);

  const getAriaSort = useCallback(
    (column: SortableColumn) => getSortForColumn(column) ?? "none",
    [getSortForColumn],
  );

  const renderSortableHeader = useCallback(
    (column: SortableColumn, label: string, style: CSSProperties) => {
      const direction = getSortForColumn(column);
      const ariaSort = getAriaSort(column);
      const actionHint =
        direction === "ascending"
          ? "Currently sorted ascending. Clear sort."
          : direction === "descending"
            ? "Currently sorted descending. Sort ascending."
            : "Not sorted. Sort descending.";
      return (
        <div role="columnheader" aria-sort={ariaSort} style={style}>
          <button
            type="button"
            onClick={() => toggleSort(column)}
            aria-label={`${label}. ${actionHint}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: 0,
              margin: 0,
              border: "none",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            <span>{label}</span>
            <span aria-hidden="true" style={{ fontSize: "0.75em" }}>
              {direction === "ascending"
                ? "▲"
                : direction === "descending"
                  ? "▼"
                  : "↕"}
            </span>
          </button>
        </div>
      );
    },
    [getAriaSort, getSortForColumn, toggleSort],
  );

  const TableHeader = () => (
    <div role="rowgroup">
      <div role="row" style={headerRowStyle}>
        <div
          role="columnheader"
          aria-sort={sortState ? "none" : "ascending"}
          style={headerCellStyle}
        >
          #
        </div>
        <div role="columnheader" style={headerCellStyle}>
          Player
        </div>
        {sport === ALL_SPORTS && (
          <div role="columnheader" style={headerCellStyle}>
            Sport
          </div>
        )}
        {renderSortableHeader("rating", "Rating", headerCellStyle)}
        <div role="columnheader" style={headerCellStyle}>
          Win chance vs #1
        </div>
        {isBowling ? (
          <>
            <div role="columnheader" style={headerCellStyle}>
              Highest score
            </div>
            <div role="columnheader" style={headerCellStyle}>
              Average score
            </div>
            {renderSortableHeader("matches", "Matches played", headerCellStyle)}
            <div role="columnheader" style={lastHeaderCellStyle}>
              Std. deviation (consistency)
            </div>
          </>
        ) : (
          <>
            {renderSortableHeader("wins", "W", headerCellStyle)}
            <div role="columnheader" style={headerCellStyle}>
              L
            </div>
            {renderSortableHeader("matches", "Matches", headerCellStyle)}
            <div role="columnheader" style={lastHeaderCellStyle}>
              Win%
            </div>
          </>
        )}
      </div>
    </div>
  );

  const sortedLeaders = useMemo(() => {
    if (!sortState) {
      return leaders;
    }
    const getComparableValue = (leader: Leader) => {
      switch (sortState.column) {
        case "rating":
          return leader.rating ?? null;
        case "wins":
          return leader.setsWon ?? null;
        case "matches": {
          if (isBowling) {
            return leader.matchesPlayed ?? leader.sets ?? null;
          }
          const won = leader.setsWon ?? 0;
          const lost = leader.setsLost ?? 0;
          const total = won + lost;
          return total === 0 ? 0 : total;
        }
        default:
          return null;
      }
    };
    const normalizeValue = (value: number | null) =>
      typeof value === "number" && Number.isFinite(value) ? value : null;
    const directionFactor = sortState.direction === "ascending" ? 1 : -1;
    return [...leaders].sort((a, b) => {
      const aValue = normalizeValue(getComparableValue(a));
      const bValue = normalizeValue(getComparableValue(b));
      if (aValue == null && bValue == null) {
        return (a.rank ?? 0) - (b.rank ?? 0);
      }
      if (aValue == null) {
        return 1;
      }
      if (bValue == null) {
        return -1;
      }
      if (aValue === bValue) {
        return (a.rank ?? 0) - (b.rank ?? 0);
      }
      return (aValue - bValue) * directionFactor;
    });
  }, [isBowling, leaders, sortState]);

  useEffect(() => {
    const element = tableContainerRef.current;
    if (!element) {
      return;
    }
    const updateWidth = () => {
      const rectWidth = element.getBoundingClientRect().width;
      const scrollWidth = element.scrollWidth;
      setTableWidth(Math.max(rectWidth, scrollWidth));
    };
    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => {
        window.removeEventListener("resize", updateWidth);
      };
    }

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(element);
    return () => observer.disconnect();
  }, [sortedLeaders.length, loading]);

  const shouldVirtualize =
    sortedLeaders.length > VIRTUALIZATION_THRESHOLD && tableWidth > 0;

  const virtualizedListHeight = useMemo(
    () =>
      Math.min(
        sortedLeaders.length * VIRTUAL_ROW_HEIGHT,
        MAX_VIRTUALIZED_HEIGHT,
      ),
    [sortedLeaders.length],
  );

  const buildRow = useCallback(
    (row: Leader, index: number, style?: CSSProperties) => {
      const topRatedPlayerId = topRatedLeader?.playerId;
      const topRatedRating = topRatedLeader?.rating;
      const won = row.setsWon ?? 0;
      const lost = row.setsLost ?? 0;
      const total = won + lost;
      const winPct =
        !isBowling && total > 0 ? Math.round((won / total) * 100) : null;
      const matchesPlayed = row.matchesPlayed ?? row.sets ?? null;
      const highestScore = row.highestScore ?? null;
      const averageScore = row.averageScore ?? null;
      const stdDeviation = row.standardDeviation ?? null;
      const rowSportName = formatSportName(row.sport);
      const winProbability =
        typeof topRatedRating === "number" &&
        Number.isFinite(topRatedRating) &&
        topRatedPlayerId != null &&
        typeof row.rating === "number" &&
        Number.isFinite(row.rating) &&
        row.playerId !== topRatedPlayerId
          ? computeExpectedWinProbability(row.rating, topRatedRating)
          : null;

      const rowKey = `${row.rank}-${row.playerId}-${row.sport ?? ""}`;

      return (
        <div
          key={rowKey}
          role="row"
          style={{
            ...rowGridStyle,
            ...(style ?? {}),
            width: "100%",
            background:
              index % 2 === 1 ? "rgba(10, 31, 68, 0.02)" : "transparent",
          }}
        >
          <div role="cell" style={cellStyle}>
            {sortState ? index + 1 : row.rank}
          </div>
          <div role="cell" style={cellStyle}>
            {row.playerName}
          </div>
          {sport === ALL_SPORTS && (
            <div role="cell" style={cellStyle}>
              {rowSportName}
            </div>
          )}
          <div
            role="cell"
            style={cellStyle}
            title={row.rating != null ? row.rating.toString() : undefined}
          >
            {formatRating(row.rating)}
          </div>
          <div role="cell" style={cellStyle}>
            {formatWinProbability(winProbability)}
          </div>
          {isBowling ? (
            <>
              <div role="cell" style={cellStyle}>
                {formatInteger(highestScore)}
              </div>
              <div role="cell" style={cellStyle}>
                {formatDecimal(averageScore)}
              </div>
              <div role="cell" style={cellStyle}>
                {formatInteger(matchesPlayed)}
              </div>
              <div role="cell" style={lastCellStyle}>
                {formatDecimal(stdDeviation)}
              </div>
            </>
          ) : (
            <>
              <div role="cell" style={cellStyle}>
                {row.setsWon ?? "—"}
              </div>
              <div role="cell" style={cellStyle}>
                {row.setsLost ?? "—"}
              </div>
              <div role="cell" style={cellStyle}>
                {total || "—"}
              </div>
              <div role="cell" style={lastCellStyle}>
                {winPct != null ? `${winPct}%` : "—"}
              </div>
            </>
          )}
        </div>
      );
    },
    [
      cellStyle,
      computeExpectedWinProbability,
      formatDecimal,
      formatInteger,
      formatRating,
      formatWinProbability,
      isBowling,
      lastCellStyle,
      rowGridStyle,
      sortState,
      sport,
      topRatedLeader,
    ],
  );

  const renderVirtualRow = useCallback(
    ({ index, style, data }: ListChildComponentProps<Leader[]>) =>
      buildRow(data[index], index, style),
    [buildRow],
  );

  const handleItemsRendered = useCallback(
    ({ visibleStopIndex }: { visibleStartIndex: number; visibleStopIndex: number }) => {
      if (hasMore && visibleStopIndex >= sortedLeaders.length - 5) {
        loadMore();
      }
    },
    [hasMore, loadMore, sortedLeaders.length],
  );

  useEffect(() => {
    if (!hasMore || shouldVirtualize) {
      return;
    }
    const target = loadMoreRef.current;
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadMore();
        }
      });
    }, { rootMargin: "200px" });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore, leaders.length, shouldVirtualize]);

  return (
    <main className="container">
      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>
      {backLink ? (
        <nav aria-label="Back" style={{ marginBottom: "1rem" }}>
          <Link
            href={backLink.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: "0.9rem",
              color: "var(--color-text-muted)",
              textDecoration: "none",
              gap: "0.25rem",
            }}
          >
            {backLink.label}
          </Link>
        </nav>
      ) : null}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div style={{ flex: "1 1 auto" }}>
          <h1 className="heading" style={{ marginBottom: "0.25rem" }}>
            {`${sportDisplayName} Leaderboard`}
          </h1>
          <p
            style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}
          >
            {regionDescription}
          </p>
        </div>
        <section
          aria-label="Leaderboard controls"
          style={{ flex: "0 0 auto", fontSize: "0.9rem" }}
        >
          <nav
            aria-label="Leaderboard sports"
            aria-controls={RESULTS_TABLE_ID}
            className="leaderboard-nav"
          >
            <ul
              ref={tablistRef}
              role="tablist"
              className={`leaderboard-tablist${
                isOverflowing ? " leaderboard-tablist--overflow" : ""
              }`}
            >
              {navItems.map((item) => {
                const isActive = item.id === sport;
                return (
                  <li key={item.id} className="leaderboard-tablist__item">
                    <Link
                      href={getSportHref(item.id)}
                      role="tab"
                      aria-selected={isActive}
                      aria-current={isActive ? "page" : undefined}
                      aria-controls={RESULTS_TABLE_ID}
                      className={`leaderboard-tab${
                        isActive ? " leaderboard-tab--active" : ""
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {isOverflowing ? (
              <div className="leaderboard-nav-select">
                <label
                  className="leaderboard-nav-select__label"
                  htmlFor="leaderboard-sport-more"
                >
                  More sports
                </label>
                <select
                  id="leaderboard-sport-more"
                  value={sport}
                  onChange={handleSportChange}
                  className="leaderboard-nav-select__control"
                >
                  {navItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </nav>
        </section>
      </header>

      {sport === MASTER_SPORT ? (
        <section
          aria-label="Master leaderboard information"
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            border: "1px solid var(--color-border-subtle)",
            background: "var(--color-surface-elevated)",
          }}
        >
          <h2
            style={{
              margin: "0 0 0.35rem",
              fontSize: "0.95rem",
            }}
          >
            What is the Master leaderboard?
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "0.85rem",
              color: "var(--color-text-muted)",
            }}
          >
            Master leaderboard ranks players across all sports based on combined
            performance.
          </p>
        </section>
      ) : null}

      {supportsFilters ? (
        <form
          onSubmit={handleSubmit}
          aria-label="Leaderboard filters"
          aria-controls={RESULTS_TABLE_ID}
          style={{
            marginTop: "1rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", minWidth: "160px" }}>
            <label
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
              htmlFor="leaderboard-country"
            >
              Country
            </label>
            <CountrySelect
              id="leaderboard-country"
              value={draftCountry}
              onChange={(next) => setDraftCountry(normalizeCountry(next))}
              placeholder="Select a country"
              style={{
                padding: "0.35rem",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "4px",
                background: "var(--color-surface)",
              }}
              aria-invalid={filterErrors.country ? true : undefined}
              aria-describedby={countryErrorId}
            />
            {filterErrors.country ? (
              <p
                id="leaderboard-country-error"
                role="alert"
                style={{
                  marginTop: "0.35rem",
                  fontSize: "0.8rem",
                  color: "var(--color-text-danger-strong)",
                }}
              >
              {filterErrors.country}
            </p>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", minWidth: "220px" }}>
          <label
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
            htmlFor="leaderboard-club-select"
          >
            Club
          </label>
          <ClubSelect
            value={draftClubId}
            onChange={(next) => setDraftClubId(normalizeClubId(next))}
            placeholder="Search for a club"
            searchInputId="leaderboard-club-search"
            selectId="leaderboard-club-select"
            className="leaderboard-club-select"
            invalid={filterErrors.clubId ? true : false}
            describedById={clubErrorId}
            />
            {filterErrors.clubId ? (
              <p
                id="leaderboard-club-error"
                role="alert"
                style={{
                  marginTop: "0.35rem",
                  fontSize: "0.8rem",
                  color: "var(--color-text-danger-strong)",
                }}
              >
                {filterErrors.clubId}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              aria-controls={RESULTS_TABLE_ID}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "4px",
                border: canApply
                  ? "1px solid var(--color-button-primary-border)"
                  : "1px solid var(--color-button-disabled-border)",
                background: canApply
                  ? "var(--color-button-primary-bg)"
                  : "var(--color-button-disabled-bg)",
                color: canApply
                  ? "var(--color-button-primary-text)"
                  : "var(--color-button-disabled-text)",
                cursor: canApply ? "pointer" : "not-allowed",
                opacity: canApply ? 1 : 0.7,
              }}
              disabled={!canApply}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleClear}
              aria-controls={RESULTS_TABLE_ID}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "4px",
                border: "1px solid var(--color-border-subtle)",
                background: "transparent",
                color: "var(--color-text)",
                cursor: canClear ? "pointer" : "not-allowed",
                opacity: canClear ? 1 : 0.7,
              }}
              disabled={!canClear}
            >
              Clear
            </button>
          </div>
        </form>
      ) : (
        <div
          style={{
            marginTop: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <p
            style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", margin: 0 }}
          >
            Regional filters apply to individual sport leaderboards.
          </p>
          {hasAppliedFilters && (
            <div>
              <button
                type="button"
                onClick={handleClear}
                style={{
                  padding: "0.4rem 0.9rem",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border-subtle)",
                  background: "transparent",
                  color: "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                Clear region filters
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="leaderboard-table-wrapper">
          <table
            id={RESULTS_TABLE_ID}
            className="leaderboard-table"
            style={tableStyle}
            aria-labelledby={RESULTS_TABLE_CAPTION_ID}
          >
            <caption id={RESULTS_TABLE_CAPTION_ID} className="sr-only">
              {captionText}
            </caption>
            <TableHeader />
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr
                  key={`skeleton-${i}`}
                  style={{ borderTop: "1px solid var(--color-border-subtle)" }}
                >
                  <td style={cellStyle}>
                    <div className="skeleton" style={{ width: "12px", height: "1em" }} />
                  </td>
                  <td style={cellStyle}>
                    <div className="skeleton" style={{ width: "120px", height: "1em" }} />
                  </td>
                  {sport === ALL_SPORTS && (
                    <td style={cellStyle}>
                      <div className="skeleton" style={{ width: "80px", height: "1em" }} />
                    </td>
                  )}
                  <td style={cellStyle}>
                    <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                  </td>
                  <td style={cellStyle}>
                    <div className="skeleton" style={{ width: "110px", height: "1em" }} />
                  </td>
                  {isBowling ? (
                    <>
                      <td style={cellStyle}>
                        <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                      </td>
                      <td style={cellStyle}>
                        <div className="skeleton" style={{ width: "50px", height: "1em" }} />
                      </td>
                      <td style={cellStyle}>
                        <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                      </td>
                      <td style={lastCellStyle}>
                        <div className="skeleton" style={{ width: "60px", height: "1em" }} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={cellStyle}>
                        <div className="skeleton" style={{ width: "20px", height: "1em" }} />
                      </td>
                      <td style={cellStyle}>
                        <div className="skeleton" style={{ width: "20px", height: "1em" }} />
                      </td>
                      <td style={cellStyle}>
                        <div className="skeleton" style={{ width: "30px", height: "1em" }} />
                      </td>
                      <td style={lastCellStyle}>
                        <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : leaders.length === 0 ? (
        error ? (
          <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            style={{
              marginTop: "1.5rem",
              padding: "1rem",
              borderRadius: "8px",
              border: "1px solid var(--color-feedback-error-border)",
              background: "var(--color-feedback-error-bg)",
              color: "var(--color-feedback-error-text)",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              alignItems: "flex-start",
            }}
          >
            <p style={{ margin: 0 }}>{error}</p>
            <button
              type="button"
              onClick={handleRetryLoad}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                border: "1px solid var(--color-button-outline-border)",
                background: "var(--color-button-outline-bg)",
                color: "var(--color-button-outline-text)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <EmptyState {...emptyStateContent} />
        )
      ) : (
        <div className="leaderboard-table-wrapper">
          <div
            id={RESULTS_TABLE_ID}
            ref={tableContainerRef}
            role="table"
            className="leaderboard-table"
            style={tableStyle}
            aria-labelledby={RESULTS_TABLE_CAPTION_ID}
          >
            <div id={RESULTS_TABLE_CAPTION_ID} className="sr-only">
              {captionText}
            </div>
            <TableHeader />
            {shouldVirtualize ? (
              <FixedSizeList
                height={virtualizedListHeight}
                width={tableWidth}
                itemCount={sortedLeaders.length}
                itemData={sortedLeaders}
                itemSize={VIRTUAL_ROW_HEIGHT}
                onItemsRendered={handleItemsRendered}
                outerElementType={VirtualRowGroup}
                itemKey={(index, data) => {
                  const row = data[index];
                  return `${row.rank}-${row.playerId}-${row.sport ?? ""}`;
                }}
                style={{ overflowX: "hidden" }}
              >
                {renderVirtualRow}
              </FixedSizeList>
            ) : (
              <div role="rowgroup">
                {sortedLeaders.map((row, index) => buildRow(row, index))}
              </div>
            )}
          </div>
          {hasMore && !shouldVirtualize ? (
            <div
              ref={loadMoreRef}
              aria-hidden="true"
              style={{ width: "100%", height: "1px" }}
            />
          ) : null}
        </div>
      )}
      {isLoadingMore ? (
        <p
          aria-live="polite"
          style={{
            marginTop: "0.75rem",
            fontSize: "0.85rem",
            color: "var(--color-text-muted)",
          }}
        >
          Loading more results…
        </p>
      ) : null}
    </main>
  );
}
