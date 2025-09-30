import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import AdminMatchesPage from './page';

const apiFetchMock = vi.fn();

vi.mock('../../../lib/api', () => ({
  apiFetch: (...args: Parameters<typeof apiFetchMock>) => apiFetchMock(...args),
  isAdmin: () => true,
  withAbsolutePhotoUrl: (value: unknown) => value,
}));

vi.mock('../../../lib/LocaleContext', () => ({
  useLocale: () => 'en-AU',
  useTimeZone: () => 'Australia/Melbourne',
}));

vi.mock('../../../lib/participants', () => ({
  resolveParticipantGroups: () => [],
}));

vi.mock('../../../lib/loginRedirect', () => ({
  rememberLoginRedirect: vi.fn(),
}));

vi.mock('../../../components/MatchParticipants', () => ({
  __esModule: true,
  default: ({ sides }: { sides: unknown }) => (
    <div data-testid="participants">{JSON.stringify(sides)}</div>
  ),
}));

describe('AdminMatchesPage', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
  });

  it('renders dates using day-first ordering for Australian locales', async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            id: 'm1',
            sport: 'padel',
            stageId: null,
            bestOf: 3,
            playedAt: '2024-02-03T00:00:00Z',
            location: 'Centre Court',
            isFriendly: false,
          },
        ],
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          participants: [],
          summary: null,
        }),
      } as unknown as Response);

    render(<AdminMatchesPage />);

    await waitFor(() => {
      expect(screen.getByText(/3\/2\/24/)).toBeInTheDocument();
    });
  });
});
