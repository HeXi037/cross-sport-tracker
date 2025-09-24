"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiUrl } from "../../lib/api";
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

const canonicalizePathname = (pathname: string) => {
  if (pathname === "/" || pathname === "") {
    return "/";
  }
  return pathname.replace(/\/+$/, "") || "/";
};

const getEmptyStateMessage = (
  sport: LeaderboardSport,
  hasAppliedFilters: boolean,
) => {
  if (hasAppliedFilters) {
    if (sport === MASTER_SPORT) {
      return "The master leaderboard has no results for this region yet. Try clearing the filters or check back soon.";
    }
    if (sport === ALL_SPORTS) {
      return "No matches have been recorded with these filters yet. Try adjusting the filters or check back soon.";
    }
    return `No ${formatSportLabel(
      sport,
    )} matches have been recorded for this region yet. Try clearing the filters or check back soon.`;
  }

  if (sport === MASTER_SPORT) {
    return "The master leaderboard doesn't have any results yet. Check back soon!";
  }

  if (sport === ALL_SPORTS) {
    return "No matches have been recorded yet. Check back soon!";
  }

  return `No ${formatSportLabel(
    sport,
  )} matches have been recorded yet. Check back soon!`;
};

export default function Leaderboard({ sport, country, clubId }: Props) {
  const router = useRouter();

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (filters.country) {
      url.searchParams.set("country", filters.country);
    } else {
      url.searchParams.delete("country");
    }
    if (filters.clubId) {
      url.searchParams.set("clubId", filters.clubId);
    } else {
      url.searchParams.delete("clubId");
    }
    const canonicalPath = canonicalizePathname(url.pathname);
    const nextUrl = `${canonicalPath}${url.search}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [filters.country, filters.clubId, router]);

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

  const supportsFilters = sport !== MASTER_SPORT;

  const regionQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedCountry) params.set("country", appliedCountry);
    if (appliedClubId) params.set("clubId", appliedClubId);
    return params.toString();
  }, [appliedCountry, appliedClubId]);

  const withRegion = (base: string) =>
    regionQueryString
      ? `${base}${base.includes("?") ? "&" : "?"}${regionQueryString}`
      : base;

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

  const emptyStateMessage = useMemo(
    () => getEmptyStateMessage(sport, hasAppliedFilters),
    [sport, hasAppliedFilters],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supportsFilters || !hasDraftChanges) {
      return;
    }
    const nextCountry = normalizedDraftCountry;
    const nextClubId = normalizedDraftClubId;
    setDraftCountry(nextCountry);
    setDraftClubId(nextClubId);
    setFilters((prev) =>
      prev.country === nextCountry && prev.clubId === nextClubId
        ? prev
        : { country: nextCountry, clubId: nextClubId }
    );
  };

  const handleClear = () => {
    setDraftCountry("");
    setDraftClubId("");
    setFilters((prev) =>
      prev.country === "" && prev.clubId === "" ? prev : { country: "", clubId: "" }
    );
  };

  useEffect(() => {
    if (!preferencesApplied) {
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (sport === ALL_SPORTS) {
          const results = await Promise.all(
            SPORTS.map(async (s) => {
              const res = await fetch(buildUrl(s));
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
          const res = await fetch(apiUrl(`/v0/leaderboards/master`));
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const arr = Array.isArray(data) ? data : data.leaders ?? [];
          if (!cancelled) setLeaders(arr as Leader[]);
        } else {
          const res = await fetch(buildUrl(sport));
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const arr = Array.isArray(data) ? data : data.leaders ?? [];
          if (!cancelled) setLeaders(arr as Leader[]);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load leaderboard", err);
          setLeaders([]);
          const fallbackMessage =
            appliedCountry || appliedClubId
              ? "We couldn't load the leaderboard for this region."
              : "We couldn't load the leaderboard right now.";
          setError(fallbackMessage);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sport, appliedCountry, appliedClubId, buildUrl, preferencesApplied]);

  const TableHeader = () => (
    <thead>
      <tr>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>#</th>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>Player</th>
        {sport === ALL_SPORTS && (
          <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>Sport</th>
        )}
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>Rating</th>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>W</th>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>L</th>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>Matches</th>
        <th style={{ textAlign: "left", padding: "4px 0" }}>Win%</th>
      </tr>
    </thead>
  );

  return (
    <main className="container">
      <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <Link href="/matches" style={{ textDecoration: "underline" }}>
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
            Leaderboards
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#555" }}>{regionDescription}</p>
        </div>
        <nav style={{ display: "flex", gap: "0.5rem", fontSize: "0.9rem" }}>
          <Link
            href={withRegion("/leaderboard")}
            style={{ textDecoration: sport === ALL_SPORTS ? "underline" : "none" }}
          >
            All sports (combined)
          </Link>
          <Link
            href={withRegion("/leaderboard?sport=master")}
            style={{ textDecoration: sport === MASTER_SPORT ? "underline" : "none" }}
          >
            Master leaderboard
          </Link>
          {SPORTS.map((s) => (
            <Link
              key={s}
              href={withRegion(`/leaderboard?sport=${s}`)}
              style={{ textDecoration: sport === s ? "underline" : "none" }}
            >
              {s}
            </Link>
          ))}
        </nav>
      </header>

      {supportsFilters ? (
        <form
          onSubmit={handleSubmit}
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
        <p>{error ?? emptyStateMessage}</p>
      ) : (
        <table
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
