export type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
};

export type Participant = {
  side: 'A' | 'B';
  playerIds: string[];
};

export type MatchDetail = {
  participants: Participant[];
};

export type EnrichedMatch = MatchRow & {
  names: Record<'A' | 'B', string[]>;
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

  const idToName = new Map<string, string>();
  const idList = Array.from(ids);
  if (idList.length) {
    const r = await apiFetch(
      `/v0/players/by-ids?ids=${idList.join(',')}`,
      { cache: 'no-store' }
    );
    if (r.ok) {
      const players = (await r.json()) as {
        id?: string;
        name?: string;
        playerId?: string;
        playerName?: string;
      }[];
      players.forEach((p) => {
        const pid = p.id ?? p.playerId;
        const pname = p.name ?? p.playerName;
        if (pid && pname) idToName.set(pid, pname);
      });
    }
  }

  return details.map(({ row, detail }) => {
    const names: Record<'A' | 'B', string[]> = { A: [], B: [] };
    for (const p of detail.participants) {
      names[p.side] = p.playerIds.map((id) => idToName.get(id) ?? id);
    }
    return { ...row, names };
  });
}
