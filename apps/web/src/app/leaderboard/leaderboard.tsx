"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChangeEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CountrySelect from "../../components/filters/CountrySelect";
import ClubSelect from "../../components/filters/ClubSelect";
import { fetchClubs, type ClubSummary } from "../../lib/api";
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
import EmptyState, { type EmptyStateContent } from "./components/EmptyState";
import LeaderboardTable from "./components/LeaderboardTable";
import { PREVIOUS_ROUTE_STORAGE_KEY } from "../../lib/navigation-history";
import { useLeaderboardData, type Leader } from "./hooks/useLeaderboardData";
import { useSorting } from "./hooks/useSorting";
import {
  getSortComparableValue,
  getWinProbabilityAgainstTopPlayer,
  selectTopRatedLeader,
} from "./lib/leaderboardMetrics";

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

  const { sortState, toggleSort, getSortForColumn, getSortPriority, getAriaSort } =
    useSorting([]);
  const previousFilterPropsRef = useRef<{
    country?: string | null;
    clubId?: string | null;
  } | null>(null);
  const { leaders, loading, error, hasMore, isLoadingMore, loadMore, retry } =
    useLeaderboardData({
      sport,
      country: appliedCountry,
      club: appliedClubId,
      sortState,
    });


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

    const candidate = previousUrlRef.current ?? getStoredPreviousUrl();
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

  const clubScopeSport = useMemo(() => {
    if (sport === ALL_SPORTS || sport === MASTER_SPORT) {
      return "";
    }
    return sport;
  }, [sport]);

  const clubScopeCountry = normalizeCountry(appliedCountry);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const clubs = await fetchClubs({
          sport: clubScopeSport || undefined,
          country: clubScopeCountry || undefined,
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
  }, [clubScopeCountry, clubScopeSport]);

  useEffect(() => {
    const hasCountryProp = country !== undefined;
    const hasClubProp = clubId !== undefined;
    if (!hasCountryProp && !hasClubProp) {
      return;
    }
    const previousFilterProps = previousFilterPropsRef.current;
    const shouldSyncFromProps =
      !previousFilterProps ||
      previousFilterProps.country !== country ||
      previousFilterProps.clubId !== clubId;
    previousFilterPropsRef.current = { country, clubId };

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

    const nextErrors: FilterErrors = {};
    if (
      normalizedCountry !== undefined &&
      normalizedCountry !== "" &&
      !countryCodes.has(normalizedCountry)
    ) {
      nextErrors.country = `We don't support country code "${normalizedCountry}". Please pick a country from the list.`;
    }
    if (
      normalizedClubId !== undefined &&
      normalizedClubId !== "" &&
      !nextErrors.country &&
      clubsLoaded &&
      !clubIds.has(normalizedClubId)
    ) {
      const label = clubNameById.get(normalizedClubId) ?? normalizedClubId;
      nextErrors.clubId = `We don't recognise the club "${label}". Please choose an option from the list.`;
    }
    setFilterErrors(nextErrors);

    if (!shouldSyncFromProps) {
      return;
    }

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
  }, [clubId, clubsLoaded, clubIds, clubNameById, country, countryCodes]);

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
    if (!clubsLoaded) {
      return;
    }
    const isAppliedCountryScope = appliedCountry === clubScopeCountry;
    if (isAppliedCountryScope && appliedClubId && !clubIds.has(appliedClubId)) {
      const nextFilters = { country: appliedCountry, clubId: "" };
      setFilters((prev) =>
        prev.clubId === "" ? prev : { country: prev.country, clubId: "" }
      );
      updateFiltersInQuery(nextFilters);
    }
  }, [
    appliedClubId,
    appliedCountry,
    clubIds,
    clubScopeCountry,
    clubsLoaded,
    updateFiltersInQuery,
  ]);

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

  const handleSportSelect = useCallback(
    (nextSport: LeaderboardSport) => {
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

  const handleSportChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextSport = event.target.value as LeaderboardSport;
      handleSportSelect(nextSport);
    },
    [handleSportSelect],
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

  const topRatedLeader = useMemo(() => selectTopRatedLeader(leaders), [leaders]);

  const hasAppliedFilters = Boolean(appliedCountry || appliedClubId);
  const canClear = hasAppliedFilters;
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

  const handleCountryChange = useCallback(
    (next: string) => {
      const normalizedCountry = normalizeCountry(next);
      const normalizedCurrentClubId = normalizeClubId(appliedClubId);

      let nextFilters: Filters = {
        country: normalizedCountry,
        clubId: normalizedCurrentClubId,
      };
      let errors = validateFilters(nextFilters.country, nextFilters.clubId);

      if (errors.country) {
        return;
      }

      if (errors.clubId) {
        nextFilters = { ...nextFilters, clubId: "" };
        errors = validateFilters(nextFilters.country, nextFilters.clubId);
        if (errors.country || errors.clubId) {
          return;
        }
      }

      setFilters((prev) =>
        prev.country === nextFilters.country && prev.clubId === nextFilters.clubId
          ? prev
          : nextFilters
      );
      updateFiltersInQuery(nextFilters);
    },
    [appliedClubId, updateFiltersInQuery, validateFilters],
  );

  const handleClubChange = useCallback(
    (next: string) => {
      const nextFilters: Filters = {
        country: appliedCountry,
        clubId: normalizeClubId(next),
      };
      const errors = validateFilters(nextFilters.country, nextFilters.clubId);
      if (errors.country || errors.clubId) {
        return;
      }
      setFilters((prev) =>
        prev.country === nextFilters.country && prev.clubId === nextFilters.clubId
          ? prev
          : nextFilters
      );
      updateFiltersInQuery(nextFilters);
    },
    [appliedCountry, updateFiltersInQuery, validateFilters],
  );

  const handleClear = () => {
    setFilterErrors({});
    const cleared = { country: "", clubId: "" };
    setFilters((prev) =>
      prev.country === "" && prev.clubId === "" ? prev : cleared
    );
    updateFiltersInQuery(cleared);
  };

  const tableStyle = useMemo(
    () => ({
      width: "100%",
      display: "grid",
      fontSize: "0.9rem",
    }),
    [],
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

  const sortCollator = useMemo(
    () =>
      new Intl.Collator(locale, {
        usage: "sort",
        sensitivity: "base",
        numeric: true,
      }),
    [locale],
  );

  const winProbabilityByPlayerId = useMemo(
    () =>
      new Map(
        leaders.map((leader) => [
          leader.playerId,
          getWinProbabilityAgainstTopPlayer(
            leader,
            topRatedLeader,
            computeExpectedWinProbability,
          ),
        ]),
      ),
    [computeExpectedWinProbability, leaders, sport, topRatedLeader],
  );

  const getWinProbability = useCallback(
    (leader: Leader) => winProbabilityByPlayerId.get(leader.playerId) ?? null,
    [winProbabilityByPlayerId],
  );

  const sortedLeaders = useMemo(() => {
    if (sortState.length === 0) {
      return leaders;
    }
    return [...leaders].sort((a, b) => {
      for (const criterion of sortState) {
        const aValue = getSortComparableValue({
          leader: a,
          column: criterion.column,
          isBowling,
          formatSportName,
          getWinProbability,
        });
        const bValue = getSortComparableValue({
          leader: b,
          column: criterion.column,
          isBowling,
          formatSportName,
          getWinProbability,
        });
        if (aValue == null && bValue == null) {
          continue;
        }
        if (aValue == null) {
          return 1;
        }
        if (bValue == null) {
          return -1;
        }
        const directionFactor = criterion.direction === "ascending" ? 1 : -1;
        if (typeof aValue === "string" || typeof bValue === "string") {
          const result = sortCollator.compare(String(aValue), String(bValue));
          if (result !== 0) {
            return result * directionFactor;
          }
          continue;
        }
        if (aValue === bValue) {
          continue;
        }
        const aNumber =
          typeof aValue === "number" && Number.isFinite(aValue) ? aValue : null;
        const bNumber =
          typeof bValue === "number" && Number.isFinite(bValue) ? bValue : null;
        if (aNumber == null && bNumber == null) {
          continue;
        }
        if (aNumber == null) {
          return 1;
        }
        if (bNumber == null) {
          return -1;
        }
        return (aNumber - bNumber) * directionFactor;
      }
      return (a.rank ?? 0) - (b.rank ?? 0);
    });
  }, [formatSportName, getWinProbability, isBowling, leaders, sortCollator, sortState]);


  return (
    <main className="container container--wide">
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
            className={`leaderboard-nav${isOverflowing ? " leaderboard-nav--overflow" : ""}`}
          >
            {isOverflowing ? (
              <div className="leaderboard-nav-select leaderboard-nav-select--primary">
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
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-current={isActive ? "page" : undefined}
                      aria-controls={RESULTS_TABLE_ID}
                      className={`leaderboard-tab${
                        isActive ? " leaderboard-tab--active" : ""
                      }`}
                      onClick={() => handleSportSelect(item.id)}
                    >
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
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
              value={appliedCountry}
              onChange={handleCountryChange}
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
            value={appliedClubId}
            onChange={handleClubChange}
            options={clubOptions}
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
              aria-label="Reset filters"
            >
              Reset filters
            </button>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "0.8rem",
              color: "var(--color-text-muted)",
            }}
          >
            Filters apply automatically.
          </p>
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
                aria-label="Reset filters"
                style={{
                  padding: "0.4rem 0.9rem",
                  borderRadius: "4px",
                  border: "1px solid var(--color-border-subtle)",
                  background: "transparent",
                  color: "var(--color-text)",
                  cursor: "pointer",
                }}
              >
                Reset filters
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
              onClick={retry}
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
        <LeaderboardTable
          leaders={sortedLeaders}
          sport={sport}
          isBowling={isBowling}
          sortState={sortState}
          onSortChange={toggleSort}
          getSortForColumn={getSortForColumn}
          getSortPriority={getSortPriority}
          getAriaSort={getAriaSort}
          captionText={captionText}
          resultsTableId={RESULTS_TABLE_ID}
          resultsTableCaptionId={RESULTS_TABLE_CAPTION_ID}
          formatSportName={formatSportName}
          formatInteger={formatInteger}
          formatRating={formatRating}
          formatDecimal={formatDecimal}
          formatWinProbability={formatWinProbability}
          getWinProbability={getWinProbability}
          hasMore={hasMore}
          loadMore={loadMore}
        />
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
