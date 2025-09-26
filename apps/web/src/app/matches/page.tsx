import Link from "next/link";
import { headers } from "next/headers";
import { apiFetch, withAbsolutePhotoUrl } from "../../lib/api";
import Pager from "./pager";
import { PlayerInfo } from "../../components/PlayerName";
import MatchParticipants from "../../components/MatchParticipants";
import { formatDate, parseAcceptLanguage } from "../../lib/i18n";
import { ensureTrailingSlash } from "../../lib/routes";

export const dynamic = "force-dynamic";

type MatchRow = {
  id: string;
  sport: string;
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

async function getMatches(limit: number, offset: number): Promise<MatchRow[]> {
  const r = await apiFetch(
    `/v0/matches?limit=${limit}&offset=${offset}`,
    { cache: "no-store" }
  );
  if (!r.ok) throw new Error(`Failed to load matches: ${r.status}`);
  return (await r.json()) as MatchRow[];
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
    const participants = detail.participants
      .slice()
      .sort((a, b) => a.side.localeCompare(b.side))
      .map((p) =>
        p.playerIds.map((id) => idToPlayer.get(id) ?? { id, name: "Unknown" })
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

function formatMatchMetadata(
  parts: Array<string | null | undefined>,
  locale: string
): string {
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

  const normalizedLocale =
    typeof locale === "string" && locale.trim().length > 0 ? locale : "en";

  try {
    return new Intl.ListFormat(normalizedLocale, {
      style: "short",
      type: "conjunction",
    }).format(normalizedParts);
  } catch {
    return normalizedParts.join(" · ");
  }
}

export default async function MatchesPage(
  props: {
    searchParams?: Record<string, string | string[] | undefined>;
  }
) {
  const searchParams = props.searchParams ?? {};
  const limit = Number(searchParams.limit) || 25;
  const offset = Number(searchParams.offset) || 0;
  const locale = parseAcceptLanguage(headers().get('accept-language'));

  try {
    const rows = await getMatches(limit, offset);
    rows.sort((a, b) => {
      if (!a.playedAt) return 1;
      if (!b.playedAt) return -1;
      return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
    });
    const matches = await enrichMatches(rows);
    const prevOffset = Math.max(offset - limit, 0);
    const nextOffset = offset + limit;
    const disablePrev = offset <= 0;
    const disableNext = rows.length < limit;

    const hasMatches = matches.length > 0;
    const showPager = hasMatches || offset > 0;

    return (
      <main className="container">
        <h1 className="heading">Matches</h1>
        {hasMatches ? (
          <ul className="match-list">
            {matches.map((m) => {
              const summaryText = formatSummary(m.summary);
              const metadataText = formatMatchMetadata(
                [
                  m.isFriendly ? "Friendly" : null,
                  m.sport,
                  m.bestOf != null ? `Best of ${m.bestOf}` : null,
                  formatDate(m.playedAt, locale),
                  m.location,
                ],
                locale
              );

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
            prevOffset={prevOffset}
            nextOffset={nextOffset}
            disablePrev={disablePrev}
            disableNext={disableNext}
          />
        )}
      </main>
    );
  } catch {
    return (
      <main className="container">
        <h1 className="heading">Matches</h1>
        <p className="error">Failed to load matches.</p>
        <Link href="/matches" style={{ textDecoration: "underline" }}>
          Retry
        </Link>
      </main>
    );
  }
}
