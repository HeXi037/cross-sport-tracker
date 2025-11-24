import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { apiFetch, type ApiError } from "../../lib/api";
import Pager from "./pager";
import MatchParticipants from "../../components/MatchParticipants";
import {
  formatDate,
  formatDateTime,
  getPreferredDateOptions,
  resolveTimeZone,
} from "../../lib/i18n";
import { hasTimeComponent } from "../../lib/datetime";
import { ensureTrailingSlash } from "../../lib/routes";
import { resolveServerLocale } from "../../lib/server-locale";
import { enrichMatches, type MatchRow, type MatchSummaryData } from "../../lib/matches";
import {
  getNumericEntries,
  isRecord,
  normalizeSetScoreEntry,
} from "../../lib/match-summary";

export const dynamic = "force-dynamic";

const MATCHES_REVALIDATE_SECONDS = 60;

const MATCH_ERROR_MESSAGE_KEYS: Record<string, string> = {
  match_forbidden: "errors.forbidden",
  match_not_found: "errors.notFound",
  auth_token_expired: "errors.sessionExpired",
  auth_missing_token: "errors.sessionExpired",
  auth_invalid_token: "errors.sessionExpired",
};

type MatchPage = {
  rows: MatchRow[];
  hasMore: boolean;
  nextOffset: number | null;
  totalCount: number | null;
};

function parseIntHeader(value: string | null): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getMatches(limit: number, offset: number): Promise<MatchPage> {
  const r = await apiFetch(
    `/v0/matches?limit=${limit}&offset=${offset}`,
    { next: { revalidate: MATCHES_REVALIDATE_SECONDS } }
  );
  if (!r.ok) throw new Error(`Failed to load matches: ${r.status}`);

  const rows = (await r.json()) as MatchRow[];

  const headerAccessor =
    typeof r.headers?.get === "function" ? r.headers : undefined;
  const hasMoreHeader = headerAccessor?.get("X-Has-More") ?? null;
  const nextOffsetHeader = headerAccessor?.get("X-Next-Offset") ?? null;
  const totalCountHeader = headerAccessor?.get("X-Total-Count") ?? null;

  const normalizedHasMore =
    typeof hasMoreHeader === "string"
      ? hasMoreHeader.trim().toLowerCase() === "true"
      : null;
  const hasMore =
    normalizedHasMore !== null ? normalizedHasMore : rows.length === limit;

  const parsedNextOffset = parseIntHeader(nextOffsetHeader);
  const nextOffset = hasMore
    ? parsedNextOffset ?? (rows.length > 0 ? offset + limit : null)
    : null;

  const totalCount = parseIntHeader(totalCountHeader);

  return { rows, hasMore, nextOffset, totalCount };
}

function formatSummary(
  s: MatchSummaryData | null | undefined,
  labels: { sets: string; games: string; points: string },
): string {
  if (!s) return "";
  if (Array.isArray(s.set_scores) && s.set_scores.length) {
    const formatted = s.set_scores
      .map((set) => {
        const normalized = normalizeSetScoreEntry(set);
        if (!normalized) return null;

        const setScores = normalized.sides.map((side) => normalized.scores[side]);
        const hasAllScores = setScores.every((value) => typeof value === "number");
        if (!hasAllScores) return null;

        const tiebreakValues = normalized.tiebreak
          ? normalized.sides.map((side) => normalized.tiebreak?.[side])
          : null;
        const hasTiebreak =
          tiebreakValues?.every((value) => typeof value === "number") ?? false;

        const base = setScores.join("-");
        return hasTiebreak ? `${base} (${tiebreakValues?.join("-")})` : base;
      })
      .filter((val): val is string => Boolean(val));
    if (formatted.length) {
      return formatted.join(", ");
    }
  }
  const render = (scores: Record<string, number>, label: string) => {
    const parts = Object.keys(scores)
      .sort()
      .map((k) => scores[k]);
    return `${label} ${parts.join("-")}`;
  };
  const renderIfNumericRecord = (
    candidate: unknown,
    label: string,
  ): string | null => {
    if (!isRecord(candidate)) return null;
    const numericEntries = getNumericEntries(candidate);
    if (!numericEntries.length) return null;
    return render(Object.fromEntries(numericEntries), label);
  };

  const renderedSets = renderIfNumericRecord(s.sets, labels.sets);
  if (renderedSets) return renderedSets;

  const renderedGames = renderIfNumericRecord(s.games, labels.games);
  if (renderedGames) return renderedGames;

  const renderedPoints = renderIfNumericRecord(s.points, labels.points);
  if (renderedPoints) return renderedPoints;
  return "";
}

