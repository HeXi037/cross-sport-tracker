import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch, fetchClubs, withAbsolutePhotoUrl } from "../../../lib/api";
import PlayerCharts from "./PlayerCharts";
import NoMatchesGuidance from "./NoMatchesGuidance";
import PlayerComments from "./comments-client";
import PlayerDetailErrorBoundary, {
  type PlayerDetailError,
} from "./PlayerDetailErrorBoundary";
import PlayerName, { PlayerInfo } from "../../../components/PlayerName";
import MatchParticipants from "../../../components/MatchParticipants";
import PhotoUpload from "./PhotoUpload";
import { formatDate, getPreferredDateOptions, resolveTimeZone } from "../../../lib/i18n";
import { resolveServerLocale } from "../../../lib/server-locale";
import {
  formatMatchRecord,
  normalizeMatchSummary,
  normalizeRatingSummaries,
  normalizeRollingWinPct,
  normalizeVersusRecord,
  normalizeVersusRecords,
  type NormalizedMatchSummary,
  type NormalizedVersusRecord,
  type SportRatingSummary,
} from "../../../lib/player-stats";
import { sanitizePlayersBySide } from "../../../lib/participants";
import {
  createSportDisplayNameLookup,
  fetchSportsCatalog,
} from "../../../lib/sports";

export const dynamic = "force-dynamic";

interface Player extends PlayerInfo {
  club_id?: string | null;
  bio?: string | null;
  badges: Badge[];
  social_links?: PlayerSocialLink[];
}

type CachedRequestInit = RequestInit & { next?: { revalidate?: number } };

const PLAYER_REVALIDATE_SECONDS = 120;
const PLAYER_MATCH_LIST_REVALIDATE_SECONDS = 60;
const PLAYER_STATS_REVALIDATE_SECONDS = 300;

interface Badge {
  id: string;
  name: string;
  icon?: string | null;
}

interface PlayerSocialLink {
  id: string;
  label: string;
  url: string;
  created_at: string;
}

type MatchSummaryScores = {
  sets?: Record<string, number>;
  games?: Record<string, number>;
  points?: Record<string, number>;
} | null;

type MatchParticipantSummary = {
  id: string;
  side: string;
  playerIds: string[];
  players?: PlayerInfo[];
};

type MatchRow = {
  id: string;
  sport: string;
  stageId: string | null;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  isFriendly: boolean;
  participants: MatchParticipantSummary[];
  summary?: MatchSummaryScores;
};

type Participant = { side: string; playerIds: string[] };

type EnrichedMatch = {
  id: string;
  sport: string;
  stageId: string | null;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  isFriendly: boolean;
  players: Record<string, PlayerInfo[]>;
  participants: Participant[];
  summary?: MatchSummaryScores;
  playerSide: string | null;
  playerWon?: boolean;
};

type VersusRecord = NormalizedVersusRecord;

type MatchSummary = NormalizedMatchSummary;

interface PlayerStats {
  playerId: string;
  matchSummary: MatchSummary | null;
  bestAgainst: VersusRecord | null;
  worstAgainst: VersusRecord | null;
  bestWith: VersusRecord | null;
  worstWith: VersusRecord | null;
  withRecords: VersusRecord[];
  headToHeadRecords: VersusRecord[];
  rollingWinPct: number[];
  ratings: SportRatingSummary[];
}

const PLAYER_FETCH_OPTIONS: CachedRequestInit = {
  next: { revalidate: PLAYER_REVALIDATE_SECONDS },
};

async function getPlayer(id: string): Promise<Player> {
  const res = await apiFetch(
    `/v0/players/${encodeURIComponent(id)}`,
    PLAYER_FETCH_OPTIONS
  );
  const data = (await res.json()) as Player;
  return withAbsolutePhotoUrl(data);
}

function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") {
      return status;
    }
  }
  return undefined;
}

function toPlayerDetailError(
  err: unknown,
  fallbackMessage = "Failed to load player."
): PlayerDetailError {
  const status = getErrorStatus(err);
  const message =
    err instanceof Error && err.message
      ? err.message
      : typeof err === "string"
      ? err
      : fallbackMessage;
  return { status, message };
}

function renderPlayerError(
  playerId: string,
  err: unknown,
  message?: string
): JSX.Element {
  const errorInfo = toPlayerDetailError(err, message);
  return (
    <PlayerDetailErrorBoundary
      playerId={playerId}
      initialError={errorInfo}
    >
      <></>
    </PlayerDetailErrorBoundary>
  );
}

