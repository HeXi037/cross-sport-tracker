export type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
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

import { apiFetch } from './api';

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
      players.forEach((p) => {
        if (p.id && p.name) idToPlayer.set(p.id, p);
      });
    }
  }

  return details.map(({ row, detail }) => {
    const players: Record<string, PlayerInfo[]> = {};
    for (const p of detail.participants) {
      players[p.side] = p.playerIds.map(
        (id) => idToPlayer.get(id) ?? { id, name: id }
      );
    }
    return { ...row, players };
  });
}
