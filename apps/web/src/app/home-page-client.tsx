'use client';

import {
  useMemo,
  useState,
  type MouseEvent,
  type ReactElement,
} from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';
import {
  enrichMatches,
  extractMatchPagination,
  type EnrichedMatch,
  type MatchRow,
} from '../lib/matches';
import MatchParticipants from '../components/MatchParticipants';
import { useLocale } from '../lib/LocaleContext';
import { ensureTrailingSlash, recordPathForSport } from '../lib/routes';
import { formatDateTime, NEUTRAL_FALLBACK_LOCALE } from '../lib/i18n';

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

function formatMatchMetadata(
  parts: Array<string | null | undefined>,
): string {
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

const sportIcons: Record<string, string> = {
  padel: '\uD83C\uDFBE', // tennis ball
  bowling: '🎳',
  tennis: '🎾',
  pickleball: '🥒',
  badminton: '🏸',
  table_tennis: '🏓',
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
  const [sports, setSports] = useState(initialSports);
  const [matches, setMatches] = useState(initialMatches);
  const [sportError, setSportError] = useState(initialSportError);
  const [matchError, setMatchError] = useState(initialMatchError);
  const [sportsLoading, setSportsLoading] = useState(false);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const localeFromContext = useLocale();
  const activeLocale =
    localeFromContext || initialLocale || NEUTRAL_FALLBACK_LOCALE;
  const formatMatchDate = useMemo(
    () => (value: Date | string | number | null | undefined) =>
      formatDateTime(value, activeLocale, 'compact'),
    [activeLocale],
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

  const retrySports = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setSportsLoading(true);
    try {
      const r = await apiFetch('/v0/sports', { cache: 'no-store' });
      if (r.ok) {
        setSports((await r.json()) as Sport[]);
        setSportError(false);
      } else {
        setSportError(true);
      }
    } catch {
      setSportError(true);
    } finally {
      setSportsLoading(false);
    }
  };

  const retryMatches = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setMatchesLoading(true);
    setPaginationError(false);
    try {
      const r = await apiFetch(`/v0/matches?limit=${pageSize}`, {
        cache: 'no-store',
      });
      if (r.ok) {
        const result = await parseMatchesResponse(r, pageSize);
        setMatches(result.enriched);
        setMatchError(false);
        setHasMore(result.hasMore);
        setNextOffset(result.nextOffset);
        setPageSize(result.limit ?? pageSize);
      } else {
        setMatchError(true);
      }
    } catch {
      setMatchError(true);
    } finally {
      setMatchesLoading(false);
    }
  };

  const loadMoreMatches = async () => {
    if (!hasMore || loadingMore) return;
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
      setMatches((prev) => [...prev, ...result.enriched]);
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
        <h1 className="heading">cross-sport-tracker</h1>
        <p>Ongoing self-hosted project</p>
      </section>

      <section className="section">
        <h2 className="heading">Sports</h2>
        {sportsLoading && sports.length === 0 ? (
          <ul className="sport-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={`sport-skeleton-${i}`} className="sport-item">
                <div className="skeleton" style={{ width: '100%', height: '1em' }} />
              </li>
            ))}
          </ul>
        ) : sports.length === 0 ? (
          sportError ? (
            <p>
              Unable to load sports. Check connection.{' '}
              <a href="#" onClick={retrySports}>
                Retry
              </a>
            </p>
          ) : (
            <p>No sports found.</p>
          )
        ) : (
          <ul className="sport-list" role="list">
            {sports.map((s) => {
              const icon = sportIcons[s.id];
              const href = recordPathForSport(s.id);
              return (
                <li key={s.id} className="sport-item">
                  <Link href={href} className="sport-link">
                    {icon ? (
                      <span className="sport-icon" aria-hidden="true">
                        {icon}
                      </span>
                    ) : null}
                    {icon ? (
                      <span className="sr-only">{`${s.name} icon`}</span>
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
        <h2 className="heading">Recent Matches</h2>
        {matchesLoading && matches.length === 0 ? (
          <ul className="match-list">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={`match-skeleton-${i}`} className="card match-item">
                <div className="skeleton" style={{ width: '60%', height: '1em', marginBottom: '4px' }} />
                <div className="skeleton" style={{ width: '40%', height: '0.8em' }} />
              </li>
            ))}
          </ul>
        ) : matches.length === 0 ? (
          matchError ? (
            <p>
              Unable to load matches. Check connection.{' '}
              <a href="#" onClick={retryMatches}>
                Retry
              </a>
            </p>
          ) : (
            <p>No matches recorded yet.</p>
          )
        ) : (
          <ul className="match-list" role="list">
            {matches.map((m) => {
              const matchWithRuleset = m as MatchWithOptionalRuleset;
              const rulesetLabel = resolveRulesetLabel(matchWithRuleset);
              const metadataText = formatMatchMetadata([
                matchWithRuleset.sport,
                matchWithRuleset.bestOf != null
                  ? `Best of ${matchWithRuleset.bestOf}`
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
                  <div className="match-meta">{metadataText || '—'}</div>
                  <div>
                    <Link href={ensureTrailingSlash(`/matches/${m.id}`)}>
                      Match details
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
                  {loadingMore ? 'Loading…' : 'Load more matches'}
                </button>
                {paginationError ? (
                  <p role="alert" className="error-text">
                    Unable to load more matches. Please try again.
                  </p>
                ) : null}
              </>
            ) : (
              <Link href="/matches" className="view-all-link">
                View all matches
              </Link>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
