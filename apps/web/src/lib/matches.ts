export type MatchRow = {
  id: string;
  sport: string;
  stageId: string | null;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  isFriendly: boolean;
};

export type Participant = {
  side: string;
  playerIds: string[];
};

export type MatchDetail = {
  participants: Participant[];
};

export type PlayerInfo = {
  id: string;
  name: string;
  photo_url?: string | null;
};

export type EnrichedMatch = MatchRow & {
  players: Record<string, PlayerInfo[]>;
};

import { apiFetch, withAbsolutePhotoUrl } from './api';
import { sanitizePlayersBySide } from './participants';

function parseNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractMatchPagination(
  headers: Headers,
  fallbackLimit: number,
): {
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
} {
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
  const details = await Promise.all(
    rows.map(async (m) => {
      const r = await apiFetch(`/v0/matches/${m.id}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`Failed to load match ${m.id}`);
      const d = (await r.json()) as MatchDetail;
      return { row: m, detail: d };
    })
  );

  const ids = new Set<string>();
  for (const { detail } of details) {
    for (const p of detail.participants) p.playerIds.forEach((id) => ids.add(id));
  }

  const idToPlayer = new Map<string, PlayerInfo>();
  const idList = Array.from(ids);
  if (idList.length) {
    const r = await apiFetch(
      `/v0/players/by-ids?ids=${idList.join(',')}`,
      { cache: 'no-store' }
    );
    if (r.ok) {
      const players = (await r.json()) as PlayerInfo[];
      const remaining = new Set(idList);
      const missing: string[] = [];
      players.forEach((p) => {
        if (p.id) {
          remaining.delete(p.id);
          if (p.name) {
            idToPlayer.set(p.id, withAbsolutePhotoUrl(p));
          } else {
            missing.push(p.id);
            idToPlayer.set(p.id, { id: p.id, name: 'Unknown' });
          }
        }
      });
      if (remaining.size) {
        missing.push(...Array.from(remaining));
        remaining.forEach((id) =>
          idToPlayer.set(id, { id, name: 'Unknown' })
        );
      }
      if (missing.length) {
        console.warn(
          `Player names missing for ids: ${missing.join(', ')}`
        );
      }
    }
  }

  return details.map(({ row, detail }) => {
    const players: Record<string, PlayerInfo[]> = {};
    for (const p of detail.participants) {
      players[p.side] = p.playerIds.map(
        (id) => idToPlayer.get(id) ?? { id, name: 'Unknown' }
      );
    }
    const sanitizedPlayers = sanitizePlayersBySide(players);
    return { ...row, players: sanitizedPlayers };
  });
}
