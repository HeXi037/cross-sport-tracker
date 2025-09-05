import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import LiveSummary from "./live-summary";
import PlayerName, { PlayerInfo } from "../../../components/PlayerName";

export const dynamic = "force-dynamic";

type ID = string;

// "side" can be any identifier (A, B, C, ...), so keep it loose
type Participant = { side: string; playerIds: string[] };

type Summary = {
  sets?: Record<string, number>;
  games?: Record<string, number>;
  points?: Record<string, number>;
};

type MatchDetail = {
  id: ID;
  sport?: string | null;
  ruleset?: string | null;
  status?: string | null;
  playedAt?: string | null;
  location?: string | null;
  participants?: Participant[] | null;
  summary?: Summary | null;
};

async function fetchMatch(mid: string): Promise<MatchDetail> {
  const res = (await apiFetch(`/v0/matches/${encodeURIComponent(mid)}`, {
    cache: "no-store",
  } as RequestInit)) as Response;
  if (!res.ok) throw new Error(`match ${mid}`);
  return (await res.json()) as MatchDetail;
}

async function fetchPlayers(ids: string[]): Promise<Map<string, PlayerInfo>> {
  if (!ids.length) return new Map();
  const res = (await apiFetch(
    `/v0/players/by-ids?ids=${ids.join(",")}`,
    { cache: "no-store" }
  )) as Response;
  const map = new Map<string, PlayerInfo>();
  if (!res.ok) return map;
  const players = (await res.json()) as PlayerInfo[];
  players.forEach((p) => {
    map.set(p.id, p);
  });
  return map;
}

export default async function MatchDetailPage({
  params,
}: {
  params: { mid: string };
}) {
  const match = await fetchMatch(params.mid);

  const parts = match.participants ?? [];
  const uniqueIds = Array.from(
    new Set(parts.flatMap((p) => p.playerIds ?? []))
  );
  const idToPlayer = await fetchPlayers(uniqueIds);

  const sidePlayers: Record<string, PlayerInfo[]> = {};
  for (const p of parts) {
    const players = (p.playerIds ?? []).map(
      (id) => idToPlayer.get(id) ?? { id, name: id }
    );
    sidePlayers[p.side] = players;
  }

  const playedAtDate = match.playedAt ? new Date(match.playedAt) : null;
  const playedAtStr = playedAtDate
    ? playedAtDate.getHours() || playedAtDate.getMinutes() || playedAtDate.getSeconds() || playedAtDate.getMilliseconds()
      ? playedAtDate.toLocaleString()
      : playedAtDate.toLocaleDateString()
    : "";

  return (
    <main className="container">
      <div className="text-sm">
        <Link href="/matches" className="underline underline-offset-2">
          ← Back to matches
        </Link>
      </div>

      <header className="section">
        <h1 className="heading">
          {Object.keys(sidePlayers).map((s, i) => (
            <span key={s}>
              {sidePlayers[s]?.map((pl, j) => (
                <span key={pl.id}>
                  <PlayerName player={pl} />
                  {j < (sidePlayers[s]?.length ?? 0) - 1 ? " / " : ""}
                </span>
              ))}
              {i < Object.keys(sidePlayers).length - 1 ? " vs " : ""}
            </span>
          )) || "A vs B"}
        </h1>
        <p className="match-meta">
          {match.sport || "sport"} · {match.ruleset || "rules"} · {" "}
          {match.status || "status"}
          {playedAtStr ? ` · ${playedAtStr}` : ""}
          {match.location ? ` · ${match.location}` : ""}
        </p>
      </header>
      <LiveSummary mid={params.mid} initialSummary={match.summary} />
    </main>
  );
}
