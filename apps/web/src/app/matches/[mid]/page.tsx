import Link from "next/link";
import { apiFetch } from "../../../lib/api";
import LiveSummary from "./live-summary";
import PlayerLabel from "../../../components/PlayerLabel";

export const dynamic = "force-dynamic";

type ID = string;

// "side" can be any identifier (A, B, C, ...), so keep it loose
type Participant = { side: string; playerIds?: string[] };

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

async function fetchPlayerNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const res = (await apiFetch(
    `/v0/players/by-ids?ids=${ids.join(",")}`,
    { cache: "no-store" }
  )) as Response;
  const map = new Map<string, string>();
  if (!res.ok) return map;
  const players = (await res.json()) as {
    id?: string;
    name?: string;
    playerId?: string;
    playerName?: string;
  }[];
  players.forEach((p) => {
    const pid = p.id ?? p.playerId;
    const pname = p.name ?? p.playerName;
    if (pid && pname) map.set(pid, pname);
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
  const idToName = await fetchPlayerNames(uniqueIds);


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
          {parts.map((p, idx) => (
            <span key={p.side}>
              {(p.playerIds ?? []).map((pid, j, arr) => (
                <span key={pid}>
                  <PlayerLabel id={pid} name={idToName.get(pid)} />
                  {j < arr.length - 1 ? " / " : ""}
                </span>
              ))}
              {idx < parts.length - 1 ? " vs " : ""}
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
