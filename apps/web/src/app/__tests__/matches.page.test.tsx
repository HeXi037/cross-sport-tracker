import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MatchesPage from '../matches/page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe('MatchesPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists matches with player names', async () => {
    const matches = [
      { id: 'm1', sport: 'padel', bestOf: 3, playedAt: null, location: null },
    ];
    const detail = {
      participants: [
        { side: 'A' as const, playerIds: ['1'] },
        { side: 'B' as const, playerIds: ['2'] },
      ],
      summary: { points: { A: 11, B: 7 } },
    };
    const players = [
      { playerId: '1', playerName: 'Alice' },
      { playerId: '2', playerName: 'Bob' },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => matches })
      .mockResolvedValueOnce({ ok: true, json: async () => detail })
      .mockResolvedValueOnce({ ok: true, json: async () => players });
    global.fetch = fetchMock as any;

    const page = await MatchesPage({ searchParams: {} });
    render(page);

    await screen.findByText('Alice vs Bob');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
