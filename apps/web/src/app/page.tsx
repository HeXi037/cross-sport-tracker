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

  try {
    const r = await apiFetch('/v0/sports', { next: { revalidate: 60 } });
    if (r.ok) {
      sports = (await r.json()) as Sport[];
    } else {
      sportError = true;
    }
  } catch {
    sportError = true;
  }

  try {
    const r = await apiFetch('/v0/matches', { next: { revalidate: 60 } });
    if (r.ok) {
      matches = (await r.json()) as MatchRow[];
    } else {
      matchError = true;
    }
  } catch {
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
