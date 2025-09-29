import Link from "next/link";
import { cookies } from "next/headers";
import { apiFetch, withAbsolutePhotoUrl, type ApiError } from "../../lib/api";
import Pager from "./pager";
import { PlayerInfo } from "../../components/PlayerName";
import MatchParticipants from "../../components/MatchParticipants";
import {
  formatDate,
  formatDateTime,
  resolveTimeZone,
  TIME_ZONE_COOKIE_KEY,
} from "../../lib/i18n";
import { hasTimeComponent } from "../../lib/datetime";
import { ensureTrailingSlash } from "../../lib/routes";
import { resolveParticipantGroups } from "../../lib/participants";
import { resolveServerLocale } from "../../lib/server-locale";

export const dynamic = "force-dynamic";

type MatchRow = {
  id: string;
  sport: string;
  stageId: string | null;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  isFriendly: boolean;
};

type Participant = {
  side: string;
  playerIds: string[];
};

type MatchDetail = {
  participants: Participant[];
  summary?: {
    sets?: Record<string, number>;
    games?: Record<string, number>;
    points?: Record<string, number>;
    set_scores?: Array<Record<string, number>>;
  } | null;
  isFriendly?: boolean;
};

type EnrichedMatch = MatchRow & {
  participants: PlayerInfo[][];
  summary?: MatchDetail["summary"];
};

const MATCH_ERROR_COPY: Record<string, string> = {
  match_forbidden: "You do not have permission to view these matches.",
  match_not_found: "We couldn't find that match.",
  auth_token_expired: "Your session expired. Please refresh and try again.",
  auth_missing_token: "Your session expired. Please refresh and try again.",
  auth_invalid_token: "Your session expired. Please refresh and try again.",
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
    { cache: "no-store" }
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

async function enrichMatches(rows: MatchRow[]): Promise<EnrichedMatch[]> {
  // Load match details for participants + score summaries.
  const details = await Promise.all(
    rows.map(async (m) => {
      const r = await apiFetch(`/v0/matches/${m.id}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Failed to load match ${m.id}`);
      const d = (await r.json()) as MatchDetail;
      return { row: m, detail: d };
    })
  );

  // Fetch all unique player names.
  const ids = new Set<string>();
  for (const { detail } of details) {
    for (const p of detail.participants) p.playerIds.forEach((id) => ids.add(id));
  }
  const idToPlayer = new Map<string, PlayerInfo>();
  const idList = Array.from(ids);
  if (idList.length) {
    const r = await apiFetch(
      `/v0/players/by-ids?ids=${idList.join(",")}`,
      { cache: "no-store" }
    );
    if (r.ok) {
      const players = (await r.json()) as {
        id: string;
        name?: string;
        photo_url?: string | null;
      }[];
      const remaining = new Set(idList);
      const missing: string[] = [];
      players.forEach((p) => {
        if (p.id) {
          remaining.delete(p.id);
          if (p.name) {
            const info: PlayerInfo = {
              id: p.id,
              name: p.name,
              photo_url: p.photo_url ?? null,
            };
            idToPlayer.set(p.id, withAbsolutePhotoUrl(info));
          } else {
            missing.push(p.id);
            idToPlayer.set(p.id, { id: p.id, name: "Unknown" });
          }
        }
      });
      if (remaining.size) {
        missing.push(...Array.from(remaining));
        remaining.forEach((id) =>
          idToPlayer.set(id, { id, name: "Unknown" })
        );
      }
      if (missing.length) {
        console.warn(
          `Player names missing for ids: ${missing.join(", ")}`
        );
      }
    }
  }

  return details.map(({ row, detail }) => {
    const sortedParticipants = detail.participants
      .slice()
      .sort((a, b) => a.side.localeCompare(b.side));
    const participants = resolveParticipantGroups(
      sortedParticipants,
      (id) => idToPlayer.get(id)
    );
    return { ...row, participants, summary: detail.summary };
  });
}

function formatSummary(s?: MatchDetail["summary"]): string {
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
  if (s.sets) return render(s.sets, "Sets");
  if (s.games) return render(s.games, "Games");
  if (s.points) return render(s.points, "Points");
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
  const { locale } = resolveServerLocale({ cookieStore });
  const timeZoneCookie = cookieStore.get(TIME_ZONE_COOKIE_KEY)?.value ?? null;
  const timeZone = resolveTimeZone(timeZoneCookie);

  try {
    const { rows, hasMore, nextOffset, totalCount } = await getMatches(
      limit,
      offset
    );
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
        <h1 className="heading">Matches</h1>
        {hasMatches ? (
          <ul className="match-list">
            {matches.map((m) => {
              const summaryText = formatSummary(m.summary);
              const playedAtText =
                m.playedAt && hasTimeComponent(m.playedAt)
                  ? formatDateTime(m.playedAt, locale, 'compact', timeZone)
                  : formatDate(
                      m.playedAt,
                      locale,
                      { dateStyle: 'medium' },
                      timeZone,
                    );
              const metadataText = formatMatchMetadata([
                m.isFriendly ? "Friendly" : null,
                m.sport,
                m.bestOf != null ? `Best of ${m.bestOf}` : null,
                playedAtText,
                m.location,
              ]);

              return (
                <li key={m.id} className="card match-item">
                  <MatchParticipants sides={m.participants} />
                  <div className="match-meta">
                    {summaryText}
                    {summaryText && metadataText ? " · " : ""}
                    {metadataText}
                  </div>
                  <div>
                    <Link href={ensureTrailingSlash(`/matches/${m.id}`)}>
                      More info
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">
            {offset > 0 ? "No matches on this page." : "No matches yet."}
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
    let message = "Failed to load matches.";
    const code = typeof apiError?.code === "string" ? apiError.code : null;
    if (code) {
      const mapped = MATCH_ERROR_COPY[code];
      if (mapped) {
        message = mapped;
      } else {
        console.error(
          "Unhandled matches error code",
          code,
          apiError?.parsedMessage ?? apiError?.message ?? null
        );
      }
    } else if (apiError?.parsedMessage) {
      console.error("Unhandled matches error message", apiError.parsedMessage);
    }
    return (
      <main className="container">
        <h1 className="heading">Matches</h1>
        <p className="error">{message}</p>
        <Link href="/matches" style={{ textDecoration: "underline" }}>
          Retry
        </Link>
      </main>
    );
  }
}
