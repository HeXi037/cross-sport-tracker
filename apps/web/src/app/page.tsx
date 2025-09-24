export const dynamic = 'force-dynamic';

import { apiFetch } from '../lib/api';
import HomePageClient from './home-page-client';
import { enrichMatches, type MatchRow, type EnrichedMatch } from '../lib/matches';
import { headers } from 'next/headers';
import { parseAcceptLanguage } from '../lib/i18n';

type Sport = { id: string; name: string };

export default async function HomePage() {
  let sports: Sport[] = [];
  let matches: EnrichedMatch[] = [];
  let sportError = false;
  let matchError = false;
  const locale = parseAcceptLanguage(headers().get('accept-language'));

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
    try {
      const rows = (await matchesResult.value.json()) as MatchRow[];
      matches = await enrichMatches(rows.slice(0, 5));
    } catch {
      matchError = true;
    }
  } else {
    matchError = true;
  }

  return (
    <HomePageClient
      sports={sports}
      matches={matches}
      sportError={sportError}
      matchError={matchError}
      initialLocale={locale}
    />
  );
}
