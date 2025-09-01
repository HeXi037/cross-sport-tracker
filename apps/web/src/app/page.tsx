export const revalidate = 60; // cache the page for one minute

import { apiFetch } from '../lib/api';
import HomePageClient from './home-page-client';

type Sport = { id: string; name: string };
type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
};

export default async function HomePage() {
  let sports: Sport[] = [];
  let matches: MatchRow[] = [];
  let sportError = false;
  let matchError = false;

  const [sportsResult, matchesResult] = await Promise.allSettled([
    apiFetch('/v0/sports', { next: { revalidate: 60 } }),
    apiFetch('/v0/matches', { next: { revalidate: 60 } }),
  ]);

  if (sportsResult.status === 'fulfilled' && sportsResult.value.ok) {
    sports = (await sportsResult.value.json()) as Sport[];
  } else {
    sportError = true;
  }

  if (matchesResult.status === 'fulfilled' && matchesResult.value.ok) {
    matches = (await matchesResult.value.json()) as MatchRow[];
  } else {
    matchError = true;
  }

  return (
    <HomePageClient
      sports={sports}
      matches={matches}
      sportError={sportError}
      matchError={matchError}
    />
  );
}
