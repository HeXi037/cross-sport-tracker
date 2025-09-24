/*
 * Shared match summary utilities and types used across match detail views.
 */

export type NumericRecord = Record<string, number>;
export type SetScores = Array<Record<string, unknown>>;

export type RacketSummary = {
  sets?: NumericRecord | null;
  games?: NumericRecord | null;
  points?: NumericRecord | null;
  set_scores?: SetScores | null;
  config?: unknown;
  [key: string]: unknown;
};

export type DiscGolfSummary = {
  scores?: Record<string, Array<number | null | undefined>>;
  pars?: Array<number | null | undefined>;
  totals?: NumericRecord;
  parTotal?: number | null;
  toPar?: NumericRecord;
  config?: unknown;
  [key: string]: unknown;
};

export type BowlingSummaryPlayer = {
  side?: string;
  playerId?: string;
  playerName?: string;
  frames?: Array<Array<number | null | undefined>>;
  scores?: Array<number | null | undefined>;
  total?: number | null;
};

export type BowlingSummary = {
  frames?: Array<Array<number | null | undefined>>;
  scores?: Array<number | null | undefined>;
  total?: number | null;
  players?: BowlingSummaryPlayer[];
  config?: unknown;
  [key: string]: unknown;
};

export type SummaryData =
  | RacketSummary
  | DiscGolfSummary
  | BowlingSummary
  | Record<string, unknown>
  | null
  | undefined;

export type ScoreEventPayload = {
  type?: string | null;
  by?: string | null;
  side?: string | null;
};

export type ScoreEvent = {
  type?: string | null;
  payload?: ScoreEventPayload | null;
  createdAt?: string | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getNumericEntries(record: unknown): Array<[string, number]> {
  if (!record || typeof record !== "object") return [];
  const entries: Array<[string, number]> = [];
  for (const [key, rawValue] of Object.entries(
    record as Record<string, unknown>
  )) {
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      entries.push([key, rawValue]);
    }
  }
  return entries;
}

export function hasPositiveValues(record: unknown): boolean {
  return getNumericEntries(record).some(([, value]) => value > 0);
}

