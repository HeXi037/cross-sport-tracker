export interface MatchSummary {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winPct: number;
}

export interface VersusRecord {
  playerId: string;
  playerName?: string;
  wins: number;
  losses: number;
  winPct: number;
}

export interface PlayerStats {
  playerId?: string;
  matchSummary: MatchSummary | null;
  bestAgainst: VersusRecord | null;
  worstAgainst: VersusRecord | null;
  bestWith: VersusRecord | null;
  worstWith: VersusRecord | null;
  withRecords: VersusRecord[];
}

type UnknownRecord = Record<string, unknown>;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function parseMatchSummary(value: unknown): MatchSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as UnknownRecord;
  const wins = toFiniteNumber(record.wins);
  const losses = toFiniteNumber(record.losses);
  const total = toFiniteNumber(record.total);
  const winPct = toFiniteNumber(record.winPct);
  const drawsValue =
    record.draws === null || record.draws === undefined
      ? 0
      : toFiniteNumber(record.draws);

  if (
    wins === null ||
    losses === null ||
    total === null ||
    winPct === null ||
    drawsValue === null
  ) {
    return null;
  }

  if (wins < 0 || losses < 0 || drawsValue < 0 || total <= 0) {
    return null;
  }

  if (winPct < 0 || winPct > 1) {
    return null;
  }

  if (wins + losses + drawsValue === 0) {
    return null;
  }

  return {
    wins,
    losses,
    draws: drawsValue,
    total,
    winPct,
  };
}

function parseVersusRecord(value: unknown): VersusRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as UnknownRecord;
  const playerId =
    typeof record.playerId === "string" && record.playerId.length > 0
      ? record.playerId
      : null;
  if (!playerId) return null;

  const wins = toFiniteNumber(record.wins);
  const losses = toFiniteNumber(record.losses);
  const winPct = toFiniteNumber(record.winPct);

  if (wins === null || losses === null || winPct === null) {
    return null;
  }

  const playerName =
    typeof record.playerName === "string" && record.playerName.trim().length
      ? record.playerName
      : undefined;

  return {
    playerId,
    playerName,
    wins,
    losses,
    winPct,
  };
}

export function sanitizePlayerStats(raw: unknown): PlayerStats | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as UnknownRecord;

  const matchSummary = parseMatchSummary(record.matchSummary);
  const bestAgainst = parseVersusRecord(record.bestAgainst);
  const worstAgainst = parseVersusRecord(record.worstAgainst);
  const bestWith = parseVersusRecord(record.bestWith);
  const worstWith = parseVersusRecord(record.worstWith);
  const withRecords = Array.isArray(record.withRecords)
    ? (record.withRecords
        .map(parseVersusRecord)
        .filter((item): item is VersusRecord => item !== null))
    : [];

  const playerId =
    typeof record.playerId === "string" && record.playerId.length > 0
      ? record.playerId
      : undefined;

  return {
    playerId,
    matchSummary,
    bestAgainst,
    worstAgainst,
    bestWith,
    worstWith,
    withRecords,
  };
}
