"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CountrySelect from "../../components/CountrySelect";
import ClubSelect from "../../components/ClubSelect";
import { apiUrl, fetchClubs, type ClubSummary } from "../../lib/api";
import { COUNTRY_OPTIONS } from "../../lib/countries";
import { ensureTrailingSlash, recordPathForSport } from "../../lib/routes";
import { loadUserSettings } from "../user-settings";
import {
  ALL_SPORTS,
  MASTER_SPORT,
  SPORTS,
  type LeaderboardSport,
} from "./constants";

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

const formatSportLabel = (sportId: string) =>
  sportId
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const RESULTS_TABLE_ID = "leaderboard-results";
const LEADERBOARD_TIMEOUT_MS = 15000;

const canonicalizePathname = (pathname: string) => {
  if (pathname === "/" || pathname === "") {
    return "/";
  }
  return pathname.replace(/\/+$/, "") || "/";
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
  return formatSportLabel(sportId);
};

type EmptyStateContent = {
  icon: string;
  title: string;
  description: string;
  cta?: { href: string; label: string };
};

const EmptyState = ({ icon, title, description, cta }: EmptyStateContent) => (
  <div
    style={{
      marginTop: "2rem",
      padding: "2rem 1.5rem",
      borderRadius: "12px",
      border: "1px solid #e0e0e0",
      background: "#fafafa",
      textAlign: "center",
    }}
  >
    <div aria-hidden style={{ fontSize: "2.25rem", marginBottom: "0.75rem" }}>
      {icon}
    </div>
    <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.25rem" }}>{title}</h2>
    <p style={{ margin: "0 0 1.25rem", color: "#555", fontSize: "0.95rem" }}>
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
          border: "1px solid #222",
          background: "#222",
          color: "#fff",
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

  const appliedCountry = filters.country;
  const appliedClubId = filters.clubId;

  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const resultsCacheRef = useRef<Map<string, Leader[]>>(new Map());

  const resultsCount = leaders.length;
  const hasResults = resultsCount > 0;
  const statusMessage = loading
    ? "Loading leaderboard results…"
    : error
      ? `Error loading leaderboard: ${error}`
      : hasResults
        ? `Loaded ${resultsCount} leaderboard ${resultsCount === 1 ? "entry" : "entries"}.`
        : "No leaderboard results available.";
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
        const clubs = await fetchClubs();
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
    const hasCountryProp = country !== undefined;
    const hasClubProp = clubId !== undefined;
    const nextCountry = hasCountryProp ? normalizeCountry(country) : draftCountry;
    const nextClubId = hasClubProp ? normalizeClubId(clubId) : draftClubId;

    if (hasCountryProp && draftCountry !== nextCountry) {
      setDraftCountry(nextCountry);
    }
    if (hasClubProp && draftClubId !== nextClubId) {
      setDraftClubId(nextClubId);
    }

    if (!hasCountryProp && !hasClubProp) {
      return;
    }

    const sanitizedCountry =
      !nextCountry || countryCodes.has(nextCountry) ? nextCountry : "";
    const sanitizedClubId =
      !nextClubId
        ? ""
        : clubsLoaded && !clubIds.has(nextClubId)
          ? ""
          : nextClubId;

    setFilters((prev) => {
      if (prev.country === sanitizedCountry && prev.clubId === sanitizedClubId) {
        return prev;
      }
      return { country: sanitizedCountry, clubId: sanitizedClubId };
    });
  }, [clubId, clubsLoaded, clubIds, country, countryCodes, draftClubId, draftCountry]);

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
    (sportId: string) => {
      const params = new URLSearchParams({ sport: sportId });
      if (appliedCountry) params.set("country", appliedCountry);
      if (appliedClubId) params.set("clubId", appliedClubId);
      return apiUrl(`/v0/leaderboards?${params.toString()}`);
    },
    [appliedCountry, appliedClubId],
  );

  const sportDisplayName = useMemo(
    () => getSportDisplayName(sport),
    [sport],
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

  const supportsFilters = SPORTS.includes(
    sport as (typeof SPORTS)[number],
  );

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

  const emptyStateContent = useMemo<EmptyStateContent>(() => {
    const icon = SPORT_ICONS[sport] ?? "🏅";
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
          label: `View ${getSportDisplayName(firstSport)} leaderboard`,
        };
      } else if (sport === ALL_SPORTS) {
        cta = {
          href: ensureTrailingSlash("/record"),
          label: "Record a match",
        };
      } else if (SPORTS.includes(sport as (typeof SPORTS)[number])) {
        cta = {
          href: recordPathForSport(sport),
          label: `Record a ${sportDisplayName} match`,
        };
      }
      return { icon, title, description, cta };
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
        label: `View ${getSportDisplayName(firstSport)} leaderboard`,
      };
    } else if (sport === ALL_SPORTS) {
      cta = {
        href: ensureTrailingSlash("/record"),
        label: "Record a match",
      };
    } else if (SPORTS.includes(sport as (typeof SPORTS)[number])) {
      cta = {
        href: recordPathForSport(sport),
        label: `Record a ${sportDisplayName} match`,
      };
    }

    return { icon, title, description, cta };
  }, [sport, hasAppliedFilters, sportDisplayName, withRegion]);

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
      const getCacheKey = (sportId: LeaderboardSport) =>
        [sportId, appliedCountry || "", appliedClubId || ""].join("::");
      const getCachedLeaders = (sportId: LeaderboardSport) =>
        resultsCacheRef.current.get(getCacheKey(sportId));
      const storeCachedLeaders = (
        sportId: LeaderboardSport,
        data: Leader[],
      ) => {
        resultsCacheRef.current.set(getCacheKey(sportId), data);
      };
      const combineLeaders = (
        entries: { sportId: LeaderboardSport; leaders: Leader[] }[],
      ) =>
        entries
          .flatMap(({ sportId, leaders: source }) =>
            source.map((leader) => ({ ...leader, sport: sportId })),
          )
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
          .map((leader, index) => ({ ...leader, rank: index + 1 }));

      setError(null);
      let hadCachedResultsForCurrentView = false;
      try {
        if (sport === ALL_SPORTS) {
          const cachedEntries = SPORTS.map((s) => {
            const cached = getCachedLeaders(s);
            return cached ? { sportId: s, leaders: cached } : null;
          }).filter(Boolean) as { sportId: LeaderboardSport; leaders: Leader[] }[];
          const missingSports = SPORTS.filter(
            (s) => !resultsCacheRef.current.has(getCacheKey(s)),
          );

          if (cachedEntries.length > 0) {
            hadCachedResultsForCurrentView = true;
            const combinedCached = combineLeaders(cachedEntries);
            if (!cancelled) {
              setLeaders(combinedCached);
              setLoading(missingSports.length > 0);
            }
            if (missingSports.length === 0) {
              return;
            }
          } else {
            setLoading(true);
          }

          const fetchedEntries = await Promise.all(
            missingSports.map(async (s) => {
              const res = await fetch(buildUrl(s), {
                signal: controller.signal,
              });
              if (!res.ok) {
                return { sportId: s, leaders: [] as Leader[] };
              }
              const data = await res.json();
              const arr = (Array.isArray(data) ? data : data.leaders ?? []) as Leader[];
              storeCachedLeaders(s, arr);
              return { sportId: s, leaders: arr };
            }),
          );

          const combined = combineLeaders([...cachedEntries, ...fetchedEntries]);
          if (!cancelled) {
            setLeaders(combined);
            setLoading(false);
          }
        } else if (sport === MASTER_SPORT) {
          const cached = getCachedLeaders(MASTER_SPORT);
          if (cached) {
            hadCachedResultsForCurrentView = true;
            if (!cancelled) {
              setLeaders(cached);
              setLoading(false);
            }
            return;
          }
          setLoading(true);
          const res = await fetch(apiUrl(`/v0/leaderboards/master`), {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const arr = (Array.isArray(data) ? data : data.leaders ?? []) as Leader[];
          storeCachedLeaders(MASTER_SPORT, arr);
          if (!cancelled) {
            setLeaders(arr);
          }
        } else {
          const cached = getCachedLeaders(sport);
          if (cached) {
            hadCachedResultsForCurrentView = true;
            if (!cancelled) {
              setLeaders(cached);
              setLoading(false);
            }
            return;
          }
          setLoading(true);
          const res = await fetch(buildUrl(sport), {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const arr = (Array.isArray(data) ? data : data.leaders ?? []) as Leader[];
          storeCachedLeaders(sport, arr);
          if (!cancelled) setLeaders(arr);
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
  }, [sport, appliedCountry, appliedClubId, buildUrl, preferencesApplied]);

  const tableStyle = useMemo(
    () => ({
      width: "100%",
      borderCollapse: "collapse" as const,
      fontSize: "0.9rem",
    }),
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

  const TableHeader = () => (
    <thead>
      <tr>
        <th scope="col" aria-sort="ascending" style={headerCellStyle}>
          #
        </th>
        <th scope="col" style={headerCellStyle}>
          Player
        </th>
        {sport === ALL_SPORTS && (
          <th scope="col" style={headerCellStyle}>
            Sport
          </th>
        )}
        <th scope="col" style={headerCellStyle}>
          Rating
        </th>
        <th scope="col" style={headerCellStyle}>
          W
        </th>
        <th scope="col" style={headerCellStyle}>
          L
        </th>
        <th scope="col" style={headerCellStyle}>
          Matches
        </th>
        <th scope="col" style={lastHeaderCellStyle}>
          Win%
        </th>
      </tr>
    </thead>
  );

  return (
    <main className="container">
      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>
      <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <Link
          href={ensureTrailingSlash("/matches")}
          style={{ textDecoration: "underline" }}
        >
          ← Back to matches
        </Link>
      </div>

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
          <p style={{ fontSize: "0.85rem", color: "#555" }}>{regionDescription}</p>
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
                <label className="sr-only" htmlFor="leaderboard-sport-more">
                  More sports
                </label>
                <select
                  id="leaderboard-sport-more"
                  value={sport}
                  onChange={handleSportChange}
                  aria-label="Select a sport"
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
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }} htmlFor="leaderboard-country">
              Country
            </label>
            <CountrySelect
              id="leaderboard-country"
              value={draftCountry}
              onChange={(next) => setDraftCountry(normalizeCountry(next))}
              placeholder="Select a country"
              style={{ padding: "0.35rem", border: "1px solid #ccc", borderRadius: "4px" }}
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
                  color: "#b91c1c",
                }}
              >
                {filterErrors.country}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: "220px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }} htmlFor="leaderboard-club-search">
              Club
            </label>
            <ClubSelect
              value={draftClubId}
              onChange={(next) => setDraftClubId(normalizeClubId(next))}
              placeholder="Search for a club"
              searchInputId="leaderboard-club-search"
              selectId="leaderboard-club-select"
              ariaLabel="Club"
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
                  color: "#b91c1c",
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
                border: "1px solid #222",
                background: canApply ? "#222" : "#ccc",
                color: "#fff",
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
                border: "1px solid #ccc",
                background: "transparent",
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
          <p style={{ fontSize: "0.8rem", color: "#777", margin: 0 }}>
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
                  border: "1px solid #ccc",
                  background: "transparent",
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
          <table id={RESULTS_TABLE_ID} className="leaderboard-table" style={tableStyle}>
            <TableHeader />
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} style={{ borderTop: "1px solid #ccc" }}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : leaders.length === 0 ? (
        error ? (
          <div
            role="alert"
            style={{
              marginTop: "1.5rem",
              padding: "1rem",
              borderRadius: "8px",
              border: "1px solid #f3c5c5",
              background: "#fff5f5",
              color: "#8a1c1c",
            }}
          >
            {error}
          </div>
        ) : (
          <EmptyState {...emptyStateContent} />
        )
      ) : (
        <div className="leaderboard-table-wrapper">
          <table id={RESULTS_TABLE_ID} className="leaderboard-table" style={tableStyle}>
            <TableHeader />
            <tbody>
              {leaders.map((row) => {
                const won = row.setsWon ?? 0;
                const lost = row.setsLost ?? 0;
                const total = won + lost;
                const winPct = total > 0 ? Math.round((won / total) * 100) : null;
                return (
                  <tr
                    key={`${row.rank}-${row.playerId}-${row.sport ?? ""}`}
                    style={{ borderTop: "1px solid #ccc" }}
                  >
                    <td style={cellStyle}>{row.rank}</td>
                    <td style={cellStyle}>{row.playerName}</td>
                    {sport === ALL_SPORTS && <td style={cellStyle}>{row.sport}</td>}
                    <td style={cellStyle}>
                      {row.rating != null ? Math.round(row.rating) : "—"}
                    </td>
                    <td style={cellStyle}>{row.setsWon ?? "—"}</td>
                    <td style={cellStyle}>{row.setsLost ?? "—"}</td>
                    <td style={cellStyle}>{total || "—"}</td>
                    <td style={lastCellStyle}>{winPct != null ? `${winPct}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
