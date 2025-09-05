import Link from "next/link";
import { apiFetch } from "../../lib/api";
import Pager from "./pager";
import PlayerName, { PlayerInfo } from "../../components/PlayerName";

export const dynamic = "force-dynamic";

type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
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
  } | null;
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
        name: string;
        photo_url?: string | null;
      }[];
      players.forEach((p) => {
        if (p.id && p.name) idToPlayer.set(p.id, p);
      });
    }
  }

  return details.map(({ row, detail }) => {
    const participants = detail.participants
      .slice()
      .sort((a, b) => a.side.localeCompare(b.side))
      .map((p) => p.playerIds.map((id) => idToPlayer.get(id) ?? { id, name: id }));
    return { ...row, participants, summary: detail.summary };
  });
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

export default async function MatchesPage(
  props: {
    searchParams?: Record<string, string | string[] | undefined>;
  }
) {
  const searchParams = props.searchParams ?? {};
  const limit = Number(searchParams.limit) || 25;
  const offset = Number(searchParams.offset) || 0;

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

    return (
      <main className="container">
        <h1 className="heading">Matches</h1>
        <ul className="match-list">
          {matches.map((m) => (
            <li key={m.id} className="card match-item">
              <div style={{ fontWeight: 500 }}>
                {m.participants.map((side, i) => (
                  <span key={i}>
                    {side.map((pl, j) => (
                      <span key={pl.id}>
                        <PlayerName player={pl} />
                        {j < side.length - 1 ? " & " : ""}
                      </span>
                    ))}
                    {i < m.participants.length - 1 ? " vs " : ""}
                  </span>
                ))}
              </div>
              <div className="match-meta">
                {formatSummary(m.summary)}
                {m.summary ? " · " : ""}
                {m.sport} · Best of {m.bestOf ?? "—"} ·{" "}
                {m.playedAt ? new Date(m.playedAt).toLocaleDateString() : "—"} ·{" "}
                {m.location ?? "—"}
              </div>
              <div>
                <Link href={`/matches/${m.id}`}>More info</Link>
              </div>
            </li>
          ))}
        </ul>
        <Pager
          limit={limit}
          prevOffset={prevOffset}
          nextOffset={nextOffset}
          disablePrev={disablePrev}
          disableNext={disableNext}
        />
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
