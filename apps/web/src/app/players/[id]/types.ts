export type MatchSummary = {
  sets?: { A: number; B: number };
  games?: { A: number; B: number };
  points?: { A: number; B: number };
} | null;

export type EnrichedMatch = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  names: Record<"A" | "B", string[]>;
  playerIds: Record<"A" | "B", string[]>;
  summary?: MatchSummary;
};
