export type MatchSummary = {
  sets?: Record<string, number>;
  games?: Record<string, number>;
  points?: Record<string, number>;
} | null;

export type EnrichedMatch = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  names: Record<string, string[]>;
  playerIds: Record<string, string[]>;
  summary?: MatchSummary;
};
