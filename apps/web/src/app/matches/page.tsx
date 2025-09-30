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
  createSportDisplayNameLookup,
  fetchSportsCatalog,
} from "../../lib/sports";

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
        if (!set || typeof set !== "object") return null;
        const entries = Object.entries(set);
        if (!entries.length) return null;
        const values = entries
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([, value]) =>
            typeof value === "number" && Number.isFinite(value)
              ? value.toString()
              : null
          );
        if (values.some((v) => v === null)) return null;
        return values.join("-");
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
  if (s.sets) return render(s.sets, labels.sets);
  if (s.games) return render(s.games, labels.games);
  if (s.points) return render(s.points, labels.points);
  return "";
}

const PLACEHOLDER_VALUES = new Set(["", "—", "Best of —"]);

function formatMatchMetadata(parts: Array<string | null | undefined>): string {
  const normalizedParts = parts
    .map((part) => (typeof part === "string" ? part.trim() : part))
    .filter((part): part is string => {
      if (!part) return false;
      const normalized = part.trim();
      return normalized.length > 0 && !PLACEHOLDER_VALUES.has(normalized);
    });

  if (!normalizedParts.length) {
    return "";
  }

  return normalizedParts.join(" · ");
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
  const friendlyLabel = commonT('match.friendly');

  try {
    const [matchPage, sports] = await Promise.all([
      getMatches(limit, offset),
      fetchSportsCatalog(),
    ]);
    const { rows, hasMore, nextOffset, totalCount } = matchPage;
    rows.sort((a, b) => {
      if (!a.playedAt) return 1;
      if (!b.playedAt) return -1;
      return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
    });
    const matches = await enrichMatches(rows);
    const getSportName = createSportDisplayNameLookup(sports);
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
              const metadataText = formatMatchMetadata([
                m.isFriendly ? friendlyLabel : null,
                getSportName(m.sport),
                m.bestOf != null
                  ? commonT('match.bestOf', { count: m.bestOf })
                  : null,
                playedAtText,
                m.location,
              ]);
              const participantSides = Object.entries(m.players)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, players]) => players);

              return (
                <li key={m.id} className="card match-item">
                  <MatchParticipants sides={participantSides} />
                  <div className="match-meta">
                    {summaryText}
                    {summaryText && metadataText ? " · " : ""}
                    {metadataText}
                  </div>
                  <div>
                    <Link href={ensureTrailingSlash(`/matches/${m.id}`)}>
                      {commonT('actions.moreInfo')}
                    </Link>
                  </div>
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
