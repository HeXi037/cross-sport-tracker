import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch, fetchClubs, withAbsolutePhotoUrl } from "../../../lib/api";
import PlayerCharts from "./PlayerCharts";
import PlayerComments from "./comments-client";
import PlayerDetailErrorBoundary, {
  type PlayerDetailError,
} from "./PlayerDetailErrorBoundary";
import PlayerName, { PlayerInfo } from "../../../components/PlayerName";
import MatchParticipants from "../../../components/MatchParticipants";
import PhotoUpload from "./PhotoUpload";
import { formatDate } from "../../../lib/i18n";
import { resolveServerLocale } from "../../../lib/server-locale";
import {
  formatMatchRecord,
  normalizeMatchSummary,
  normalizeVersusRecords,
  type NormalizedMatchSummary,
  type NormalizedVersusRecord,
} from "../../../lib/player-stats";
import { sanitizePlayersBySide } from "../../../lib/participants";

export const dynamic = "force-dynamic";

interface Player extends PlayerInfo {
  club_id?: string | null;
  bio?: string | null;
  badges: Badge[];
  social_links?: PlayerSocialLink[];
}

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

type MatchRow = {
  id: string;
  sport: string;
  stageId: string | null;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
  isFriendly: boolean;
};

type Participant = { side: string; playerIds: string[] };
type MatchDetail = {
  participants: Participant[];
  summary?:
    | {
        sets?: Record<string, number>;
        games?: Record<string, number>;
        points?: Record<string, number>;
      }
    | null;
};

type EnrichedMatch = MatchRow & {
  players: Record<string, PlayerInfo[]>;
  participants: Participant[];
  summary?: MatchDetail["summary"];
  playerSide: string | null;
  playerWon?: boolean;
};

type VersusRecord = NormalizedVersusRecord;

type MatchSummary = NormalizedMatchSummary;

interface PlayerStats {
  playerId: string;
  matchSummary?: MatchSummary | null;
  bestAgainst?: VersusRecord | null;
  worstAgainst?: VersusRecord | null;
  bestWith?: VersusRecord | null;
  worstWith?: VersusRecord | null;
  withRecords?: VersusRecord[];
}

