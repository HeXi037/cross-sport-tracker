import { describe, it, expect } from 'vitest';
import { enrichMatches, type MatchRow } from './matches';

describe('enrichMatches', () => {
  it('falls back to Unknown when player name missing', async () => {
    const rows: MatchRow[] = [
      {
        id: 'm1',
        sport: 'padel',
        stageId: null,
        bestOf: 3,
        playedAt: null,
        location: null,
        isFriendly: false,
        participants: [
          {
            id: 'p1',
            side: 'A',
            playerIds: ['1'],
            players: [{ id: '1', name: 'Alice' }],
          },
          {
            id: 'p2',
            side: 'B',
            playerIds: ['2'],
            players: [{ id: '2', name: '' }],
          },
        ],
        summary: null,
      },
    ];

    const enriched = await enrichMatches(rows);
    expect(enriched[0].players.A[0]).toMatchObject({
      id: '1',
      name: 'Alice',
    });
    expect(enriched[0].players.B[0]).toMatchObject({
      id: '2',
      name: 'Unknown',
    });
  });
});
