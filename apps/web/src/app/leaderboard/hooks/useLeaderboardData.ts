import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "../../../lib/api";
import {
  ALL_SPORTS,
  MASTER_SPORT,
  SPORTS,
  type LeaderboardSport,
} from "../constants";

export type ID = string | number;

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

const LEADERBOARD_TIMEOUT_MS = 15000;
const PAGE_SIZE = 50;

type CachedLeaderboard = {
  leaders: Leader[];
  total: number;
  nextOffset: number;
};

type UseLeaderboardDataParams = {
  sport: LeaderboardSport;
  country: string;
  club: string;
  sortState: unknown;
};

const mergeLeaders = (existing: Leader[], incoming: Leader[]) => {
  if (!existing.length) return [...incoming];
  if (!incoming.length) return [...existing];
  const byId = new Map<ID, Leader>();
  existing.forEach((leader) => byId.set(leader.playerId, leader));
  incoming.forEach((leader) => byId.set(leader.playerId, leader));
  return Array.from(byId.values()).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
};

export function useLeaderboardData({
  sport,
  country,
  club,
  sortState,
}: UseLeaderboardDataParams) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const resultsCacheRef = useRef<Map<string, CachedLeaderboard>>(new Map());
  const loadMoreAbortRef = useRef<AbortController | null>(null);

  const buildUrl = useCallback(
    (sportId: string, pagination?: { limit?: number; offset?: number }) => {
      const params = new URLSearchParams({ sport: sportId });
      if (country) params.set("country", country);
      if (club) params.set("clubId", club);
      const limit = pagination?.limit ?? PAGE_SIZE;
      const offset = pagination?.offset ?? 0;
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      return apiUrl(`/v0/leaderboards?${params.toString()}`);
    },
    [country, club],
  );

  const parseLeaderboardResponse = useCallback((raw: unknown, fallbackOffset: number) => {
    if (Array.isArray(raw)) {
      const parsedLeaders = raw as Leader[];
      return { leaders: parsedLeaders, total: parsedLeaders.length, offset: fallbackOffset };
    }
    if (raw && typeof raw === "object") {
      const obj = raw as { leaders?: Leader[]; total?: number; offset?: number };
      const parsedLeaders = Array.isArray(obj.leaders) ? obj.leaders : [];
      const total = typeof obj.total === "number" ? obj.total : parsedLeaders.length;
      const offset = typeof obj.offset === "number" ? obj.offset : fallbackOffset;
      return { leaders: parsedLeaders, total, offset };
    }
    return { leaders: [] as Leader[], total: 0, offset: fallbackOffset };
  }, []);

  const getCacheKey = useCallback(
    (sportId: LeaderboardSport) => [sportId, country || "", club || ""].join("::"),
    [country, club],
  );

  const getCachedLeaders = useCallback(
    (sportId: LeaderboardSport) => resultsCacheRef.current.get(getCacheKey(sportId)),
    [getCacheKey],
  );

  const storeCachedLeaders = useCallback(
    (sportId: LeaderboardSport, page: { leaders: Leader[]; total: number; offset: number }) => {
      const key = getCacheKey(sportId);
      const previous = resultsCacheRef.current.get(key);
      const merged = mergeLeaders(previous?.leaders ?? [], page.leaders);
      const nextOffset = page.offset + page.leaders.length;
      resultsCacheRef.current.set(key, {
        leaders: merged,
        total: page.total,
        nextOffset: Math.max(previous?.nextOffset ?? 0, nextOffset),
      });
    },
    [getCacheKey],
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
  }, [sport, country, club]);

  useEffect(() => {
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
            if (missingSports.length === 0) return;
          } else {
            setLoading(true);
          }

          const results = await Promise.allSettled(
            missingSports.map(async (s) => {
              const res = await fetch(buildUrl(s), { cache: "no-store", signal: controller.signal });
              if (!res.ok) {
                storeCachedLeaders(s, { leaders: [], total: 0, offset: 0 });
                return;
              }
              const data = await res.json();
              const page = parseLeaderboardResponse(data, 0);
              storeCachedLeaders(s, page);
            }),
          );

          if (cancelled) return;
          refreshLeadersFromCache(ALL_SPORTS);
          hadCachedResultsForCurrentView =
            hadCachedResultsForCurrentView || SPORTS.some((id) => (getCachedLeaders(id)?.leaders.length ?? 0) > 0);
          setLoading(false);

          const rejected = results.filter(
            (result): result is PromiseRejectedResult => result.status === "rejected",
          );
          if (rejected.length > 0) {
            if (rejected.length === 1) throw rejected[0].reason;
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
          const res = await fetch(apiUrl(`/v0/leaderboards/master?limit=${PAGE_SIZE}&offset=0`), {
            cache: "force-cache",
            next: { revalidate: 300 },
            signal: controller.signal,
          });
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
          const res = await fetch(buildUrl(sport), { cache: "no-store", signal: controller.signal });
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
        if (cancelled) return;
        const abortError = err as DOMException;
        if (abortError?.name === "AbortError" && !didTimeout) return;
        console.error("Failed to load leaderboard", err);
        if (!(sport === ALL_SPORTS && hadCachedResultsForCurrentView)) {
          setLeaders([]);
        }
        const fallbackMessage = didTimeout
          ? "Loading the leaderboard took too long. Please try again."
          : country || club
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
    country,
    club,
    sortState,
    reloadToken,
    buildUrl,
    combineLeaders,
    computeHasMoreForSport,
    getCachedLeaders,
    parseLeaderboardResponse,
    refreshLeadersFromCache,
    storeCachedLeaders,
  ]);

  const loadMore = useCallback(async () => {
    if (loading || isLoadingMore || !hasMore) return;
    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = controller;
    setIsLoadingMore(true);
    try {
      if (sport === ALL_SPORTS) {
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
            if (cached && offset >= cached.total) return;
            const res = await fetch(buildUrl(id, { offset }), {
              cache: "no-store",
              signal: controller.signal,
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const data = await res.json();
            const page = parseLeaderboardResponse(data, offset);
            storeCachedLeaders(id, page);
          }),
        );
        if (controller.signal.aborted) return;
        refreshLeadersFromCache(ALL_SPORTS);

        const rejected = results.filter(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (rejected.length > 0) {
          if (rejected.length === 1) throw rejected[0].reason;
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
          const res = await fetch(apiUrl(`/v0/leaderboards/master?limit=${PAGE_SIZE}&offset=${offset}`), {
            cache: "force-cache",
            next: { revalidate: 300 },
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const page = parseLeaderboardResponse(data, offset);
          storeCachedLeaders(MASTER_SPORT, page);
          if (!controller.signal.aborted) refreshLeadersFromCache(MASTER_SPORT);
        }
      } else {
        const cached = getCachedLeaders(sport);
        const offset = cached?.nextOffset ?? 0;
        if (cached && offset >= cached.total) {
          setHasMore(false);
        } else {
          const res = await fetch(buildUrl(sport, { offset }), {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const page = parseLeaderboardResponse(data, offset);
          storeCachedLeaders(sport, page);
          if (!controller.signal.aborted) refreshLeadersFromCache(sport);
        }
      }
      if (!controller.signal.aborted) setError(null);
    } catch (err) {
      if (controller.signal.aborted) return;
      const abortError = err as DOMException;
      if (abortError?.name === "AbortError") return;
      console.error("Failed to load additional leaderboard results", err);
      setError("We couldn't load additional results. Please try again.");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoadingMore(false);
        setHasMore(computeHasMoreForSport(sport));
      }
    }
  }, [
    buildUrl,
    computeHasMoreForSport,
    getCachedLeaders,
    hasMore,
    isLoadingMore,
    loading,
    parseLeaderboardResponse,
    refreshLeadersFromCache,
    sport,
    storeCachedLeaders,
  ]);

  useEffect(() => () => {
    loadMoreAbortRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    setReloadToken((prev) => prev + 1);
    setError(null);
    setLoading(true);
  }, []);

  return {
    leaders,
    loading,
    error,
    hasMore,
    isLoadingMore,
    loadMore,
    retry,
    metadata: {
      pageSize: PAGE_SIZE,
    },
  };
}
