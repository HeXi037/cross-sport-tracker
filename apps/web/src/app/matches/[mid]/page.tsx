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
  rulesetId?: string | null;
  bestOf?: number | null;
  status?: string | null;
  playedAt?: string | null;
  location?: string | null;
  participants?: Participant[] | null;
  summary?: Summary | null;
};

type Sport = { id: string; name: string };
type Ruleset = { id: string; name: string };

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
  if (!res.ok) {
    ids.forEach((id) => map.set(id, { id, name: "Unknown" }));
    console.warn(`Player names missing for ids: ${ids.join(", ")}`);
    return map;
  }
  const players = (await res.json()) as PlayerInfo[];
  const remaining = new Set(ids);
  const missing: string[] = [];
  players.forEach((p) => {
    if (p.id) {
      remaining.delete(p.id);
      if (p.name) {
        map.set(p.id, p);
      } else {
        missing.push(p.id);
        map.set(p.id, { id: p.id, name: "Unknown" });
      }
    }
  });
  if (remaining.size) {
    missing.push(...Array.from(remaining));
    remaining.forEach((id) => map.set(id, { id, name: "Unknown" }));
  }
  if (missing.length) {
    console.warn(`Player names missing for ids: ${missing.join(", ")}`);
  }
  return map;
}

async function fetchSports(): Promise<Sport[]> {
  try {
    const res = (await apiFetch("/v0/sports", {
      cache: "no-store",
    } as RequestInit)) as Response;
    return (await res.json()) as Sport[];
  } catch {
    return [];
  }
}

async function fetchRulesets(sportId?: string | null): Promise<Ruleset[]> {
  if (!sportId) return [];
  try {
    const res = (await apiFetch(
      `/v0/rulesets?sport=${encodeURIComponent(sportId)}`,
      { cache: "no-store" } as RequestInit
    )) as Response;
    return (await res.json()) as Ruleset[];
  } catch {
    return [];
  }
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
  const [idToPlayer, sports, rulesets] = await Promise.all([
    fetchPlayers(uniqueIds),
    fetchSports(),
    fetchRulesets(match.sport),
  ]);

  const sidePlayers: Record<string, PlayerInfo[]> = {};
  for (const p of parts) {
    const players = (p.playerIds ?? []).map(
      (id) => idToPlayer.get(id) ?? { id, name: "Unknown" }
    );
    sidePlayers[p.side] = players;
  }

  const playedAtDate = match.playedAt ? new Date(match.playedAt) : null;
  const playedAtStr = playedAtDate
    ? playedAtDate.getHours() || playedAtDate.getMinutes() || playedAtDate.getSeconds() || playedAtDate.getMilliseconds()
      ? playedAtDate.toLocaleString()
      : playedAtDate.toLocaleDateString()
    : "";

  const sportLabel = match.sport
    ? sports.find((s) => s.id === match.sport)?.name ?? match.sport
    : "sport";

  const rulesetLabel = match.rulesetId
    ? rulesets.find((r) => r.id === match.rulesetId)?.name ?? match.rulesetId
    : "rules";

  const metaParts = [sportLabel || "sport", rulesetLabel || "rules"];
  metaParts.push(match.status || "status");
  if (playedAtStr) metaParts.push(playedAtStr);
  if (match.location) metaParts.push(match.location);

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
        <p className="match-meta">{metaParts.join(" · ")}</p>
      </header>
      <LiveSummary mid={params.mid} initialSummary={match.summary} />
    </main>
  );
}