export function normalizeSportId(sport?: string | null): string | undefined {
  if (typeof sport !== "string") return undefined;
  const trimmed = sport.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export const RACKET_SPORTS = new Set([
  "padel",
  "tennis",
  "pickleball",
  "badminton",
  "table_tennis",
]);

export function isRacketSport(sport?: string | null): boolean {
  const id = normalizeSportId(sport);
  if (!id) return false;
  return RACKET_SPORTS.has(id);
}

const FINISHED_KEYWORDS = [
  "complete",
  "completed",
  "finished",
  "final",
  "ended",
  "inactive",
  "closed",
  "result",
];

export function isFinishedStatus(status?: string | null): boolean {
  if (typeof status !== "string") return false;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return false;
  if (FINISHED_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true;
  }
  if (/^end(ed)?\b/.test(normalized)) {
    return true;
  }
  return false;
}

function hasSetScoreDetails(summary: SummaryData): boolean {
  if (!isRecord(summary)) return false;
  const raw = summary as Record<string, unknown>;
  const value = raw["set_scores"];
  if (!Array.isArray(value)) return false;
  return value.some(
    (set) =>
      isRecord(set) &&
      getNumericEntries(set).some(([, games]) => games > 0)
  );
}

export function shouldRebuildRacketSummary(summary: SummaryData): boolean {
  if (!isRecord(summary)) return false;
  const record = summary as Record<string, unknown>;
  const hasSets = hasPositiveValues(record["sets"]);
  if (!hasSets) return false;
  const hasGames = hasPositiveValues(record["games"]);
  const hasPoints = hasPositiveValues(record["points"]);
  const hasDetails = hasSetScoreDetails(summary) || hasGames || hasPoints;
  return !hasDetails;
}

type RacketState = {
  rawConfig: Record<string, unknown>;
  config: {
    tiebreakTo: number;
    sets?: number;
    goldenPoint?: boolean;
  };
  points: Record<string, number>;
  games: Record<string, number>;
  sets: Record<string, number>;
  setScores: Array<Record<string, number>>;
  tiebreak: boolean;
};

function coerceNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function createRacketState(
  sportId: string,
  config: unknown
): RacketState {
  const rawConfig = isRecord(config) ? { ...(config as Record<string, unknown>) } : {};
  const tiebreakTo = coerceNumber(rawConfig["tiebreakTo"]) ?? 7;
  const sets = coerceNumber(rawConfig["sets"]);
  const goldenPoint = sportId === "padel" ? Boolean(rawConfig["goldenPoint"]) : false;

  return {
    rawConfig,
    config: {
      tiebreakTo,
      sets,
      goldenPoint,
    },
    points: { A: 0, B: 0 },
    games: { A: 0, B: 0 },
    sets: { A: 0, B: 0 },
    setScores: [],
    tiebreak: false,
  };
}

function ensureSide(state: RacketState, side: "A" | "B") {
  if (!(side in state.points)) state.points[side] = 0;
  if (!(side in state.games)) state.games[side] = 0;
  if (!(side in state.sets)) state.sets[side] = 0;
}

function resetRecord(record: Record<string, number>) {
  for (const key of Object.keys(record)) {
    record[key] = 0;
  }
}

function recordSetScore(
  state: RacketState,
  winner: "A" | "B",
  isTiebreak: boolean
) {
  const snapshot: Record<string, number> = {};
  for (const [key, value] of Object.entries(state.games)) {
    snapshot[key] = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  if (isTiebreak) {
    snapshot[winner] = (snapshot[winner] ?? 0) + 1;
  }
  state.setScores.push(snapshot);
}

function applyRacketPoint(
  state: RacketState,
  sportId: string,
  side: "A" | "B"
) {
  const opponent: "A" | "B" = side === "A" ? "B" : "A";
  const { tiebreakTo, sets, goldenPoint } = state.config;
  const bestOf = typeof sets === "number" && Number.isFinite(sets) ? sets : undefined;
  const setsNeeded = bestOf ? Math.floor(bestOf / 2) + 1 : undefined;

  if (
    setsNeeded &&
    (state.sets["A"] >= setsNeeded || state.sets["B"] >= setsNeeded)
  ) {
    return;
  }

  state.points[side] = (state.points[side] ?? 0) + 1;
  const ps = state.points[side];
  const po = state.points[opponent] ?? 0;

  if (state.tiebreak) {
    if (ps >= tiebreakTo && ps - po >= 2) {
      state.sets[side] = (state.sets[side] ?? 0) + 1;
      recordSetScore(state, side, true);
      resetRecord(state.points);
      resetRecord(state.games);
      state.tiebreak = false;
    }
    return;
  }

  const needsGoldenPoint =
    sportId === "padel" && goldenPoint && po >= 3 && ps >= 4;
  const regularWin = ps >= 4 && ps - po >= 2;

  if (regularWin || needsGoldenPoint) {
    state.games[side] = (state.games[side] ?? 0) + 1;
    resetRecord(state.points);
    const gs = state.games[side];
    const go = state.games[opponent] ?? 0;

    if (state.games["A"] === 6 && state.games["B"] === 6 && tiebreakTo) {
      state.tiebreak = true;
    } else if (gs >= 6 && gs - go >= 2) {
      state.sets[side] = (state.sets[side] ?? 0) + 1;
      recordSetScore(state, side, false);
      resetRecord(state.games);
    }
  }
}

function aggregateGames(state: RacketState): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [side, value] of Object.entries(state.games)) {
    totals[side] = typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  for (const snapshot of state.setScores) {
    for (const [side, value] of Object.entries(snapshot)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        totals[side] = (totals[side] ?? 0) + value;
      }
    }
  }
  return totals;
}

function aggregatePoints(
  totals: Record<string, number>,
  state: RacketState
): Record<string, number> {
  const result: Record<string, number> = {};
  const sides = new Set([
    ...Object.keys(state.points),
    ...Object.keys(totals),
  ]);
  for (const side of sides) {
    const value = totals[side];
    result[side] =
      typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  return result;
}

export function rebuildRacketSummaryFromEvents(
  sport: string | null | undefined,
  events: ScoreEvent[] | null | undefined,
  config?: unknown
): RacketSummary | null {
  const sportId = normalizeSportId(sport);
  if (!sportId) return null;
  if (!isRacketSport(sportId)) return null;
  if (sportId !== "padel" && sportId !== "tennis") return null;
  if (!Array.isArray(events) || events.length === 0) return null;

  const state = createRacketState(sportId, config);
  const totalPoints: Record<string, number> = { A: 0, B: 0 };

  for (const event of events) {
    const payload = event?.payload;
    const rawType = payload?.type ?? event?.type;
    if (typeof rawType !== "string") continue;
    if (rawType.toUpperCase() !== "POINT") continue;
    const rawSide = payload?.by ?? payload?.side;
    if (typeof rawSide !== "string") continue;
    const side = rawSide.trim().toUpperCase();
    if (side !== "A" && side !== "B") continue;
    ensureSide(state, side as "A" | "B");
    totalPoints[side as "A" | "B"] =
      (totalPoints[side as "A" | "B"] ?? 0) + 1;
    applyRacketPoint(state, sportId, side as "A" | "B");
  }

  const hasAnyProgress =
    state.setScores.length > 0 ||
    Object.values(state.games).some((value) => value > 0);
  if (!hasAnyProgress) return null;

  return {
    points: aggregatePoints(totalPoints, state),
    games: aggregateGames(state),
    sets: { ...state.sets },
    set_scores: state.setScores.map((scores) => ({ ...scores })),
    config: { ...state.rawConfig, ...state.config },
  };
}
