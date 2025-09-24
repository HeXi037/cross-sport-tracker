export interface MatchSummary {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winPct: number;
}

type MatchSummaryInput =
  | MatchSummary
  | {
      wins?: unknown;
      losses?: unknown;
      draws?: unknown;
      total?: unknown;
      winPct?: unknown;
    };

function coerceNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

export function parseMatchSummary(value: unknown): MatchSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const summary = value as MatchSummaryInput;
  const wins = coerceNumber(summary.wins);
  const losses = coerceNumber(summary.losses);
  const draws = coerceNumber(summary.draws ?? 0);
  const total = coerceNumber(summary.total);
  const winPct = coerceNumber(summary.winPct);

  if (
    wins === null ||
    losses === null ||
    draws === null ||
    total === null ||
    winPct === null
  ) {
    return null;
  }

  if (total <= 0) {
    return null;
  }

  return { wins, losses, draws, total, winPct };
}

export function normalizePlayerStats<T extends { matchSummary?: unknown }>(
  raw: T | null | undefined
): (T & { matchSummary: MatchSummary }) | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const summary = parseMatchSummary((raw as { matchSummary?: unknown }).matchSummary);
  if (!summary) {
    return null;
  }
  return { ...raw, matchSummary: summary } as T & { matchSummary: MatchSummary };
}
