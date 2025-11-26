import type { MatchSummaryData } from "./match-summary";
export type { MatchSummaryData } from "./match-summary";

export type PlayerInfo = {
  id: string;
  name: string;
  photo_url?: string | null;
};

export type MatchParticipantSummary = {
  id: string;
  side: string;
  playerIds: string[];
  players?: Array<PlayerInfo | null | undefined> | null;
};

export type MatchRatingPrediction = {
  method?: string | null;
  sides?: Record<string, number> | null;
} | null;

export type MatchRow = {
  id: string;
  sport: string;
  stageId: string | null;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  isFriendly: boolean;
  participants: MatchParticipantSummary[];
  summary?: MatchSummaryData | null;
  ratingPrediction?: MatchRatingPrediction;
};

export type EnrichedMatch = MatchRow & {
  players: Record<string, PlayerInfo[]>;
};

import { withAbsolutePhotoUrl } from './api';
import { sanitizePlayersBySide } from './participants';

function normalizePlayer(
  player: PlayerInfo | null | undefined,
  fallbackId: string,
): PlayerInfo {
  if (player) {
    const name = typeof player.name === 'string' ? player.name.trim() : '';
    if (name) {
      return {
        id: player.id ?? fallbackId,
        name,
        photo_url: player.photo_url ?? null,
      };
    }
  }

  return { id: fallbackId, name: 'Unknown', photo_url: null };
}

function resolveParticipantPlayers(
  participant: MatchParticipantSummary,
): PlayerInfo[] {
  const ids = Array.isArray(participant.playerIds)
    ? participant.playerIds
    : [];
  const provided = Array.isArray(participant.players)
    ? participant.players
    : [];

  const players: PlayerInfo[] = [];

  ids.forEach((rawId, index) => {
    if (!rawId) {
      return;
    }
    const id = String(rawId);
    const player = normalizePlayer(provided[index] ?? null, id);
    players.push(player);
  });

  if (provided.length > players.length) {
    for (let i = players.length; i < provided.length; i += 1) {
      const player = provided[i];
      if (!player) {
        continue;
      }
      const id = player.id ?? `extra-${i}`;
      players.push(normalizePlayer(player, id));
    }
  }

  if (!players.length && ids.length) {
    ids.forEach((rawId) => {
      if (rawId) {
        const id = String(rawId);
        players.push({ id, name: 'Unknown' });
      }
    });
  }

  return players.map((player) => withAbsolutePhotoUrl(player));
}

export function extractMatchPagination(
  headers: Headers,
  fallbackLimit: number,
): {
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
} {
  function parseNumber(value: string | null | undefined): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const limit = parseNumber(headers.get('X-Limit'));
  const hasMoreHeader = headers.get('X-Has-More');
  const hasMore = hasMoreHeader?.toLowerCase() === 'true';
  const nextOffset = parseNumber(headers.get('X-Next-Offset'));

  return {
    limit: limit && limit > 0 ? limit : fallbackLimit,
    hasMore,
    nextOffset: hasMore ? nextOffset ?? null : null,
  };
}

export async function enrichMatches(rows: MatchRow[]): Promise<EnrichedMatch[]> {
  return rows.map((row) => {
    const playersBySide: Record<string, PlayerInfo[]> = {};
    const participants = Array.isArray(row.participants)
      ? row.participants.slice().sort((a, b) => a.side.localeCompare(b.side))
      : [];

    participants.forEach((participant) => {
      playersBySide[participant.side] = resolveParticipantPlayers(participant);
    });

    const sanitizedPlayers = sanitizePlayersBySide(playersBySide);

    return {
      ...row,
      players: sanitizedPlayers,
      summary: row.summary ?? undefined,
    };
  });
}
