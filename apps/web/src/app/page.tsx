export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { apiFetch } from '../lib/api';
import HomePageClient from './home-page-client';
import {
  enrichMatches,
  extractMatchPagination,
  type EnrichedMatch,
  type MatchRow,
} from '../lib/matches';
import { resolveServerLocale } from '../lib/server-locale';

type Sport = { id: string; name: string };

export default async function HomePage() {
  let sports: Sport[] = [];
  let matches: EnrichedMatch[] = [];
  let matchHasMore = false;
  let matchNextOffset: number | null = null;
  let matchPageSize = 5;
  let sportError = false;
  let matchError = false;
  const cookieStore = cookies();
  const { locale, timeZone } = resolveServerLocale({ cookieStore });

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
      const rows = (await matchesResult.value.json()) as MatchRow[];
      const pagination = extractMatchPagination(
        matchesResult.value.headers,
        MATCHES_LIMIT,
      );
      matches = await enrichMatches(rows);
      matchHasMore = pagination.hasMore;
      matchNextOffset = pagination.nextOffset;
      matchPageSize = pagination.limit;
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
      initialTimeZone={timeZone}
    />
  );
}
