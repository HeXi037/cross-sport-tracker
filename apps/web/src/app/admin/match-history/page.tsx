'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, isAdmin } from '../../../lib/api';
import { rememberLoginRedirect } from '../../../lib/loginRedirect';
import { ensureTrailingSlash } from '../../../lib/routes';
import { useLocale, useTimeZone } from '../../../lib/LocaleContext';
import { formatDate, formatDateTime } from '../../../lib/i18n';

type AuditActor = {
  id: string;
  username: string;
  is_admin: boolean;
  photo_url?: string | null;
};

type MatchAuditEntry = {
  id: string;
  action: string;
  actor: AuditActor | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
  matchId: string;
  matchSport?: string | null;
  matchPlayedAt?: string | null;
  matchIsFriendly?: boolean | null;
};

type AuditResponse = {
  items: MatchAuditEntry[];
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset?: number | null;
};

const DEFAULT_LIMIT = 25;

export default function AdminMatchHistoryPage() {
  const [entries, setEntries] = useState<MatchAuditEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const locale = useLocale();
  const timeZone = useTimeZone();

  const loadEntries = useCallback(
    async (offsetValue = 0, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setStatus('loading');
      }
      try {
        const res = (await apiFetch(
          `/v0/matches/audit?limit=${DEFAULT_LIMIT}&offset=${offsetValue}`,
          { cache: 'no-store' }
        )) as Response;
        const data = (await res.json()) as AuditResponse;
        setEntries((prev) => (append ? [...prev, ...data.items] : data.items));
        setHasMore(data.hasMore);
        setNextOffset(typeof data.nextOffset === 'number' ? data.nextOffset : null);
        setStatus('loaded');
        setError(null);
      } catch (err) {
        console.error('Failed to load match history', err);
        setError('Failed to load match history.');
        setStatus('error');
      } finally {
        if (append) {
          setLoadingMore(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!isAdmin()) {
      rememberLoginRedirect();
      window.location.href = ensureTrailingSlash('/login');
      return;
    }
    loadEntries(0, false);
  }, [loadEntries]);

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) {
      return;
    }
    loadEntries(nextOffset ?? entries.length, true);
  };

  let content: ReactNode;
  if (status === 'loading' && entries.length === 0) {
    content = <p className="match-detail-empty">Loading history…</p>;
  } else if (status === 'error' && entries.length === 0) {
    content = (
      <p className="match-detail-empty" role="alert">
        {error ?? 'Failed to load match history.'}
      </p>
    );
  } else if (entries.length === 0) {
    content = <p className="match-detail-empty">No match activity recorded yet.</p>;
  } else {
    content = (
      <>
        <ul className="match-history__list" aria-live="polite">
          {entries.map((entry) => {
            const actorName = entry.actor?.username ?? 'System';
            const timestamp = formatDateTime(entry.createdAt, locale, 'compact', timeZone);
            const matchUrl = ensureTrailingSlash(`/matches/${entry.matchId}`);
            const matchMeta: string[] = [];
            if (entry.matchSport) {
              matchMeta.push(entry.matchSport);
            }
            if (entry.matchPlayedAt) {
              matchMeta.push(
                formatDate(entry.matchPlayedAt, locale, undefined, timeZone)
              );
            }
            if (entry.matchIsFriendly) {
              matchMeta.push('Friendly');
            }
            return (
              <li key={entry.id} className="match-history__item">
                <div className="match-history__primary">
                  <span className="match-history__action">{entry.action}</span>
                  <span className="match-history__actor">{actorName}</span>
                </div>
                <div className="match-history__timestamp">{timestamp}</div>
                <div className="match-history__match">
                  <Link href={matchUrl}>View match</Link>
                  {matchMeta.length > 0 && <span>· {matchMeta.join(' · ')}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        {hasMore && (
          <button
            type="button"
            className="button match-history__load-more"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more history'}
          </button>
        )}
      </>
    );
  }

  return (
    <main className="container">
      <h1 className="heading">Admin Match History</h1>
      <section className="card match-history">
        {content}
        {status === 'error' && entries.length > 0 && (
          <p className="match-detail-empty" role="alert">
            {error ?? 'Failed to load match history.'}
          </p>
        )}
      </section>
    </main>
  );
}
