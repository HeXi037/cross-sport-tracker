import { describe, it, expect, vi, afterEach } from 'vitest';
import { enrichMatches, type MatchRow } from './matches';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

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
      },
    ];
    const detail = {
      participants: [
        { side: 'A', playerIds: ['1'] },
        { side: 'B', playerIds: ['2'] },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: '1', name: 'Alice' }, { id: '2' }] });
    global.fetch = fetchMock as unknown as typeof fetch;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const enriched = await enrichMatches(rows);
    expect(enriched[0].players.A[0]).toEqual({ id: '1', name: 'Alice' });
    expect(enriched[0].players.B[0]).toEqual({ id: '2', name: 'Unknown' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('2'));
  });
});
