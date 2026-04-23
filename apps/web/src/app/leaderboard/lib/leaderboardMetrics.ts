import type { Leader, ID } from "../hooks/useLeaderboardData";
import type { SortableColumn } from "../hooks/useSorting";

type TopRatedLeader = { playerId: ID; rating: number };

type WinProbabilityComputer = (
  playerRating: number | null | undefined,
  opponentRating: number | null | undefined,
) => number | null;

export type LeaderDerivedMetrics = {
  matchesTotal: number;
  winPercentage: number | null;
  bowlingMatchesPlayed: number | null;
};

const leaderDerivedMetricsCache = new WeakMap<Leader, LeaderDerivedMetrics>();
const topRatedLeaderCache = new WeakMap<Leader[], TopRatedLeader | null>();

export const getMatchesTotal = (leader: Leader): number => {
  const won = leader.setsWon ?? 0;
  const lost = leader.setsLost ?? 0;
  return won + lost;
};

export const getWinPercentage = (leader: Leader): number | null => {
  const total = getMatchesTotal(leader);
  if (total === 0) {
    return null;
  }
  return ((leader.setsWon ?? 0) / total) * 100;
};

export const getBowlingMatchesPlayed = (leader: Leader): number | null =>
  leader.matchesPlayed ?? leader.sets ?? null;

export const selectLeaderDerivedMetrics = (leader: Leader): LeaderDerivedMetrics => {
  const cached = leaderDerivedMetricsCache.get(leader);
  if (cached) {
    return cached;
  }

  const next = {
    matchesTotal: getMatchesTotal(leader),
    winPercentage: getWinPercentage(leader),
    bowlingMatchesPlayed: getBowlingMatchesPlayed(leader),
  };

  leaderDerivedMetricsCache.set(leader, next);
  return next;
};

export const selectTopRatedLeader = (leaders: Leader[]): TopRatedLeader | null => {
  const cached = topRatedLeaderCache.get(leaders);
  if (cached !== undefined) {
    return cached;
  }

  let topByRank: TopRatedLeader | null = null;
  let topByRating: TopRatedLeader | null = null;

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

  const selected = topByRank ?? topByRating;
  topRatedLeaderCache.set(leaders, selected);
  return selected;
};

export const getWinProbabilityAgainstTopPlayer = (
  leader: Leader,
  topRatedLeader: TopRatedLeader | null,
  computeExpectedWinProbability: WinProbabilityComputer,
): number | null => {
  const topRatedPlayerId = topRatedLeader?.playerId;
  const topRatedRating = topRatedLeader?.rating;
  if (
    typeof topRatedRating !== "number" ||
    !Number.isFinite(topRatedRating) ||
    topRatedPlayerId == null
  ) {
    return null;
  }
  if (leader.playerId === topRatedPlayerId) {
    return null;
  }

  return computeExpectedWinProbability(leader.rating, topRatedRating);
};

type ComparableValueOptions = {
  leader: Leader;
  column: SortableColumn;
  isBowling: boolean;
  formatSportName: (sportId: string | null | undefined) => string;
  getWinProbability: (leader: Leader) => number | null;
};

export const getSortComparableValue = ({
  leader,
  column,
  isBowling,
  formatSportName,
  getWinProbability,
}: ComparableValueOptions): number | string | null => {
  const metrics = selectLeaderDerivedMetrics(leader);

  switch (column) {
    case "player":
      return leader.playerName ?? "";
    case "sport":
      return leader.sport ? formatSportName(leader.sport) : "";
    case "rating":
      return leader.rating ?? null;
    case "winChance":
      return getWinProbability(leader);
    case "wins":
      return leader.setsWon ?? null;
    case "losses":
      return leader.setsLost ?? null;
    case "matches":
      return isBowling ? metrics.bowlingMatchesPlayed : metrics.matchesTotal;
    case "winPercent":
      return metrics.winPercentage;
    case "highestScore":
      return leader.highestScore ?? null;
    case "averageScore":
      return leader.averageScore ?? null;
    case "standardDeviation":
      return leader.standardDeviation ?? null;
    default:
      return null;
  }
};