export default async function MatchesPage(
  props: {
    searchParams?: Record<string, string | string[] | undefined>;
  }
) {
  const searchParams = props.searchParams ?? {};
  const limit = Number(searchParams.limit) || 25;
  const offset = Number(searchParams.offset) || 0;
  const cookieStore = cookies();
  const { locale, preferredTimeZone } = resolveServerLocale({ cookieStore });
  const timeZone = resolveTimeZone(preferredTimeZone, locale);
  const preferredDateOptions = getPreferredDateOptions(locale);
  const matchesT = await getTranslations('Matches');
  const commonT = await getTranslations('Common');
  const summaryLabels = {
    sets: matchesT('summary.sets'),
    games: matchesT('summary.games'),
    points: matchesT('summary.points'),
  };

  try {
    const matchPage = await getMatches(limit, offset);
    const { rows, hasMore, nextOffset, totalCount } = matchPage;
    rows.sort((a, b) => {
      if (!a.playedAt) return 1;
      if (!b.playedAt) return -1;
      return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
    });
    const matches = await enrichMatches(rows);
    const prevOffset = Math.max(offset - limit, 0);
    const disablePrev = offset <= 0;
    const resolvedNextOffset =
      hasMore && typeof nextOffset === "number"
        ? nextOffset
        : hasMore
          ? offset + limit
          : null;
    const disableNext = !hasMore || resolvedNextOffset === null;

    const hasMatches = matches.length > 0;
    const showPager = hasMatches || offset > 0;

    return (
      <main className="container">
        <h1 className="heading">{matchesT('title')}</h1>
        {hasMatches ? (
          <ul className="match-list">
            {matches.map((m) => {
              const summaryText = formatSummary(m.summary, summaryLabels);
              const playedAtText =
                m.playedAt && hasTimeComponent(m.playedAt)
                  ? formatDateTime(m.playedAt, locale, 'compact', timeZone)
                  : formatDate(
                      m.playedAt,
                      locale,
                      preferredDateOptions,
                      timeZone,
                    );
              const participantSides = Object.entries(m.players)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, players]) => players);
              const [teamA = [], teamB = []] = participantSides;
              const playedAtDisplay = playedAtText || "—";
              const scoreDisplay = summaryText || "—";

              return (
                <li key={m.id} className="match-list__item">
                  <Link
                    href={ensureTrailingSlash(`/matches/${m.id}`)}
                    className="match-card match-card--simple"
                    tabIndex={0}
                  >
                    <div className="match-card__time-row">
                      <span className="match-card__time">{playedAtDisplay}</span>
                    </div>

                    <div className="match-card__teams-row">
                      <MatchParticipants
                        as="div"
                        sides={[teamA]}
                        className="match-card__team"
                        separatorSymbol="&"
                      />
                      <span className="match-card__divider">vs</span>
                      <MatchParticipants
                        as="div"
                        sides={[teamB]}
                        className="match-card__team match-card__team--right"
                        separatorSymbol="&"
                      />
                    </div>

                    <div className="match-card__score-row">
                      <span className="match-card__score">{scoreDisplay}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">
            {offset > 0 ? matchesT('emptyPage') : matchesT('emptyInitial')}
          </p>
        )}
        {showPager && (
          <Pager
            limit={limit}
            offset={offset}
            itemCount={matches.length}
            totalCount={totalCount}
            prevOffset={prevOffset}
            nextOffset={resolvedNextOffset}
            disablePrev={disablePrev}
            disableNext={disableNext}
          />
        )}
      </main>
    );
  } catch (err) {
    const apiError = err as ApiError | null;
    const fallbackMessage = matchesT('errors.load');
    let message = fallbackMessage;
    const code = typeof apiError?.code === "string" ? apiError.code : null;
    const serverDetail =
      typeof apiError?.parsedMessage === "string" &&
      apiError.parsedMessage.trim().length > 0
        ? apiError.parsedMessage.trim()
        : null;
    if (code) {
      const key = MATCH_ERROR_MESSAGE_KEYS[code];
      if (key) {
        message = matchesT(key);
      } else {
        console.error(
          "Unhandled matches error code",
          code,
          apiError?.parsedMessage ?? apiError?.message ?? null
        );
      }
    } else if (serverDetail) {
      message = `${fallbackMessage} (${serverDetail})`;
      console.error("Unhandled matches error message", serverDetail);
    }
    return (
      <main className="container">
        <h1 className="heading">{matchesT('title')}</h1>
        <p className="error">{message}</p>
        <Link href="/matches" style={{ textDecoration: "underline" }}>
          {commonT('actions.retry')}
        </Link>
      </main>
    );
  }
}
