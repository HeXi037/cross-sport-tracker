// apps/web/src/lib/player-stats.ts

export type NormalizedMatchSummary = {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winPct: number;
};

export function normalizeMatchSummary(
  summary: unknown
): NormalizedMatchSummary | null {
  if (!summary || typeof summary !== "object") {
    return null;
  }
  const { wins, losses, draws, total, winPct } = summary as Record<
    string,
    unknown
  >;
  if (
    typeof wins !== "number" ||
    typeof losses !== "number" ||
    typeof total !== "number" ||
    typeof winPct !== "number"
  ) {
    return null;
  }
  if (
    !Number.isFinite(wins) ||
    !Number.isFinite(losses) ||
    !Number.isFinite(total) ||
    !Number.isFinite(winPct)
  ) {
    return null;
  }
  if (total < 0 || wins < 0 || losses < 0 || winPct < 0) {
    return null;
  }
  const normalizedDraws =
    typeof draws === "number" && Number.isFinite(draws) && draws > 0 ? draws : 0;
  if (total === 0) {
    if (wins !== 0 || losses !== 0 || normalizedDraws !== 0) {
      return null;
    }
    return {
      wins: 0,
      losses: 0,
      draws: 0,
      total: 0,
      winPct: 0,
    };
  }
  if (wins + losses + normalizedDraws > total) {
    return null;
  }
  const clampedWinPct = Math.max(0, Math.min(winPct, 1));
  return {
    wins,
    losses,
    draws: normalizedDraws,
    total,
    winPct: clampedWinPct,
  };
}

export function formatMatchRecord(summary: NormalizedMatchSummary): string {
  const parts = [summary.wins, summary.losses];
  if (summary.draws > 0) {
    parts.push(summary.draws);
  }
  const percentage = Math.round(Math.max(0, Math.min(summary.winPct, 1)) * 100);
  return `${parts.join("-")} (${percentage}%)`;
}

export type NormalizedVersusRecord = {
  playerId: string;
  playerName: string;
  wins: number;
  losses: number;
  winPct: number;
};

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function normalizeVersusRecords(
  records: unknown
): NormalizedVersusRecord[] {
  if (!Array.isArray(records)) {
    return [];
  }
  const normalized: NormalizedVersusRecord[] = [];
  for (const entry of records) {
    if (!isRecordObject(entry)) continue;
    const { playerId, playerName, wins, losses, winPct } = entry as Record<
      string,
      unknown
    >;
    if (typeof playerId !== "string" || playerId.length === 0) {
      continue;
    }
    if (
      typeof wins !== "number" ||
      typeof losses !== "number" ||
      typeof winPct !== "number"
    ) {
      continue;
    }
    if (wins < 0 || losses < 0 || winPct < 0) {
      continue;
    }
    if (!Number.isFinite(wins) || !Number.isFinite(losses) || !Number.isFinite(winPct)) {
      continue;
    }
    normalized.push({
      playerId,
      playerName:
        typeof playerName === "string" && playerName.trim().length > 0
          ? playerName
          : playerId,
      wins,
      losses,
      winPct: Math.max(0, Math.min(winPct, 1)),
    });
  }
  return normalized;
}
