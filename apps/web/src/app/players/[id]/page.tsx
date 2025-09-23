import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import PlayerCharts from "./PlayerCharts";
import PlayerComments from "./comments-client";
import PlayerName, { PlayerInfo } from "../../../components/PlayerName";
import PhotoUpload from "./PhotoUpload";

export const dynamic = "force-dynamic";

interface Player extends PlayerInfo {
  club_id?: string | null;
  bio?: string | null;
  badges: Badge[];
}

interface Badge {
  id: string;
  name: string;
  icon?: string | null;
}

type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
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

interface VersusRecord {
  playerId: string;
  playerName: string;
  wins: number;
  losses: number;
  winPct: number;
}

interface PlayerStats {
  playerId: string;
  bestAgainst?: VersusRecord | null;
  worstAgainst?: VersusRecord | null;
  bestWith?: VersusRecord | null;
  worstWith?: VersusRecord | null;
  withRecords: VersusRecord[];
}

async function getPlayer(id: string): Promise<Player> {
  const res = await apiFetch(`/v0/players/${encodeURIComponent(id)}`, {
    cache: "no-store",
  } as RequestInit);
  if (!res.ok) throw new Error("player");
  return (await res.json()) as Player;
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

  const details = await Promise.all(
    rows.map(async (m) => {
      const resp = await apiFetch(`/v0/matches/${encodeURIComponent(m.id)}`, {
        cache: "no-store",
      } as RequestInit);
      if (!resp.ok) throw new Error(`match ${m.id}`);
      return { row: m, detail: (await resp.json()) as MatchDetail };
    })
  );

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
            idToPlayer.set(p.id, p);
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
      players,
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

async function getStats(playerId: string): Promise<PlayerStats | null> {
  const r = await apiFetch(
    `/v0/players/${encodeURIComponent(playerId)}/stats`,
    { cache: "no-store" } as RequestInit
  );
  if (!r.ok) return null;
  return (await r.json()) as PlayerStats;
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
  try {
    const [player, allMatches, stats, upcoming] = await Promise.all([
      getPlayer(params.id),
      getMatches(params.id),
      getStats(params.id),
      getUpcomingMatches(params.id),
    ]);
    const matches = allMatches.filter(
      (m) => m.playedAt && new Date(m.playedAt) <= new Date()
    );

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
        const date = m.playedAt
          ? new Date(m.playedAt).toLocaleDateString()
          : "—";
        return { id: m.id, opponents, date, result };
      })
      .filter(Boolean) as {
      id: string;
      opponents: PlayerInfo[];
      date: string;
      result: string;
    }[];

    return (
      <main className="container md:flex">
        <section className="flex-1 md:mr-4">
          <PhotoUpload playerId={player.id} initialUrl={player.photo_url} />
          <h1 className="heading">
            <PlayerName player={player} />
          </h1>
          {player.bio ? (
            <p className="mt-2 text-gray-700 whitespace-pre-line">{player.bio}</p>
          ) : null}
          {player.club_id && <p>Club: {player.club_id}</p>}

          <nav className="mt-4 mb-4 space-x-4">
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
                            {Object.values(m.players).map((side, i) => (
                              <span key={i}>
                                {side.map((pl, j) => (
                                  <span key={pl.id}>
                                    <PlayerName player={pl} />
                                    {j < side.length - 1 ? " & " : ""}
                                  </span>
                                ))}
                                {i < Object.values(m.players).length - 1 ? " vs " : ""}
                              </span>
                            ))}
                          </Link>
                        </div>
                        <div className="text-sm text-gray-700">
                          {formatSummary(m.summary)}
                          {result ? ` · ${result}` : ""}
                          {m.summary || result ? " · " : ""}
                          {m.sport} · Best of {m.bestOf ?? "—"} ·{" "}
                          {m.playedAt
                            ? new Date(m.playedAt).toLocaleDateString()
                            : "—"}
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
                    {o.opponents.map((pl, j) => (
                      <span key={pl.id}>
                        <PlayerName player={pl} />
                        {j < o.opponents.length - 1 ? " & " : ""}
                      </span>
                    ))}
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

          {stats?.withRecords?.length ? (
            <>
              <h2 className="heading mt-4">Teammate Records</h2>
              <ul>
                {stats.withRecords.map((r) => (
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
                    {Object.values(m.players).map((side, i) => (
                      <span key={i}>
                        {side.map((pl, j) => (
                          <span key={pl.id}>
                            <PlayerName player={pl} />
                            {j < side.length - 1 ? " & " : ""}
                          </span>
                        ))}
                        {i < Object.values(m.players).length - 1 ? " vs " : ""}
                      </span>
                    ))}
                  </Link>
                  <div className="text-sm text-gray-700">
                    {m.playedAt
                      ? new Date(m.playedAt).toLocaleDateString()
                      : "—"}
                    {" · "}
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
    );
  } catch {
    return (
      <main className="container">
        <p className="text-red-500">Failed to load player.</p>
        <Link href="/players">Back to players</Link>
      </main>
    );
  }
}
