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

export type NormalizedSetScoreEntry = {
  sides: string[];
  scores: NumericRecord;
  tiebreak?: NumericRecord;
};

export type ScoreEventPayload = {
  type?: string | null;
  by?: string | null;
  side?: string | null;
  [key: string]: unknown;
};

export type ScoreEvent = {
  id?: string;
  type?: string | null;
  payload?: ScoreEventPayload | null;
  createdAt?: string | null;
  [key: string]: unknown;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const FINISHED_STATUS_KEYWORDS = new Set([
  "complete",
  "completed",
  "finished",
  "final",
  "finalized",
  "finalised",
  "done",
  "ended",
  "inactive",
  "closed",
  "result",
]);

export function isFinishedStatus(status?: string | null): boolean {
  if (typeof status !== "string") return false;
  const normalized = status.trim().toLowerCase();
  if (!normalized) return false;
  if (FINISHED_STATUS_KEYWORDS.has(normalized)) return true;
  if (normalized.includes("final")) return true;
  if (/^end(ed)?\b/.test(normalized)) return true;
  return false;
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

function extractTiebreak(set: Record<string, unknown>): NumericRecord | undefined {
  const candidate =
    set.tieBreak ??
    (set as { tiebreak?: unknown }).tiebreak ??
    (set as { tie_break?: unknown }).tie_break;
  if (!candidate || typeof candidate !== "object") return undefined;
  const entries = getNumericEntries(candidate);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
}

export function normalizeSetScoreEntry(set: unknown): NormalizedSetScoreEntry | null {
  if (!set || typeof set !== "object") return null;
  const numericEntries = getNumericEntries(set);
  if (!numericEntries.length) return null;

  const scores = Object.fromEntries(numericEntries);
  const sides = Object.keys(scores).sort();
  const tiebreak = extractTiebreak(set as Record<string, unknown>);

  return { sides, scores, tiebreak };
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

export const RACKET_SPORTS_WITHOUT_GAME_TOTALS = new Set([
  "padel",
]);

export function isRacketSport(sport?: string | null): boolean {
  const normalized = normalizeSportId(sport);
  if (!normalized) return false;
  return RACKET_SPORTS.has(normalized);
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

export function shouldRebuildRacketSummary(
  summary: SummaryData | null | undefined
): boolean {
  if (!summary || !isRecord(summary)) return false;
  const record = summary as Record<string, unknown>;
  const hasGames = hasPositiveValues(record["games"]);
  const hasPoints = hasPositiveValues(record["points"]);
  const hasDetails = hasSetScoreDetails(summary) || hasGames || hasPoints;
  return !hasDetails;
}

type Side = "A" | "B";

type RacketConfig = {
  tiebreakTo?: number;
  sets?: number;
  goldenPoint?: boolean;
};

type PickleballConfig = {
  pointsTo: number;
  winBy: number;
  bestOf?: number;
};

type PadelOrTennisState = {
  sport: "padel" | "tennis";
  config: RacketConfig;
  points: Record<Side, number>;
  games: Record<Side, number>;
  sets: Record<Side, number>;
  setScores: Array<Record<Side, number>>;
  tiebreak: boolean;
};

type PickleballState = {
  sport: "pickleball";
  config: PickleballConfig;
  points: Record<Side, number>;
  games: Record<Side, number>;
};

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function sanitizePositiveInteger(value: unknown): number | undefined {
  const num = toNumber(value);
  if (num === undefined) return undefined;
  const truncated = Math.trunc(num);
  return truncated > 0 ? truncated : undefined;
}

function sanitizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (["true", "yes", "1", "on"].includes(normalized)) return true;
    if (["false", "no", "0", "off"].includes(normalized)) return false;
  }
  return undefined;
}

function sanitizeSide(value: unknown): Side | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized === "A" || normalized === "B" ? (normalized as Side) : null;
}

function createPadelOrTennisState(
  sport: "padel" | "tennis",
  configRaw: unknown
): PadelOrTennisState {
  const config: RacketConfig = {};
  if (isRecord(configRaw)) {
    const rawTiebreak = configRaw.tiebreakTo ?? (configRaw as Record<string, unknown>).tiebreak_to;
    const tiebreak = sanitizePositiveInteger(rawTiebreak);
    if (tiebreak !== undefined) config.tiebreakTo = tiebreak;
    const rawSets = configRaw.sets ?? configRaw.bestOf ?? (configRaw as Record<string, unknown>).best_of;
    const sets = sanitizePositiveInteger(rawSets);
    if (sets !== undefined) config.sets = sets;
    const rawGolden = configRaw.goldenPoint ?? (configRaw as Record<string, unknown>).golden_point;
    const golden = sanitizeBoolean(rawGolden);
    if (golden !== undefined) config.goldenPoint = golden;
  }
  if (config.tiebreakTo === undefined) config.tiebreakTo = 7;

  return {
    sport,
    config,
    points: { A: 0, B: 0 },
    games: { A: 0, B: 0 },
    sets: { A: 0, B: 0 },
    setScores: [],
    tiebreak: false,
  };
}

function createPickleballState(configRaw: unknown): PickleballState {
  const config: PickleballConfig = {
    pointsTo: 11,
    winBy: 2,
  };
  if (isRecord(configRaw)) {
    const pts = sanitizePositiveInteger(configRaw.pointsTo ?? (configRaw as Record<string, unknown>).points_to);
    if (pts !== undefined) config.pointsTo = pts;
    const winBy = sanitizePositiveInteger(configRaw.winBy ?? (configRaw as Record<string, unknown>).win_by);
    if (winBy !== undefined) config.winBy = winBy;
    const best = sanitizePositiveInteger(configRaw.bestOf ?? (configRaw as Record<string, unknown>).best_of);
    if (best !== undefined) config.bestOf = best;
  }
  return {
    sport: "pickleball",
    config,
    points: { A: 0, B: 0 },
    games: { A: 0, B: 0 },
  };
}

function getSetsNeeded(config: RacketConfig): number | undefined {
  if (config.sets === undefined) return undefined;
  const sets = sanitizePositiveInteger(config.sets);
  if (sets === undefined) return undefined;
  return Math.floor(sets / 2) + 1;
}

function recordSetScore(
  state: PadelOrTennisState,
  winner: Side,
  { tiebreak }: { tiebreak?: boolean } = {}
): void {
  const scores: Record<Side, number> = {
    A: state.games.A,
    B: state.games.B,
  };
  if (tiebreak) {
    scores[winner] = (scores[winner] ?? 0) + 1;
  }
  state.setScores.push(scores);
}

function applyPadelOrTennisPoint(
  state: PadelOrTennisState,
  side: Side
): void {
  const opp: Side = side === "A" ? "B" : "A";
  const config = state.config;
  const tiebreakTo = config.tiebreakTo ?? 7;
  const setsNeeded = getSetsNeeded(config);

  if (
    setsNeeded &&
    (state.sets.A >= setsNeeded || state.sets.B >= setsNeeded)
  ) {
    return;
  }

  state.points[side] += 1;
  const ps = state.points[side];
  const po = state.points[opp];

  if (state.tiebreak) {
    if (ps >= tiebreakTo && ps - po >= 2) {
      state.sets[side] += 1;
      recordSetScore(state, side, { tiebreak: true });
      state.points.A = 0;
      state.points.B = 0;
      state.games.A = 0;
      state.games.B = 0;
      state.tiebreak = false;
    }
    return;
  }

  const goldenPoint = state.sport === "padel" && config.goldenPoint === true;
  const winsGame =
    ps >= 4 &&
    (ps - po >= 2 || (goldenPoint && po >= 3));

  if (!winsGame) return;

  state.games[side] += 1;
  state.points.A = 0;
  state.points.B = 0;
  const gs = state.games[side];
  const go = state.games[opp];

  if (state.games.A === 6 && state.games.B === 6) {
    state.tiebreak = true;
    return;
  }

  if (gs >= 6 && gs - go >= 2) {
    state.sets[side] += 1;
    recordSetScore(state, side);
    state.games.A = 0;
    state.games.B = 0;
  }
}

function applyPickleballPoint(state: PickleballState, side: Side): void {
  const opp: Side = side === "A" ? "B" : "A";
  const config = state.config;
  const gamesNeeded = config.bestOf
    ? Math.floor(config.bestOf / 2) + 1
    : undefined;

  if (
    gamesNeeded &&
    (state.games.A >= gamesNeeded || state.games.B >= gamesNeeded)
  ) {
    return;
  }

  state.points[side] += 1;
  const ps = state.points[side];
  const po = state.points[opp];
  if (ps >= config.pointsTo && ps - po >= config.winBy) {
    state.games[side] += 1;
    state.points.A = 0;
    state.points.B = 0;
  }
}

function cloneNumericRecord(record: Record<Side, number>): Record<string, number> {
  return { A: record.A, B: record.B };
}

function unwrapScoreEvent(
  event: ScoreEvent | Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!event || typeof event !== "object") return null;
  if ("payload" in event && isRecord((event as ScoreEvent).payload)) {
    return (event as ScoreEvent).payload as Record<string, unknown>;
  }
  return event as Record<string, unknown>;
}

