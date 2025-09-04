import type { ReactNode } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayersPage from '../players/page';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('PlayersPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a player and shows success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: '1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ players: [] }) });
    global.fetch = fetchMock as any;

    await act(async () => {
      render(<PlayersPage />);
    });

    fireEvent.change(screen.getByPlaceholderText(/name/i), {
      target: { value: 'New Player' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v0/players',
      expect.objectContaining({ method: 'POST' })
    );
    await screen.findByText(/added successfully/i);
  });
});
