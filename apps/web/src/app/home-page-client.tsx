'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import {
  enrichMatches,
  extractMatchPagination,
  type EnrichedMatch,
  type MatchSummaryData,
  type MatchRow,
} from '../lib/matches';
import MatchParticipants from '../components/MatchParticipants';
import { useLocale, useTimeZone } from '../lib/LocaleContext';
import { ensureTrailingSlash, recordPathForSport } from '../lib/routes';
import { formatDateTime, NEUTRAL_FALLBACK_LOCALE } from '../lib/i18n';
import { useApiSWR } from '../lib/useApiSWR';
import {
  canonicalizeSportId,
  createSportDisplayNameLookup,
} from '../lib/sports';
import { useTranslations } from 'next-intl';
import { normalizeSetScoreEntry } from '../lib/match-summary';

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
  let metadata = '';

  for (const part of parts) {
    const normalized = normalizeMetadataSegment(part);
    if (!normalized) {
      continue;
    }

    metadata = metadata ? `${metadata} · ${normalized}` : normalized;
  }

  return metadata;
}

function formatSummary(
  summary: MatchSummaryData | null | undefined,
  labels: { sets: string; games: string; points: string },
): string {
  if (!summary) return '';

  if (Array.isArray(summary.set_scores) && summary.set_scores.length) {
    const formatted = summary.set_scores
      .map((set) => {
        const normalized = normalizeSetScoreEntry(set);
        if (!normalized) return null;

        const setScores = normalized.sides.map((side) => normalized.scores[side]);
        const hasAllScores = setScores.every((value) => typeof value === 'number');
        if (!hasAllScores) return null;

        const tiebreakValues = normalized.tiebreak
          ? normalized.sides.map((side) => normalized.tiebreak?.[side])
          : null;
        const hasTiebreak =
          tiebreakValues?.every((value) => typeof value === 'number') ?? false;

        const base = setScores.join('-');
        return hasTiebreak ? `${base} (${tiebreakValues?.join('-')})` : base;
      })
      .filter((val): val is string => Boolean(val));

    if (formatted.length) {
      return formatted.join(', ');
    }
  }

  const render = (scores: Record<string, number>, label: string) => {
    const parts = Object.keys(scores)
      .sort()
      .map((key) => scores[key]);
    return `${label} ${parts.join('-')}`;
  };

  if (summary.sets) return render(summary.sets, labels.sets);
  if (summary.games) return render(summary.games, labels.games);
  if (summary.points) return render(summary.points, labels.points);
  return '';
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

const sportIcons: Record<string, { glyph: string; labelKey: string }> = {
  padel: {
    glyph: '\uD83C\uDFBE',
    labelKey: 'icons.padel',
  },
  padel_americano: {
    glyph: '🧮',
    labelKey: 'icons.padel_americano',
  },
  bowling: {
    glyph: '🎳',
    labelKey: 'icons.bowling',
  },
  tennis: {
    glyph: '🎾',
    labelKey: 'icons.tennis',
  },
  pickleball: {
    glyph: '🥒',
    labelKey: 'icons.pickleball',
  },
  badminton: {
    glyph: '🏸',
    labelKey: 'icons.badminton',
  },
  table_tennis: {
    glyph: '🏓',
    labelKey: 'icons.table_tennis',
  },
  disc_golf: {
    glyph: '🥏',
    labelKey: 'icons.disc_golf',
  },
} as const;

function pickFirstNonEmpty(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return null;
}

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
  currentNextOffset: number | null,
  matchPageNextOffset: number | null | undefined,
  hasAdditionalMatches: boolean,
): number | null {
  const normalizedCurrent = currentNextOffset ?? null;
  const normalizedNext = matchPageNextOffset ?? null;

  if (!hasAdditionalMatches) {
    return normalizedNext;
  }

  if (normalizedNext === null) {
    return normalizedCurrent;
  }

  if (normalizedCurrent === null) {
    return normalizedNext;
  }

  return Math.max(normalizedCurrent, normalizedNext);
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
  const commonT = useTranslations('Common');
  const homeT = useTranslations('Home');
  const matchesT = useTranslations('Matches');
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

  const sports = useMemo(() => {
    if (sportsData) {
      return sportsData;
    }
    if (!initialSportError) {
      return initialSports;
    }
    return [];
  }, [sportsData, initialSportError, initialSports]);
  const sportsLoading =
    !sportError && sports.length === 0 && sportsIsLoading;
  const sportsRevalidating = sports.length > 0 && sportsIsValidating;
  const sportsStatusVisible = sportsLoading || sportsRevalidating;
  const getSportName = useMemo(
    () => createSportDisplayNameLookup(sports),
    [sports],
  );

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
        <h1 className="heading">{commonT('appName')}</h1>
        <p>{commonT('appTagline')}</p>
      </section>

      <section className="hero hero--subtle">
        <div className="hero__content">
          <p className="hero__eyebrow">{homeT('hero.eyebrow')}</p>
          <h2 className="hero__title">{homeT('hero.title')}</h2>
          <p className="hero__subtitle">{homeT('hero.subtitle')}</p>
          <div className="hero__actions">
            <Link href="/landing" className="button hero__cta">
              {homeT('hero.primaryCta')}
            </Link>
            <Link href="/demo" className="button button--ghost hero__secondary">
              {homeT('hero.secondaryCta')}
            </Link>
          </div>
          <p className="hero__supporting">{homeT('hero.supportingCopy')}</p>
        </div>
      </section>

      <section className="section">
        <h2 className="heading">{homeT('sportsHeading')}</h2>
        {sportsStatusVisible ? (
          <p className="sr-only" role="status" aria-live="polite">
            {commonT('status.updatingSports')}
          </p>
        ) : null}
        {sportsLoading && sports.length === 0 ? (
          <div role="status" aria-live="polite">
            <p className="sr-only">{commonT('status.loadingSports')}</p>
            <ul className="sport-list">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={`sport-skeleton-${i}`} className="sport-item">
                  <div className="sport-card sport-card--loading" aria-hidden>
                    <div
                      className="skeleton"
                      style={{ width: '48px', height: '48px', borderRadius: '12px' }}
                    />
                    <div className="sport-card__content">
                      <div
                        className="skeleton"
                        style={{ width: '60%', height: '1em', marginBottom: '6px' }}
                      />
                      <div
                        className="skeleton"
                        style={{ width: '40%', height: '0.9em' }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : sports.length === 0 ? (
          sportError ? (
            <p role="alert">
              {homeT('sportsError')}{' '}
              <button
                type="button"
                onClick={retrySports}
                className="link-button"
              >
                {commonT('actions.retry')}
              </button>
            </p>
          ) : (
            <p>{homeT('noSports')}</p>
          )
        ) : (
          <ul className="sport-list" role="list">
            {sports.map((s) => {
              const icon =
                sportIcons[s.id] ?? sportIcons[canonicalizeSportId(s.id)];
              const href = recordPathForSport(s.id);
              const displayName = getSportName(s.id);
              let iconLabel: string | null = null;
              if (icon) {
                try {
                  iconLabel = homeT(icon.labelKey);
                } catch {
                  iconLabel = null;
                }
              }
              const iconAriaLabel =
                pickFirstNonEmpty(
                  iconLabel,
                  displayName,
                  typeof s.name === 'string' ? s.name : null,
                  homeT('sportsHeading'),
                ) ?? homeT('sportsHeading');
              return (
                <li key={s.id} className="sport-item">
                  <Link href={href} className="sport-card">
                    <div className="sport-card__icon" aria-hidden={!icon}>
                      {icon ? (
                        <span
                          className="sport-icon"
                          role="img"
                          aria-label={iconAriaLabel}
                        >
                          {icon.glyph}
                        </span>
                      ) : null}
                    </div>
                    <div className="sport-card__content">
                      <h3 className="sport-card__name">{displayName}</h3>
                      <p className="sport-card__cta">{homeT('matchesHeading')}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section">
        <h2 className="heading">{homeT('matchesHeading')}</h2>
        {matchesStatusVisible ? (
          <p className="sr-only" role="status" aria-live="polite">
            {commonT('status.updatingMatches')}
          </p>
        ) : null}
        {matchesLoading && matches.length === 0 ? (
          <div role="status" aria-live="polite">
            <p className="sr-only">{commonT('status.loadingRecentMatches')}</p>
            <ul className="match-list">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={`match-skeleton-${i}`} className="match-list__item">
                  <div className="match-card match-card--loading" aria-hidden>
                    <div className="match-card__content">
                      <div className="match-card__header">
                        <div
                          className="skeleton"
                          style={{ width: '70%', height: '1em', marginBottom: '6px' }}
                        />
                        <div
                          className="skeleton"
                          style={{ width: '40%', height: '0.9em', marginBottom: '10px' }}
                        />
                      </div>
                      <div className="match-card__details">
                        <div className="match-card__detail">
                          <div className="skeleton" style={{ width: '80%', height: '0.85em' }} />
                        </div>
                        <div className="match-card__detail">
                          <div className="skeleton" style={{ width: '60%', height: '0.85em' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : matches.length === 0 ? (
          matchError ? (
            <p role="alert" aria-live="assertive">
              {homeT('matchesError')}{' '}
              <button
                type="button"
                onClick={retryMatches}
                className="link-button"
              >
                {commonT('actions.retry')}
              </button>
            </p>
          ) : (
            <p>{homeT('noMatches')}</p>
          )
        ) : (
          <ul className="match-list" role="list">
            {matches.map((m) => {
              const matchWithRuleset = m as MatchWithOptionalRuleset;
              const rulesetLabel = resolveRulesetLabel(matchWithRuleset);
              const playedAtText = formatMatchDate(matchWithRuleset.playedAt);
              const locationText =
                matchWithRuleset.location?.trim() || homeT('locationTbd');
              const summaryLabels = {
                sets: matchesT('summary.sets'),
                games: matchesT('summary.games'),
                points: matchesT('summary.points'),
              };
              const summaryText = formatSummary(m.summary, summaryLabels);
              const metadataText = formatMatchMetadata([
                matchWithRuleset.bestOf != null
                  ? commonT('match.bestOf', { count: matchWithRuleset.bestOf })
                  : null,
                rulesetLabel,
              ]);
              const matchTitleId = `match-${m.id}-heading`;

              return (
                <li key={m.id} className="match-list__item">
                  <Link
                    href={ensureTrailingSlash(`/matches/${m.id}`)}
                    className="match-card"
                    aria-labelledby={matchTitleId}
                  >
                    <article className="match-card__content">
                      <header className="match-card__header">
                        <p className="match-card__eyebrow">
                          {getSportName(matchWithRuleset.sport)}
                        </p>
                        <h3 id={matchTitleId} className="match-card__heading">
                          <MatchParticipants
                            sides={Object.values(m.players)}
                            className="match-card__participants"
                          />
                        </h3>
                        <p className="match-card__score" aria-label={homeT('scoreLabel')}>
                          {summaryText || homeT('scorePending')}
                        </p>
                      </header>
                      <section
                        className="match-card__details"
                        aria-label={commonT('match.details')}
                      >
                        <div className="match-card__detail">
                          <p className="match-card__detail-label">
                            {homeT('matchDateLabel')}
                          </p>
                          <p className="match-card__detail-value">{playedAtText || '—'}</p>
                        </div>
                        <div className="match-card__detail">
                          <p className="match-card__detail-label">
                            {homeT('matchLocationLabel')}
                          </p>
                          <p className="match-card__detail-value">{locationText}</p>
                        </div>
                        {metadataText ? (
                          <div className="match-card__detail">
                            <p className="match-card__detail-label">
                              {homeT('matchFormatLabel')}
                            </p>
                            <p className="match-card__detail-value">{metadataText}</p>
                          </div>
                        ) : null}
                      </section>
                      <span className="match-card__cta">{commonT('match.details')}</span>
                    </article>
                  </Link>
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
                    ? commonT('status.loading')
                    : commonT('actions.loadMoreMatches')}
                </button>
                {loadingMore ? (
                  <p className="sr-only" aria-live="polite">
                    {commonT('status.loadingMoreMatches')}
                  </p>
                ) : null}
                {paginationError ? (
                  <p role="alert" className="error-text">
                    {commonT('errors.loadMoreMatches')}
                  </p>
                ) : null}
              </>
            ) : (
              <Link href="/matches" className="view-all-link">
                {commonT('actions.viewAllMatches')}
              </Link>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