function getEventType(
  event: ScoreEvent | Record<string, unknown>,
  payload: Record<string, unknown> | null
): string | undefined {
  if (payload && typeof payload.type === "string") {
    return payload.type;
  }
  if (typeof (event as { type?: unknown }).type === "string") {
    return (event as { type?: string }).type;
  }
  return undefined;
}

function getEventWinner(payload: Record<string, unknown> | null): Side | null {
  if (!payload) return null;
  return sanitizeSide(payload.by ?? payload.side ?? payload.winner);
}

function summarisePadelOrTennis(state: PadelOrTennisState): RacketSummary {
  const result: RacketSummary = {
    points: cloneNumericRecord(state.points),
    games: cloneNumericRecord(state.games),
    sets: cloneNumericRecord(state.sets),
    set_scores: state.setScores.map((set) => ({ ...set })),
  };
  const config: Record<string, unknown> = {};
  if (state.config.tiebreakTo !== undefined) config.tiebreakTo = state.config.tiebreakTo;
  if (state.config.sets !== undefined) config.sets = state.config.sets;
  if (state.config.goldenPoint !== undefined) config.goldenPoint = state.config.goldenPoint;
  if (Object.keys(config).length) {
    result.config = config;
  }
  return result;
}

function summarisePickleball(state: PickleballState): RacketSummary {
  const result: RacketSummary = {
    points: cloneNumericRecord(state.points),
    games: cloneNumericRecord(state.games),
  };
  const config: Record<string, unknown> = {
    pointsTo: state.config.pointsTo,
    winBy: state.config.winBy,
  };
  if (state.config.bestOf !== undefined) config.bestOf = state.config.bestOf;
  result.config = config;
  return result;
}

