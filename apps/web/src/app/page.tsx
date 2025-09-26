export const dynamic = 'force-dynamic';

import { apiFetch } from '../lib/api';
import HomePageClient from './home-page-client';
import {
  enrichMatches,
  type EnrichedMatch,
  type MatchRowPage,
} from '../lib/matches';
import { headers } from 'next/headers';
import { parseAcceptLanguage } from '../lib/i18n';

type Sport = { id: string; name: string };

export default async function HomePage() {
  let sports: Sport[] = [];
  let matches: EnrichedMatch[] = [];
  let matchHasMore = false;
  let matchNextOffset: number | null = null;
  let matchPageSize = 5;
  let sportError = false;
  let matchError = false;
  const locale = parseAcceptLanguage(headers().get('accept-language'));

  const MATCHES_LIMIT = 5;

  const [sportsResult, matchesResult] = await Promise.allSettled([
    apiFetch('/v0/sports', { next: { revalidate: 60 } }),
    apiFetch(`/v0/matches?limit=${MATCHES_LIMIT}`, {
      next: { revalidate: 60 },
    }),
  ]);

  if (sportsResult.status === 'fulfilled' && sportsResult.value.ok) {
    sports = (await sportsResult.value.json()) as Sport[];
  } else {
    sportError = true;
  }

  if (matchesResult.status === 'fulfilled' && matchesResult.value.ok) {
    try {
      const page = (await matchesResult.value.json()) as MatchRowPage;
      matches = await enrichMatches(page.items);
      matchHasMore = page.hasMore;
      matchNextOffset = page.nextOffset;
      matchPageSize = page.limit ?? MATCHES_LIMIT;
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
      initialHasMore={matchHasMore}
      initialNextOffset={matchNextOffset}
      initialPageSize={matchPageSize}
      sportError={sportError}
      matchError={matchError}
      initialLocale={locale}
    />
  );
}
