"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { apiUrl } from "../../lib/api";
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
  padel: "🎾",
  badminton: "🏸",
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

  const appliedCountry = filters.country;
  const appliedClubId = filters.clubId;

  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    const nextCountry = normalizeCountry(country);
    const nextClubId = normalizeClubId(clubId);
    setDraftCountry(nextCountry);
    setDraftClubId(nextClubId);
    setFilters((prev) =>
      prev.country === nextCountry && prev.clubId === nextClubId
        ? prev
        : { country: nextCountry, clubId: nextClubId }
    );
  }, [country, clubId]);

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

  const navItems = useMemo(
    () => [
      { id: ALL_SPORTS, label: getSportDisplayName(ALL_SPORTS) },
      { id: MASTER_SPORT, label: getSportDisplayName(MASTER_SPORT) },
      ...SPORTS.map((id) => ({ id, label: getSportDisplayName(id) })),
    ],
    [],
  );

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
      setLoading(true);
      setError(null);
      try {
        if (sport === ALL_SPORTS) {
          const results = await Promise.all(
            SPORTS.map(async (s) => {
              const res = await fetch(buildUrl(s), {
                signal: controller.signal,
              });
              if (!res.ok) return [] as Leader[];
              const data = await res.json();
              const arr = Array.isArray(data) ? data : data.leaders ?? [];
              return (arr as Leader[]).map((l) => ({ ...l, sport: s }));
            })
          );
          const combined = results
            .flat()
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
            .map((l, i) => ({ ...l, rank: i + 1 }));
          if (!cancelled) setLeaders(combined);
        } else if (sport === MASTER_SPORT) {
          const res = await fetch(apiUrl(`/v0/leaderboards/master`), {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const arr = Array.isArray(data) ? data : data.leaders ?? [];
          if (!cancelled) setLeaders(arr as Leader[]);
        } else {
          const res = await fetch(buildUrl(sport), {
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const arr = Array.isArray(data) ? data : data.leaders ?? [];
          if (!cancelled) setLeaders(arr as Leader[]);
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
        setLeaders([]);
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

  const TableHeader = () => (
    <thead>
      <tr>
        <th
          scope="col"
          aria-sort="ascending"
          style={{ textAlign: "left", padding: "4px 16px 4px 0" }}
        >
          #
        </th>
        <th scope="col" style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>
          Player
        </th>
        {sport === ALL_SPORTS && (
          <th
            scope="col"
            style={{ textAlign: "left", padding: "4px 16px 4px 0" }}
          >
            Sport
          </th>
        )}
        <th
          scope="col"
          style={{ textAlign: "left", padding: "4px 16px 4px 0" }}
        >
          Rating
        </th>
        <th
          scope="col"
          style={{ textAlign: "left", padding: "4px 16px 4px 0" }}
        >
          W
        </th>
        <th
          scope="col"
          style={{ textAlign: "left", padding: "4px 16px 4px 0" }}
        >
          L
        </th>
        <th
          scope="col"
          style={{ textAlign: "left", padding: "4px 16px 4px 0" }}
        >
          Matches
        </th>
        <th scope="col" style={{ textAlign: "left", padding: "4px 0" }}>
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
          >
            <ul
              role="tablist"
              style={{
                display: "flex",
                gap: "0.5rem",
                padding: 0,
                margin: 0,
                listStyle: "none",
              }}
            >
              {navItems.map((item) => {
                const isActive = item.id === sport;
                return (
                  <li key={item.id}>
                    <Link
                      href={
                        item.id === ALL_SPORTS
                          ? withRegion("/leaderboard?sport=all")
                          : withRegion(`/leaderboard?sport=${item.id}`)
                      }
                      role="tab"
                      aria-selected={isActive}
                      aria-current={isActive ? "page" : undefined}
                      aria-controls={RESULTS_TABLE_ID}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0.35rem 0.85rem",
                        borderRadius: "999px",
                        border: "1px solid",
                        borderColor: isActive ? "#222" : "#ccc",
                        background: isActive ? "#222" : "transparent",
                        color: isActive ? "#fff" : "#222",
                        fontWeight: isActive ? 600 : 500,
                        textDecoration: "none",
                        transition: "background 0.2s ease, color 0.2s ease",
                      }}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
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
          <div style={{ display: "flex", flexDirection: "column", minWidth: "120px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }} htmlFor="leaderboard-country">
              Country
            </label>
            <input
              id="leaderboard-country"
              value={draftCountry}
              onChange={(event) => setDraftCountry(event.target.value.toUpperCase())}
              placeholder="e.g. SE"
              maxLength={5}
              style={{ padding: "0.35rem", border: "1px solid #ccc", borderRadius: "4px" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: "140px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 600 }} htmlFor="leaderboard-club">
              Club
            </label>
            <input
              id="leaderboard-club"
              value={draftClubId}
              onChange={(event) => setDraftClubId(event.target.value)}
              placeholder="e.g. club-123"
              style={{ padding: "0.35rem", border: "1px solid #ccc", borderRadius: "4px" }}
            />
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
        <table
          id={RESULTS_TABLE_ID}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "1rem",
            fontSize: "0.9rem",
          }}
        >
          <TableHeader />
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skeleton-${i}`} style={{ borderTop: "1px solid #ccc" }}>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "12px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "120px", height: "1em" }} />
                </td>
                {sport === ALL_SPORTS && (
                  <td style={{ padding: "4px 16px 4px 0" }}>
                    <div className="skeleton" style={{ width: "80px", height: "1em" }} />
                  </td>
                )}
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "20px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "20px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "30px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 0" }}>
                  <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <table
          id={RESULTS_TABLE_ID}
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "1rem",
            fontSize: "0.9rem",
          }}
        >
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
                  <td style={{ padding: "4px 16px 4px 0" }}>{row.rank}</td>
                  <td style={{ padding: "4px 16px 4px 0" }}>{row.playerName}</td>
                  {sport === ALL_SPORTS && (
                    <td style={{ padding: "4px 16px 4px 0" }}>{row.sport}</td>
                  )}
                  <td style={{ padding: "4px 16px 4px 0" }}>
                    {row.rating != null ? Math.round(row.rating) : "—"}
                  </td>
                  <td style={{ padding: "4px 16px 4px 0" }}>{row.setsWon ?? "—"}</td>
                  <td style={{ padding: "4px 16px 4px 0" }}>{row.setsLost ?? "—"}</td>
                  <td style={{ padding: "4px 16px 4px 0" }}>{total || "—"}</td>
                  <td style={{ padding: "4px 0" }}>
                    {winPct != null ? `${winPct}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