const PLAYER_MATCH_LIST_FETCH_OPTIONS: CachedRequestInit = {
  next: { revalidate: PLAYER_MATCH_LIST_REVALIDATE_SECONDS },
};

const PLAYER_STATS_FETCH_OPTIONS: CachedRequestInit = {
  next: { revalidate: PLAYER_STATS_REVALIDATE_SECONDS },
};

async function getMatches(
  playerId: string,
  upcoming = false
): Promise<EnrichedMatch[]> {
  const params = new URLSearchParams({
    playerId,
    limit: upcoming ? "20" : "100",
  });
  if (upcoming) {
    params.set("upcoming", "true");
  }

  const response = await apiFetch(
    `/v0/matches?${params.toString()}`,
    PLAYER_MATCH_LIST_FETCH_OPTIONS
  );
  if (!response.ok) {
    return [];
  }
  const rows = (await response.json()) as MatchRow[];

  const matches = await Promise.all(
    rows.map(async (row) => {
      let participantsFromRow = row.participants ?? [];
      let summary: MatchSummaryScores | undefined = row.summary ?? undefined;

      if (!participantsFromRow.length) {
        try {
          const detailResponse = await apiFetch(`/v0/matches/${row.id}`);
          if (detailResponse.ok) {
            const detail = (await detailResponse.json()) as Partial<{
              participants: MatchParticipantSummary[];
              summary: MatchSummaryScores;
            }>;
            participantsFromRow = detail.participants ?? participantsFromRow;
            summary = detail.summary ?? summary;
          }
        } catch (err) {
          console.warn(`Failed to load match ${row.id} details`, err);
        }
      }

      let playerSide: string | null = null;
      const participants: Participant[] = [];
      const playersBySide: Record<string, PlayerInfo[]> = {};

      for (const participant of participantsFromRow) {
        const ids = (participant.playerIds ?? []).map((id) => String(id));
        participants.push({ side: participant.side, playerIds: ids });
        if (ids.includes(playerId)) {
          playerSide = participant.side;
        }
        const resolvedPlayers = (participant.players ?? []).map((player, index) => {
          const fallbackId = ids[index] ?? player?.id ?? "";
          const name =
            typeof player?.name === "string" && player.name.trim().length > 0
              ? player.name
              : fallbackId || "Unknown";
          return {
            id: player?.id ?? fallbackId,
            name,
            photo_url: player?.photo_url ?? null,
          } satisfies PlayerInfo;
        });
        playersBySide[participant.side] = resolvedPlayers;
      }

      const sanitizedPlayers = sanitizePlayersBySide(playersBySide);
      let playerWon: boolean | undefined;
      if (playerSide && summary) {
        const metric = summary.sets || summary.games || summary.points;
        if (metric && playerSide in metric) {
          const myScore = metric[playerSide];
          const others = Object.entries(metric).filter(([side]) => side !== playerSide);
          if (typeof myScore === "number" && others.length) {
            playerWon = others.every(([, value]) =>
              typeof value === "number" ? myScore > value : false
            );
          }
        }
      }

      return {
        id: row.id,
        sport: row.sport,
        stageId: row.stageId,
        bestOf: row.bestOf,
        playedAt: row.playedAt,
        location: row.location,
        isFriendly: row.isFriendly,
        players: sanitizedPlayers,
        participants,
        summary,
        playerSide,
        playerWon,
      };
    })
  );

  return matches;
}

async function getUpcomingMatches(playerId: string): Promise<EnrichedMatch[]> {
  return getMatches(playerId, true);
}

type PlayerStatsResult = {
  stats: PlayerStats | null;
  error: boolean;
};