async function getPlayer(id: string): Promise<Player> {
  const res = await apiFetch(`/v0/players/${encodeURIComponent(id)}`, {
    cache: "no-store",
  } as RequestInit);
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

async function getMatches(
  playerId: string,
  upcoming = false
): Promise<EnrichedMatch[]> {
  const r = await apiFetch(
    `/v0/matches?playerId=${encodeURIComponent(playerId)}${
      upcoming ? "&upcoming=true" : ""
    }`,
    { cache: "no-store" } as RequestInit
  );
  if (!r.ok) return [];
  const rows = ((await r.json()) as MatchRow[]).slice(0, 5);

  const detailResults = await Promise.allSettled(
    rows.map(async (m) => {
      const resp = await apiFetch(`/v0/matches/${encodeURIComponent(m.id)}`, {
        cache: "no-store",
      } as RequestInit);
      if (!resp.ok) throw new Error(`match ${m.id}`);
      return { row: m, detail: (await resp.json()) as MatchDetail };
    })
  );

  const details: { row: MatchRow; detail: MatchDetail }[] = [];
  const failedDetails: { matchId: string; reason: unknown }[] = [];

  detailResults.forEach((result, index) => {
    const match = rows[index];
    if (result.status === "fulfilled") {
      details.push(result.value);
    } else if (match) {
      failedDetails.push({ matchId: match.id, reason: result.reason });
      details.push({ row: match, detail: { participants: [] } });
    }
  });

  if (failedDetails.length) {
    console.warn(
      `Failed to load match details for matches: ${failedDetails
        .map((f) => f.matchId)
        .join(", ")}`,
      failedDetails.map((f) => ({ matchId: f.matchId, reason: f.reason }))
    );
  }

  const ids = new Set<string>();
  for (const { detail } of details) {
    const parts = detail?.participants ?? [];
    for (const p of parts) {
      (p?.playerIds ?? []).forEach((id) => ids.add(id));
    }
  }

  const idList = Array.from(ids);
  const idToPlayer = new Map<string, PlayerInfo>();
  if (idList.length) {
    const resp = await apiFetch(`/v0/players/by-ids?ids=${idList.join(",")}`, {
      cache: "no-store",
    } as RequestInit);
    if (resp.ok) {
      const players = (await resp.json()) as PlayerInfo[];
      const remaining = new Set(idList);
      const missing: string[] = [];
      players.forEach((p) => {
        if (p.id) {
          remaining.delete(p.id);
          if (p.name) {
            idToPlayer.set(p.id, withAbsolutePhotoUrl(p));
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
    const players: Record<string, PlayerInfo[]> = {};
    let playerSide: string | null = null;
    for (const p of detail.participants ?? []) {
      const ids = p.playerIds ?? [];
      players[p.side] = ids.map(
        (id) => idToPlayer.get(id) ?? { id, name: "Unknown" }
      );
      if (ids.includes(playerId)) {
        playerSide = p.side;
      }
    }
    const sanitizedPlayers = sanitizePlayersBySide(players);
    let playerWon: boolean | undefined = undefined;
    const summary = detail.summary;
    if (playerSide && summary) {
      const metric = summary.sets || summary.games || summary.points;
      if (metric && playerSide in metric) {
        const myScore = metric[playerSide];
        const others = Object.entries(metric).filter(([s]) => s !== playerSide);
        playerWon = others.every(([, v]) => myScore > v);
      }
    }
    return {
      ...row,
      players: sanitizedPlayers,
      participants: detail.participants ?? [],
      summary,
      playerSide,
      playerWon,
    };
  });
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
      { cache: "no-store" } as RequestInit,
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

    const sanitized: PlayerStats = {
      ...(parsed as PlayerStats),
      playerId: playerIdValue,
      matchSummary: normalizedSummary,
      withRecords: normalizedWithRecords,
    };

    return { stats: sanitized, error: false };
  } catch (err) {
    console.warn(`Failed to load stats for player ${playerId}`, err);
    return { stats: null, error: true };
  }
}

function iconForSocialLink(link: PlayerSocialLink): string {
  const label = link.label.toLowerCase();
  let host = "";
  try {
    host = new URL(link.url).hostname.toLowerCase();
  } catch {
    host = "";
  }
  const checks: { icon: string; needles: string[] }[] = [
    { icon: "𝕏", needles: ["twitter", "x.com"] },
    { icon: "📸", needles: ["instagram"] },
    { icon: "▶️", needles: ["youtube", "youtu.be"] },
    { icon: "🎮", needles: ["twitch"] },
    { icon: "🎵", needles: ["tiktok"] },
    { icon: "📘", needles: ["facebook"] },
    { icon: "💼", needles: ["linkedin"] },
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

function formatSummary(s?: MatchDetail["summary"]): string {
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

function winnerFromSummary(s?: MatchDetail["summary"]): string | null {
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

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { view?: string };
}) {
  const cookieStore = cookies();
  const { locale, timeZone } = resolveServerLocale({ cookieStore });
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
    const [matchesSettled, statsSettled, upcomingSettled] =
      await Promise.allSettled([
        getMatches(params.id),
        getStats(params.id),
        getUpcomingMatches(params.id),
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
        const date = formatDate(m.playedAt, locale, undefined, timeZone);
        return { id: m.id, opponents, date, result };
      })
      .filter(Boolean) as {
      id: string;
      opponents: PlayerInfo[];
      date: string;
      result: string;
    }[];

    const matchSummary = stats?.matchSummary ?? null;
    const teammateRecords: VersusRecord[] =
      stats && Array.isArray(stats.withRecords) ? stats.withRecords : [];

    return (
      <PlayerDetailErrorBoundary playerId={params.id}>
        <main className="container md:flex">
          <section className="flex-1 md:mr-4">
            <PhotoUpload playerId={player.id} initialUrl={player.photo_url} />
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

            <nav className="mt-4 mb-4 flex flex-wrap gap-4">
              <Link
                href={`/players/${params.id}?view=timeline`}
                className={view === "timeline" ? "font-bold" : ""}
              >
                Timeline
              </Link>
              <Link
                href={`/players/${params.id}?view=summary`}
                className={view === "summary" ? "font-bold" : ""}
              >
                Season Summary
              </Link>
            </nav>

            {view === "timeline" ? (
              <section>
                <h2 className="heading">Matches</h2>
                {sortedMatches.length ? (
                  <ul>
                    {sortedMatches.map((m) => {
                      const winner = winnerFromSummary(m.summary);
                      const result =
                        winner && m.playerSide
                          ? winner === m.playerSide
                            ? "Win"
                            : "Loss"
                          : "";
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
                            {formatSummary(m.summary)}
                            {result ? ` · ${result}` : ""}
                            {m.summary || result ? " · " : ""}
                            {m.sport} · Best of {m.bestOf ?? "—"} ·{" "}
                            {formatDate(m.playedAt, locale, undefined, timeZone)}
                            {" · "}
                            {m.location ?? "—"}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>No matches found.</p>
                )}
              </section>
            ) : (
              <section>
                <h2 className="heading">Season Summary</h2>
                {seasons.length ? (
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
                ) : (
                  <p>No matches found.</p>
                )}
              </section>
            )}

            <h2 className="heading mt-4">Recent Opponents</h2>
            {recentOpponents.length ? (
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
            ) : (
              <p>No recent opponents found.</p>
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
            ) : null}

            <PlayerCharts matches={matches} />

            <PlayerComments playerId={player.id} />

            <Link href="/players" className="block mt-4">
              Back to players
            </Link>
          </section>
        <aside className="md:w-1/3 md:pl-4 mt-8 md:mt-0">
          <h2 className="heading">Upcoming Matches</h2>
          {upcoming.length ? (
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
                    {formatDate(m.playedAt, locale, undefined, timeZone)} ·{' '}
                    {m.location ?? "—"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>No upcoming matches.</p>
          )}
          <h2 className="heading mt-4">Badges</h2>
          {player.badges.length ? (
            <ul>
              {player.badges.map((b) => (
                <li key={b.id}>{b.name}</li>
              ))}
            </ul>
          ) : (
            <p>No badges.</p>
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

