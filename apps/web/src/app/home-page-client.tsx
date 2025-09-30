'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { apiFetch } from '../lib/api';
import {
  enrichMatches,
  extractMatchPagination,
  type EnrichedMatch,
  type MatchRow,
} from '../lib/matches';
import MatchParticipants from '../components/MatchParticipants';
import { useLocale, useTimeZone } from '../lib/LocaleContext';
import { ensureTrailingSlash, recordPathForSport } from '../lib/routes';
import { formatDateTime, NEUTRAL_FALLBACK_LOCALE } from '../lib/i18n';
import { useApiSWR } from '../lib/useApiSWR';

interface Sport {
  id: string;
  name: string;
}

const PLACEHOLDER_META_VALUES = new Set([
  '',
  '-',
  '–',
  '—',
  'n/a',
  'na',
  'best of —',
  'mejor de —',
]);

function normalizeMetadataSegment(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}` : undefined;
  }
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  if (PLACEHOLDER_META_VALUES.has(normalized)) {
    return undefined;
  }
  return trimmed;
}

function formatMatchMetadata(parts: Array<string | null | undefined>): string {
  const normalizedParts = parts
    .map((part) => normalizeMetadataSegment(part))
    .filter((part): part is string => Boolean(part));

  if (!normalizedParts.length) {
    return '';
  }

  return normalizedParts.join(' · ');
}

type MatchWithOptionalRuleset = EnrichedMatch & {
  rulesetName?: string | null;
  rulesetLabel?: string | null;
  ruleset?: unknown;
};

function resolveRulesetLabel(match: MatchWithOptionalRuleset): string | undefined {
  const directName = normalizeMetadataSegment(match.rulesetName);
  if (directName) return directName;

  const directLabel = normalizeMetadataSegment(match.rulesetLabel);
  if (directLabel) return directLabel;

  const { ruleset } = match;
  if (!ruleset) return undefined;

  if (typeof ruleset === 'string') {
    return normalizeMetadataSegment(ruleset);
  }

  if (typeof ruleset === 'object' && !Array.isArray(ruleset)) {
    const record = ruleset as Record<string, unknown>;
    const candidateKeys = ['shortName', 'short_name', 'name', 'label', 'title'];
    for (const key of candidateKeys) {
      const value = record[key];
      const normalized = normalizeMetadataSegment(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}

const sportIcons: Record<string, { glyph: string; labelKey: `sportIcons.${string}` }> = {
  padel: {
    glyph: '\uD83C\uDFBE',
    labelKey: 'sportIcons.padel',
  },
  padel_americano: {
    glyph: '🧮',
    labelKey: 'sportIcons.padel_americano',
  },
  bowling: {
    glyph: '🎳',
    labelKey: 'sportIcons.bowling',
  },
  tennis: {
    glyph: '🎾',
    labelKey: 'sportIcons.tennis',
  },
  pickleball: {
    glyph: '🥒',
    labelKey: 'sportIcons.pickleball',
  },
  badminton: {
    glyph: '🏸',
    labelKey: 'sportIcons.badminton',
  },
  table_tennis: {
    glyph: '🏓',
    labelKey: 'sportIcons.table_tennis',
  },
  disc_golf: {
    glyph: '🥏',
    labelKey: 'sportIcons.disc_golf',
  },
};

interface Props {
  sports: Sport[];
  matches: EnrichedMatch[];
  sportError: boolean;
  matchError: boolean;
  initialLocale?: string;
  initialHasMore: boolean;
  initialNextOffset: number | null;
  initialPageSize: number;
}

function mergeMatchPageWithPrevious(
  previousMatches: EnrichedMatch[],
  nextPageMatches: EnrichedMatch[],
): { matches: EnrichedMatch[]; hasAdditionalMatches: boolean } {
  let hasAdditionalMatches = false;
  let matches: EnrichedMatch[] = nextPageMatches;

  if (previousMatches.length) {
    const nextIds = new Set(nextPageMatches.map((match) => match.id));
    const preservedMatches: EnrichedMatch[] = [];

    for (const match of previousMatches) {
      if (!nextIds.has(match.id)) {
        preservedMatches.push(match);
        hasAdditionalMatches = true;
      }
    }

    if (!hasAdditionalMatches && previousMatches.length === nextPageMatches.length) {
      let isSameOrder = true;
      for (let index = 0; index < previousMatches.length; index += 1) {
        if (previousMatches[index]?.id !== nextPageMatches[index]?.id) {
          isSameOrder = false;
          break;
        }
      }

      if (isSameOrder) {
        matches = previousMatches;
      }
    }

    if (matches === nextPageMatches) {
      if (!preservedMatches.length && previousMatches.length === nextPageMatches.length) {
        matches = nextPageMatches;
      } else {
        matches = [...nextPageMatches, ...preservedMatches];
      }
    }
  }

  return { matches, hasAdditionalMatches };
}

function resolveNextOffset(
  currentNextOffset: number | null | undefined,
  matchPageNextOffset: number | null | undefined,
  hasAdditionalMatches: boolean,
): number | null | undefined {
  if (!hasAdditionalMatches) {
    return matchPageNextOffset;
  }

  if (matchPageNextOffset === null || matchPageNextOffset === undefined) {
    return currentNextOffset ?? null;
  }

  if (currentNextOffset === null || currentNextOffset === undefined) {
    return matchPageNextOffset;
  }

  if (typeof currentNextOffset === 'number') {
    return typeof matchPageNextOffset === 'number'
      ? Math.max(currentNextOffset, matchPageNextOffset)
      : currentNextOffset;
  }

  return currentNextOffset ?? null;
}

export default function HomePageClient({
  sports: initialSports,
  matches: initialMatches,
  sportError: initialSportError,
  matchError: initialMatchError,
  initialLocale = NEUTRAL_FALLBACK_LOCALE,
  initialHasMore,
  initialNextOffset,
  initialPageSize,
}: Props): ReactElement {
  const tHome = useTranslations('home');
  const tCommon = useTranslations('common');
  const [matches, setMatches] = useState(initialMatches);
  const [sportError, setSportError] = useState(initialSportError);
  const [matchError, setMatchError] = useState(initialMatchError);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const localeFromContext = useLocale();
  const timeZone = useTimeZone();
  const activeLocale =
    localeFromContext || initialLocale || NEUTRAL_FALLBACK_LOCALE;
  const formatMatchDate = useMemo(
    () => (value: Date | string | number | null | undefined) =>
      formatDateTime(value, activeLocale, 'compact', timeZone),
    [activeLocale, timeZone],
  );

  const {
    data: sportsData,
    error: sportsError,
    isLoading: sportsIsLoading,
    isValidating: sportsIsValidating,
    mutate: mutateSports,
  } = useApiSWR<Sport[]>('/v0/sports', {
    swr: {
      fallbackData: initialSportError ? undefined : initialSports,
      revalidateOnMount: initialSportError,
    },
  });

  useEffect(() => {
    if (sportsError) {
      setSportError(true);
    } else if (sportsData) {
      setSportError(false);
    }
  }, [sportsError, sportsData]);

  const sports = sportsData ?? [];
  const sportsLoading =
    !sportError && sports.length === 0 && sportsIsLoading;
  const sportsRevalidating = sports.length > 0 && sportsIsValidating;
  const sportsStatusVisible = sportsLoading || sportsRevalidating;

  const parseMatchesResponse = async (
    response: Response,
    fallbackLimit: number,
  ): Promise<{
    enriched: EnrichedMatch[];
    limit: number;
    hasMore: boolean;
    nextOffset: number | null;
  }> => {
    const parsed = await response.json();
    const rows = Array.isArray(parsed)
      ? (parsed as MatchRow[])
      : Array.isArray((parsed as { items?: unknown }).items)
      ? ((parsed as { items: MatchRow[] }).items ?? [])
      : [];
    const headerBag =
      response && "headers" in response && response.headers instanceof Headers
        ? response.headers
        : new Headers();
    const pagination = extractMatchPagination(headerBag, fallbackLimit);
    const enriched = await enrichMatches(rows);
    return {
      enriched,
      limit: pagination.limit,
      hasMore: pagination.hasMore,
      nextOffset: pagination.nextOffset,
    };
  };

  const retrySports = async () => {
    await mutateSports(undefined, { revalidate: true });
  };

  const {
    data: matchPage,
    error: matchesError,
    isLoading: matchesIsLoading,
    isValidating: matchesIsValidating,
    mutate: mutateMatches,
  } = useApiSWR<{
    enriched: EnrichedMatch[];
    limit: number;
    hasMore: boolean;
    nextOffset: number | null;
  }>(`/v0/matches?limit=${pageSize}`, {
    parse: (response) => parseMatchesResponse(response, pageSize),
    swr: {
      fallbackData: initialMatchError
        ? undefined
        : {
            enriched: initialMatches,
            limit: initialPageSize,
            hasMore: initialHasMore,
            nextOffset: initialNextOffset,
          },
      revalidateOnMount: initialMatchError,
    },
  });

  useEffect(() => {
    if (matchesError) {
      setMatchError(true);
    }
  }, [matchesError]);

  useEffect(() => {
    if (!matchPage) return;

    setMatches((previousMatches) => {
      const { matches: nextMatches, hasAdditionalMatches } = mergeMatchPageWithPrevious(
        previousMatches,
        matchPage.enriched,
      );

      setNextOffset((currentNextOffset) =>
        resolveNextOffset(currentNextOffset, matchPage.nextOffset, hasAdditionalMatches),
      );

      if (typeof matchPage.limit === 'number') {
        setPageSize((currentPageSize) =>
          matchPage.limit !== currentPageSize ? matchPage.limit : currentPageSize,
        );
      }

      setHasMore(matchPage.hasMore);

      setMatchError(false);

      return nextMatches;
    });
  }, [matchPage]);

  const matchesLoading =
    !matchError && matches.length === 0 && matchesIsLoading;
  const matchesRevalidating = matches.length > 0 && matchesIsValidating;
  const matchesStatusVisible = matchesLoading || matchesRevalidating;

  const retryMatches = async () => {
    setPaginationError(false);
    await mutateMatches(undefined, { revalidate: true });
  };

  const loadMoreMatches = async () => {
    if (!hasMore || loadingMore) return;
    const previousScrollPosition = window.scrollY;
    setPaginationError(false);
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (nextOffset !== null) {
        params.set('offset', String(nextOffset));
      }
      const r = await apiFetch(`/v0/matches?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!r.ok) {
        throw new Error('Failed to fetch more matches');
      }
      const result = await parseMatchesResponse(r, pageSize);
      setMatches((prev) => {
        const mergedMatches = [...prev];
        const indexById = new Map<string, number>();

        mergedMatches.forEach((match, index) => {
          indexById.set(match.id, index);
        });

        result.enriched.forEach((match) => {
          const existingIndex = indexById.get(match.id);
          if (existingIndex === undefined) {
            indexById.set(match.id, mergedMatches.length);
            mergedMatches.push(match);
            return;
          }

          mergedMatches[existingIndex] = match;
        });

        requestAnimationFrame(() => {
          window.scrollTo({ top: previousScrollPosition, behavior: 'auto' });
        });

        return mergedMatches;
      });
      setHasMore(result.hasMore);
      setNextOffset(result.nextOffset);
      setPageSize(result.limit ?? pageSize);
    } catch (err) {
      console.error(err);
      setPaginationError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main className="container">
      <section className="card">
        <h1 className="heading">{tHome('hero.title')}</h1>
        <p>{tHome('hero.tagline')}</p>
      </section>

      <section className="section">
        <h2 className="heading">{tHome('sections.sports')}</h2>
        {sportsStatusVisible ? (
          <p className="sr-only" role="status" aria-live="polite">
            {tHome('sports.status.updating')}
          </p>
        ) : null}
        {sportsLoading && sports.length === 0 ? (
          <div role="status" aria-live="polite">
            <p className="sr-only">{tHome('sports.status.loading')}</p>
            <ul className="sport-list">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={`sport-skeleton-${i}`} className="sport-item">
                  <div className="skeleton" style={{ width: '100%', height: '1em' }} />
                </li>
              ))}
            </ul>
          </div>
        ) : sports.length === 0 ? (
          sportError ? (
            <p role="alert">
              {tHome('sports.error.message')}{' '}
              <button
                type="button"
                onClick={retrySports}
                className="link-button"
              >
                {tCommon('retry')}
              </button>
            </p>
          ) : (
            <p>{tHome('sports.empty')}</p>
          )
        ) : (
          <ul className="sport-list" role="list">
            {sports.map((s) => {
              const icon = sportIcons[s.id];
              const href = recordPathForSport(s.id);
              const ariaLabel = icon ? tHome(icon.labelKey) : undefined;
              return (
                <li key={s.id} className="sport-item">
                  <Link href={href} className="sport-link">
                    {icon ? (
                      <span className="sport-icon" role="img" aria-label={ariaLabel}>
                        {icon.glyph}
                      </span>
                    ) : null}
                    <span className="sport-name">{s.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="heading">{tHome('sections.recentMatches')}</h2>
        {matchesStatusVisible ? (
          <p className="sr-only" role="status" aria-live="polite">
            {tHome('matches.status.updating')}
          </p>
        ) : null}
        {matchesLoading && matches.length === 0 ? (
          <div role="status" aria-live="polite">
            <p className="sr-only">{tHome('matches.status.loading')}</p>
            <ul className="match-list">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={`match-skeleton-${i}`} className="card match-item">
                  <div
                    className="skeleton"
                    style={{ width: '60%', height: '1em', marginBottom: '4px' }}
                  />
                  <div className="skeleton" style={{ width: '40%', height: '0.8em' }} />
                </li>
              ))}
            </ul>
          </div>
        ) : matches.length === 0 ? (
          matchError ? (
            <p role="alert">
              {tHome('matches.error.message')}{' '}
              <button
                type="button"
                onClick={retryMatches}
                className="link-button"
              >
                {tCommon('retry')}
              </button>
            </p>
          ) : (
            <p>{tHome('matches.empty')}</p>
          )
        ) : (
          <ul className="match-list" role="list">
            {matches.map((m) => {
              const matchWithRuleset = m as MatchWithOptionalRuleset;
              const rulesetLabel = resolveRulesetLabel(matchWithRuleset);
              const metadataText = formatMatchMetadata([
                matchWithRuleset.sport,
                matchWithRuleset.bestOf != null
                  ? tHome('metadata.bestOf', { count: matchWithRuleset.bestOf })
                  : null,
                rulesetLabel,
                formatMatchDate(matchWithRuleset.playedAt),
                matchWithRuleset.location,
              ]);

              return (
                <li key={m.id} className="card match-item">
                  <MatchParticipants
                    sides={Object.values(m.players)}
                    style={{ fontWeight: 500 }}
                  />
                  <div className="match-meta">
                    {metadataText || tCommon('metadataFallback')}
                  </div>
                  <div>
                    <Link href={ensureTrailingSlash(`/matches/${m.id}`)}>
                      {tHome('matches.actions.details')}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {matches.length > 0 ? (
          <div className="match-actions">
            {hasMore ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void loadMoreMatches();
                  }}
                  className="button"
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? tCommon('loading')
                    : tHome('matches.actions.loadMore')}
                </button>
                {loadingMore ? (
                  <p className="sr-only" aria-live="polite">
                    {tCommon('loadingMore')}
                  </p>
                ) : null}
                {paginationError ? (
                  <p role="alert" className="error-text">
                    {tHome('matches.actions.loadMoreError')}
                  </p>
                ) : null}
              </>
            ) : (
              <Link href="/matches" className="view-all-link">
                {tHome('matches.actions.viewAll')}
              </Link>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