async function getStats(playerId: string): Promise<PlayerStatsResult> {
  try {
    const response = await apiFetch(
      `/v0/players/${encodeURIComponent(playerId)}/stats`,
      PLAYER_STATS_FETCH_OPTIONS,
    );

    if (!response.ok) {
      return { stats: null, error: true };
    }

    if (response.status === 204) {
      return { stats: null, error: false };
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch (parseError) {
      console.warn(
        `Failed to parse stats payload for player ${playerId}`,
        parseError,
      );
      return { stats: null, error: true };
    }

    if (parsed === null) {
      return { stats: null, error: false };
    }

    if (typeof parsed !== "object" || parsed === null) {
      return { stats: null, error: true };
    }

    const raw = parsed as Record<string, unknown>;
    const playerIdValue = raw["playerId"];
    if (typeof playerIdValue !== "string") {
      return { stats: null, error: true };
    }

    const summaryValue = raw["matchSummary"];
    const normalizedSummary = normalizeMatchSummary(summaryValue);
    if (!normalizedSummary && summaryValue != null) {
      console.warn(
        `Ignoring invalid match summary payload for player ${playerId}`
      );
    }

    const normalizedWithRecords = normalizeVersusRecords(raw["withRecords"]);
    const normalizedHeadToHead = normalizeVersusRecords(
      raw["headToHeadRecords"]
    );
    const normalizedBestAgainst = normalizeVersusRecord(raw["bestAgainst"]);
    const normalizedWorstAgainst = normalizeVersusRecord(raw["worstAgainst"]);
    const normalizedBestWith = normalizeVersusRecord(raw["bestWith"]);
    const normalizedWorstWith = normalizeVersusRecord(raw["worstWith"]);
    const rolling = normalizeRollingWinPct(raw["rollingWinPct"]);
    const ratings = normalizeRatingSummaries(raw["ratings"]);

    const sanitized: PlayerStats = {
      playerId: playerIdValue,
      matchSummary: normalizedSummary,
      withRecords: normalizedWithRecords,
      headToHeadRecords: normalizedHeadToHead,
      bestAgainst: normalizedBestAgainst,
      worstAgainst: normalizedWorstAgainst,
      bestWith: normalizedBestWith,
      worstWith: normalizedWorstWith,
      rollingWinPct: rolling,
      ratings,
    };

    return { stats: sanitized, error: false };
  } catch (err) {
    console.warn(`Failed to load stats for player ${playerId}`, err);
    return { stats: null, error: true };
  }
}

function iconForSocialLink(link: PlayerSocialLink): string {
  const normalizedLabel = link.label.trim();
  const customIcon = normalizedLabel.match(
    /^\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?/u
  );
  if (customIcon) {
    return customIcon[0];
  }

  const label = normalizedLabel.toLowerCase();
  let host = "";
  try {
    host = new URL(link.url).hostname.toLowerCase();
  } catch {
    host = "";
  }
  const checks: { icon: string; needles: string[] }[] = [
    { icon: "𝕏", needles: ["twitter", "x.com"] },
    { icon: "📸", needles: ["instagram"] },
    { icon: "▶️", needles: ["youtube", "youtu.be", "vimeo"] },
    { icon: "🎮", needles: ["twitch"] },
    { icon: "💬", needles: ["discord", "slack", "whatsapp", "wa.me"] },
    { icon: "🎵", needles: ["tiktok", "spotify", "soundcloud"] },
    { icon: "📘", needles: ["facebook"] },
    { icon: "💼", needles: ["linkedin"] },
    { icon: "🧵", needles: ["threads"] },
    { icon: "🦋", needles: ["bluesky", "bsky.app", "bluesky.social"] },
    { icon: "🦣", needles: ["mastodon"] },
    { icon: "🐙", needles: ["github"] },
    { icon: "👻", needles: ["snapchat"] },
    { icon: "👽", needles: ["reddit"] },
    { icon: "✈️", needles: ["telegram", "t.me"] },
    { icon: "🏃", needles: ["strava"] },
    { icon: "🌳", needles: ["linktr.ee", "linktree"] },
    { icon: "☕", needles: ["kofi", "ko-fi", "ko fi"] },
    { icon: "✍️", needles: ["medium", "substack"] },
    { icon: "🧡", needles: ["patreon"] },
    { icon: "📌", needles: ["pinterest"] },
    { icon: "🌐", needles: ["website", "blog"] },
  ];
  for (const { icon, needles } of checks) {
    if (
      needles.some(
        (needle) => label.includes(needle) || host.includes(needle)
      )
    ) {
      return icon;
    }
  }
  return "🔗";
}

function formatSummary(s?: MatchSummaryScores): string {
  if (!s) return "";
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

function joinMetadata(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join(" · ");
}

function winnerFromSummary(s?: MatchSummaryScores): string | null {
  if (!s) return null;
  const checks: (keyof NonNullable<typeof s>)[] = [
    "sets",
    "points",
    "games",
    // fallbacks for other summary shapes
    // @ts-expect-error dynamic
    "total",
    // @ts-expect-error dynamic
    "score",
  ];
  for (const key of checks) {
    const raw = (s as Record<string, unknown>)[key];
    if (raw && typeof raw === "object") {
      const entries = Object.entries(raw as Record<string, unknown>).filter(
        ([, v]) => typeof v === "number"
      ) as [string, number][];
      if (entries.length >= 2) {
        let maxSide: string | null = null;
        let maxVal = -Infinity;
        let tie = false;
        for (const [side, val] of entries) {
          if (val > maxVal) {
            maxVal = val;
            maxSide = side;
            tie = false;
          } else if (val === maxVal) {
            tie = true;
          }
        }
        if (!tie && maxSide !== null) return maxSide;
      }
    }
  }
  return null;
}

type SeasonSummary = { season: string; wins: number; losses: number };

function summariseSeasons(matches: EnrichedMatch[]): SeasonSummary[] {
  const byYear: Record<string, { wins: number; losses: number }> = {};
  for (const m of matches) {
    if (!m.playedAt) continue;
    const year = new Date(m.playedAt).getFullYear().toString();
    if (!byYear[year]) byYear[year] = { wins: 0, losses: 0 };
    const winner = winnerFromSummary(m.summary);
    if (winner && m.playerSide) {
      if (winner === m.playerSide) byYear[year].wins += 1;
      else byYear[year].losses += 1;
    }
  }
  return Object.keys(byYear)
    .sort()
    .map((season) => ({ season, ...byYear[season] }));
}

function extractRatingHistory(
  stats: PlayerStats | null | undefined
): { values: number[]; label: string } | null {
  if (!stats?.ratings?.length) {
    return null;
  }
  for (const rating of stats.ratings) {
    const systems: Array<[string, SportRatingSummary["elo"]]> = [
      ["Elo", rating.elo],
      ["Glicko", rating.glicko],
    ];
    for (const [systemName, snapshot] of systems) {
      if (!snapshot) continue;
      const values = [...(snapshot.sparkline ?? [])].filter((value) =>
        typeof value === "number" && Number.isFinite(value)
      );
      const current = snapshot.value;
      if (typeof current === "number" && Number.isFinite(current)) {
        if (!values.length || values[values.length - 1] !== current) {
          values.push(current);
        }
      }
      if (values.length) {
        const labelParts = [rating.sport, systemName].filter(
          (part) => typeof part === "string" && part.trim().length > 0
        );
        const label = labelParts.length
          ? labelParts.join(" ")
          : "Rating Update";
        return { values, label };
      }
    }
  }
  return null;
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string };
}) {
  const cookieStore = cookies();
  const { locale, preferredTimeZone } = resolveServerLocale({ cookieStore });
  const timeZone = resolveTimeZone(preferredTimeZone, locale);
  const preferredDateOptions = getPreferredDateOptions(locale);
  let player: Player;
  try {
    player = await getPlayer(params.id);
  } catch (err) {
    const status = getErrorStatus(err);
    if (status === 404) {
      notFound();
    }
    console.error(`Failed to load player ${params.id}`, err);
    return renderPlayerError(params.id, err);
  }

  try {
    const [matchesSettled, statsSettled, upcomingSettled, sportsSettled] =
      await Promise.allSettled([
        getMatches(params.id),
        getStats(params.id),
        getUpcomingMatches(params.id),
        fetchSportsCatalog(),
      ]);

    if (matchesSettled.status === "rejected") {
      console.warn(
        `Failed to load matches for player ${params.id}`,
        matchesSettled.reason
      );
    }
    const allMatches =
      matchesSettled.status === "fulfilled" ? matchesSettled.value : [];

    let statsResult: PlayerStatsResult;
    if (statsSettled.status === "fulfilled") {
      statsResult = statsSettled.value;
    } else {
      console.warn(
        `Failed to load stats for player ${params.id}`,
        statsSettled.reason
      );
      statsResult = { stats: null, error: true };
    }
    const { stats, error: statsError } = statsResult;

    if (upcomingSettled.status === "rejected") {
      console.warn(
        `Failed to load upcoming matches for player ${params.id}`,
        upcomingSettled.reason
      );
    }
    const upcoming =
      upcomingSettled.status === "fulfilled" ? upcomingSettled.value : [];

    if (sportsSettled.status === "rejected") {
      console.warn(
        `Failed to load sports catalog for player ${params.id}`,
        sportsSettled.reason
      );
    }
    const getSportName = createSportDisplayNameLookup(
      sportsSettled.status === "fulfilled" ? sportsSettled.value : []
    );

    let clubName: string | null = null;
    if (player.club_id) {
      try {
        const clubs = await fetchClubs({ cache: "no-store" });
        const match = clubs.find((club) => club.id === player.club_id);
        clubName = match?.name ?? null;
      } catch (err) {
        console.warn("Failed to resolve club name", err);
      }
    }
    const matches = allMatches.filter((m) => {
      if (!m.playedAt) return true;
      return new Date(m.playedAt) <= new Date();
    });

    const view = searchParams?.view === "summary" ? "summary" : "timeline";
    const seasons = summariseSeasons(matches);
    const sortedMatches = [...matches].sort((a, b) => {
      const da = a.playedAt ? new Date(a.playedAt).getTime() : 0;
      const db = b.playedAt ? new Date(b.playedAt).getTime() : 0;
      return da - db;
    });

    const recentOpponents = matches
      .map((m) => {
        const part = m.participants.find((p) =>
          (p.playerIds ?? []).includes(player.id)
        );
        if (!part) return null;
        const mySide = part.side;
        const opponents = Object.entries(m.players)
          .filter(([side]) => side !== mySide)
          .flatMap(([, pl]) => pl);
        const winner = winnerFromSummary(m.summary);
        const result = winner ? (winner === mySide ? "Win" : "Loss") : "—";
        const date = formatDate(
          m.playedAt,
          locale,
          preferredDateOptions,
          timeZone,
        );
        return { id: m.id, opponents, date, result };
      })
      .filter(Boolean) as {
      id: string;
      opponents: PlayerInfo[];
      date: string;
      result: string;
    }[];

    const matchSummary = stats?.matchSummary ?? null;
    const teammateRecords: VersusRecord[] = stats?.withRecords ?? [];
    const opponentRecords: VersusRecord[] = stats?.headToHeadRecords ?? [];
    const rollingWinPct = stats?.rollingWinPct ?? [];
    const ratingHistory = extractRatingHistory(stats);

    return (
      <PlayerDetailErrorBoundary playerId={params.id}>
        <main className="container md:flex">
          <section className="flex-1 md:mr-4">
            <PhotoUpload
              playerId={player.id}
              playerName={player.name}
              initialUrl={player.photo_url}
            />
            <h1 className="heading">
              <PlayerName player={player} />
            </h1>
            {statsError ? (
              <p className="mt-2 text-sm text-gray-600">
                We couldn&apos;t load this player&apos;s stats right now.
              </p>
            ) : matchSummary ? (
              <p className="mt-2 text-sm text-gray-600">
                Record: {formatMatchRecord(matchSummary)}
              </p>
            ) : (
              <p className="mt-2 text-sm text-gray-600">Stats unavailable.</p>
            )}
            {player.bio ? (
              <p
                style={{
                  marginTop: "0.75rem",
                  marginBottom: player.club_id ? "0.5rem" : "1rem",
                  whiteSpace: "pre-wrap",
                  color: "#444",
                  lineHeight: 1.5,
                }}
              >
                {player.bio}
              </p>
            ) : null}
            {player.club_id ? (
              <p
                style={{
                  marginTop: player.bio ? "0" : "0.75rem",
                  marginBottom: "0.75rem",
                }}
              >
                Club: {clubName ?? player.club_id}
              </p>
            ) : null}
            {player.social_links && player.social_links.length ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginTop: "0.75rem",
                }}
              >
                {player.social_links.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.35rem 0.75rem",
                      borderRadius: "9999px",
                      backgroundColor: "#f4f4f4",
                      color: "inherit",
                      textDecoration: "none",
                      border: "1px solid #e0e0e0",
                    }}
                    title={link.url}
                  >
                    <span aria-hidden="true">{iconForSocialLink(link)}</span>
                    <span>{link.label}</span>
                  </a>
                ))}
              </div>
            ) : null}

            <nav
              className="player-detail__view-nav"
              aria-label="Player timeline navigation"
            >
              <Link
                href={`/players/${params.id}?view=timeline`}
                className={`player-detail__view-link${
                  view === "timeline" ? " is-active" : ""
                }`}
                aria-current={view === "timeline" ? "page" : undefined}
              >
                Timeline
              </Link>
              <Link
                href={`/players/${params.id}?view=summary`}
                className={`player-detail__view-link${
                  view === "summary" ? " is-active" : ""
                }`}
                aria-current={view === "summary" ? "page" : undefined}
              >
                Season Summary
              </Link>
            </nav>

            {view === "timeline" ? (
              sortedMatches.length ? (
                <section>
                  <h2 className="heading">Matches</h2>
                  <ul>
                    {sortedMatches.map((m) => {
                      const winner = winnerFromSummary(m.summary);
                      const result =
                        winner && m.playerSide
                          ? winner === m.playerSide
                            ? "Win"
                            : "Loss"
                          : null;
                      const summaryText = formatSummary(m.summary);
                      const metadataText = joinMetadata([
                        result,
                        getSportName(m.sport),
                        m.bestOf != null ? `Best of ${m.bestOf}` : null,
                        formatDate(
                          m.playedAt,
                          locale,
                          preferredDateOptions,
                          timeZone,
                        ),
                        m.location ?? "—",
                      ]);
                      return (
                        <li key={m.id} className="mb-2">
                          <div>
                            <Link href={`/matches/${m.id}`}>
                              <MatchParticipants
                                as="span"
                                sides={Object.values(m.players)}
                              />
                            </Link>
                          </div>
                          <div className="text-sm text-gray-700">
                            {summaryText}
                            {summaryText && metadataText ? " · " : ""}
                            {metadataText}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : (
                <NoMatchesGuidance />
              )
            ) : seasons.length ? (
              <section>
                <h2 className="heading">Season Summary</h2>
                <ul>
                    {seasons.map((s) => (
                      <li key={s.season} className="mb-2">
                        <div className="font-semibold">{s.season}</div>
                        <div className="text-sm text-gray-700">
                          Wins: {s.wins} · Losses: {s.losses}
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            ) : (
              <NoMatchesGuidance />
            )}

            {recentOpponents.length ? (
              <>
                <h2 className="heading mt-4">Recent Opponents</h2>
                <ul>
                  {recentOpponents.map((o) => (
                    <li key={o.id} className="mb-2">
                      <div>
                        <MatchParticipants as="span" sides={[o.opponents]} />
                      </div>
                      <div className="text-sm text-gray-700">
                        {o.date} · {o.result}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-sm text-gray-600">No recent opponents found.</p>
            )}

            {opponentRecords.length ? (
              <>
                <h2 className="heading mt-4">Opponent Records</h2>
                <ul>
                  {opponentRecords.slice(0, 5).map((r) => (
                    <li key={r.playerId} className="mb-1">
                      {r.playerName || r.playerId} · {r.wins}-{r.losses}
                      {Number.isFinite(r.winPct)
                        ? ` (${Math.round(Math.max(0, Math.min(r.winPct, 1)) * 100)}%)`
                        : ""}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-sm text-gray-600">No opponent records.</p>
            )}

            {teammateRecords.length ? (
              <>
                <h2 className="heading mt-4">Teammate Records</h2>
                <ul>
                  {teammateRecords.map((r) => (
                    <li key={r.playerId}>
                      {r.wins}-{r.losses} with {r.playerName || r.playerId}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-sm text-gray-600">No teammate records.</p>
            )}

            <PlayerCharts
              matches={matches}
              rollingWinPct={rollingWinPct}
              ratingHistory={ratingHistory}
            />

            <PlayerComments playerId={player.id} />

            <Link href="/players" className="block mt-4">
              Back to players
            </Link>
          </section>
        <aside className="md:w-1/3 md:pl-4 mt-8 md:mt-0">
          {upcoming.length ? (
            <>
              <h2 className="heading">Upcoming Matches</h2>
              <ul>
                {upcoming.map((m) => (
                  <li key={m.id} className="mb-2">
                    <Link href={`/matches/${m.id}`}>
                      <MatchParticipants
                        as="span"
                        sides={Object.values(m.players)}
                      />
                    </Link>
                    <div className="text-sm text-gray-700">
                      {formatDate(
                        m.playedAt,
                        locale,
                        preferredDateOptions,
                        timeZone,
                      )}{' '}
                      ·{' '}
                      {m.location ?? "—"}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-gray-600">No upcoming matches.</p>
          )}
          {player.badges.length ? (
            <>
              <h2 className="heading mt-4">Badges</h2>
              <ul>
                {player.badges.map((b) => (
                  <li key={b.id}>{b.name}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-4 text-sm text-gray-600">No badges.</p>
          )}
        </aside>
      </main>
      </PlayerDetailErrorBoundary>
    );
  } catch (err) {
    console.error(`Failed to render player ${params.id}`, err);
    return renderPlayerError(
      params.id,
      err,
      "Failed to load player."
    );
  }
}

