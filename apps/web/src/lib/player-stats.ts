// apps/web/src/lib/player-stats.ts

export type NormalizedMatchSummary = {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winPct: number;
  /**
   * Optional streak value: positive for wins in a row, negative for losses.
   */
  streak?: number | null;
  /**
   * Optional ISO timestamp for when the player last played.
   */
  lastPlayedAt?: string | null;
};

export function normalizeMatchSummary(
  summary: unknown
): NormalizedMatchSummary | null {
  if (!summary || typeof summary !== "object") {
    return null;
  }
  const { wins, losses, draws, total, winPct, streak, lastPlayedAt } = summary as Record<
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
  const hasResults = wins > 0 || losses > 0 || normalizedDraws > 0;
  if (!hasResults) {
    if (total === 0) {
      return {
        wins: 0,
        losses: 0,
        draws: 0,
        total: 0,
        winPct: 0,
        streak: null,
        lastPlayedAt: null,
      };
    }
    return null;
  }
  if (total === 0) {
    return null;
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
    streak:
      typeof streak === "number" && Number.isFinite(streak) ? Math.trunc(streak) : null,
    lastPlayedAt:
      typeof lastPlayedAt === "string" && lastPlayedAt.trim().length > 0
        ? lastPlayedAt
        : null,
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
  total?: number;
  chemistry?: number | null;
};

function normalizeOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = normalizeRequiredNumber(value);
  return normalized ?? null;
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeRequiredNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
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
    const raw = entry as Record<string, unknown>;
    const id = normalizeId(raw.playerId);
    if (!id) {
      continue;
    }
    const wins = normalizeRequiredNumber(raw.wins);
    const losses = normalizeRequiredNumber(raw.losses);
    const winPct = normalizeRequiredNumber(raw.winPct);
    if (wins === null || losses === null || winPct === null) {
      continue;
    }
    if (wins < 0 || losses < 0 || winPct < 0) {
      continue;
    }
    if (!Number.isFinite(wins) || !Number.isFinite(losses) || !Number.isFinite(winPct)) {
      continue;
    }
    const playerName = raw.playerName;
    const totalValue = normalizeOptionalNumber(raw.total);
    const chemistryValue = normalizeOptionalNumber(raw.chemistry);
    normalized.push({
      playerId: id,
      playerName:
        typeof playerName === "string" && playerName.trim().length > 0
          ? playerName
          : id,
      wins,
      losses,
      winPct: Math.max(0, Math.min(winPct, 1)),
      total: totalValue !== null && totalValue >= 0 ? totalValue : undefined,
      chemistry:
        chemistryValue !== null && chemistryValue >= 0 && chemistryValue <= 1
          ? chemistryValue
          : chemistryValue !== null
          ? Math.max(0, Math.min(chemistryValue, 1))
          : null,
    });
  }
  return normalized;
}

export function normalizeVersusRecord(
  record: unknown
): NormalizedVersusRecord | null {
  if (!record || typeof record !== "object") {
    return null;
  }
  const [normalized] = normalizeVersusRecords([record]);
  return normalized ?? null;
}

export type RatingSnapshot = {
  value: number | null;
  delta30: number | null;
  sparkline: number[];
  deviation?: number | null;
  lastUpdated?: string | null;
};

export type SportRatingSummary = {
  sport: string;
  elo?: RatingSnapshot | null;
  glicko?: RatingSnapshot | null;
};

function normalizeSparkline(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) =>
      typeof entry === "number" && Number.isFinite(entry) ? entry : null
    )
    .filter((entry): entry is number => entry !== null);
}

function normalizeRatingSnapshot(value: unknown): RatingSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const snapshot: RatingSnapshot = {
    value: normalizeOptionalNumber(raw.value),
    delta30: normalizeOptionalNumber(raw.delta30),
    sparkline: normalizeSparkline(raw.sparkline),
    deviation: normalizeOptionalNumber(raw.deviation) ?? undefined,
    lastUpdated:
      typeof raw.lastUpdated === "string" ? raw.lastUpdated : undefined,
  };
  const hasContent =
    snapshot.value !== null ||
    snapshot.delta30 !== null ||
    snapshot.sparkline.length > 0 ||
    (typeof snapshot.deviation === "number" && Number.isFinite(snapshot.deviation)) ||
    typeof snapshot.lastUpdated === "string";
  return hasContent ? snapshot : null;
}

export function normalizeRatingSummaries(
  ratings: unknown
): SportRatingSummary[] {
  if (!Array.isArray(ratings)) {
    return [];
  }
  const normalized: SportRatingSummary[] = [];
  for (const entry of ratings) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const sport = raw.sport;
    if (typeof sport !== "string" || sport.trim().length === 0) {
      continue;
    }
    const elo = normalizeRatingSnapshot(raw.elo);
    const glicko = normalizeRatingSnapshot(raw.glicko);
    if (!elo && !glicko) {
      continue;
    }
    normalized.push({
      sport,
      elo,
      glicko,
    });
  }
  return normalized;
}

export function normalizeRollingWinPct(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((entry) =>
      typeof entry === "number" && Number.isFinite(entry) ? entry : null
    )
    .filter((entry): entry is number => entry !== null)
    .map((entry) => Math.max(0, Math.min(entry, 1)));
}

export function formatRatingValue(value: number | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value).toLocaleString();
  }
  return "Unranked";
}

export function formatWinRate(summary?: NormalizedMatchSummary | null): string {
  if (!summary || summary.total <= 0) {
    return "—";
  }
  const winRate = Math.max(0, Math.min(summary.winPct, 1));
  return `${Math.round(winRate * 100)}%`;
}

export function describeStreak(
  summary?: NormalizedMatchSummary | null,
): { label: string; value: string; tone: "positive" | "negative" | "neutral" } {
  if (summary?.streak && Number.isFinite(summary.streak)) {
    const magnitude = Math.abs(summary.streak);
    if (magnitude > 0) {
      const isPositive = summary.streak > 0;
      return {
        label: isPositive ? "On a streak" : "Skid",
        value: `${magnitude} ${isPositive ? "win" : "loss"} streak`,
        tone: isPositive ? "positive" : "negative",
      };
    }
  }

  if (summary && summary.total > 0) {
    const winRate = Math.max(0, Math.min(summary.winPct, 1));
    if (winRate >= 0.65) {
      return { label: "Momentum", value: "Hot form", tone: "positive" };
    }
    if (winRate <= 0.35) {
      return { label: "Reset", value: "Looking to bounce back", tone: "negative" };
    }
  }

  return { label: "Momentum", value: "Warming up", tone: "neutral" };
}
