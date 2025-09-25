import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import HomePageClient from '../home-page-client';

describe('HomePageClient error messages', () => {
  it('shows sports error message', () => {
    render(
      <HomePageClient
        sports={[]}
        matches={[]}
        sportError={true}
        matchError={false}
      />
    );
    expect(
      screen.getByText(/Unable to load sports\. Check connection\./i)
    ).toBeInTheDocument();
  });

  it('shows matches error message', () => {
    render(
      <HomePageClient
        sports={[]}
        matches={[]}
        sportError={false}
        matchError={true}
      />
    );
    expect(
      screen.getByText(/Unable to load matches\. Check connection\./i)
    ).toBeInTheDocument();
  });

  it('renders player names and match details link', () => {
    render(
      <HomePageClient
        sports={[]}
        matches={[
          {
            id: 'm1',
            sport: 'padel',
            bestOf: 3,
            playedAt: null,
            location: null,
            players: {
              A: [
                { id: 'a1', name: 'A1' },
                { id: 'a2', name: 'A2' },
              ],
              B: [
                { id: 'b1', name: 'B1' },
                { id: 'b2', name: 'B2' },
              ],
            },
          },
        ]}
        sportError={false}
        matchError={false}
      />
    );
    const matchItem = screen.getByRole('listitem');
    const normalized = matchItem.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    expect(normalized).toContain('A1');
    expect(normalized).toContain('A2');
    expect(normalized).toContain('B1');
    expect(normalized).toContain('B2');
    const link = screen.getByText('Match details');
    expect(link).toBeInTheDocument();
    expect(link.getAttribute('href')).toBe('/matches/m1');
  });
});