function rebuildPadelOrTennis(
  sport: "padel" | "tennis",
  events: ScoreEvent[] | null | undefined,
  config: unknown
): RacketSummary | null {
  if (!events || events.length === 0) return null;
  const state = createPadelOrTennisState(sport, config);
  let processed = false;
  for (const event of events) {
    const payload = unwrapScoreEvent(event);
    const type = getEventType(event, payload);
    if (type !== "POINT") continue;
    const side = getEventWinner(payload);
    if (!side) continue;
    applyPadelOrTennisPoint(state, side);
    processed = true;
  }
  return processed ? summarisePadelOrTennis(state) : null;
}

function rebuildPickleball(
  events: ScoreEvent[] | null | undefined,
  config: unknown
): RacketSummary | null {
  if (!events || events.length === 0) return null;
  const state = createPickleballState(config);
  let processed = false;
  for (const event of events) {
    const payload = unwrapScoreEvent(event);
    const type = getEventType(event, payload);
    if (type !== "POINT") continue;
    const side = getEventWinner(payload);
    if (!side) continue;
    applyPickleballPoint(state, side);
    processed = true;
  }
  return processed ? summarisePickleball(state) : null;
}

export function rebuildRacketSummaryFromEvents(
  sport: string | null | undefined,
  events: ScoreEvent[] | null | undefined,
  config?: unknown
): RacketSummary | null {
  const normalized = normalizeSportId(sport);
  if (normalized === "padel" || normalized === "tennis") {
    return rebuildPadelOrTennis(normalized, events, config);
  }
  if (normalized === "pickleball") {
    return rebuildPickleball(events, config);
  }
  return null;
}
