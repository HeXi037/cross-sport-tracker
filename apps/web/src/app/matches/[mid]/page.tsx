import Link from "next/link";
import { headers } from "next/headers";
import { apiFetch, withAbsolutePhotoUrl } from "../../../lib/api";
import LiveSummary from "./live-summary";
import MatchParticipants from "../../../components/MatchParticipants";
import { PlayerInfo } from "../../../components/PlayerName";
import { formatDateTime, parseAcceptLanguage } from "../../../lib/i18n";
import {
  type SummaryData,
  type ScoreEvent,
  isFinishedStatus,
  isRacketSport,
  rebuildRacketSummaryFromEvents,
  shouldRebuildRacketSummary,
  isRecord,
} from "../../../lib/match-summary";

export const dynamic = "force-dynamic";

type ID = string;

// "side" can be any identifier (A, B, C, ...), so keep it loose
type Participant = { side: string; playerIds: string[] };

type Sport = { id: string; name: string };

type Ruleset = { id: string; name: string };

type MatchDetail = {
  id: ID;
  sport?: string | null;
  sportName?: string | null;
  rulesetId?: string | null;
  rulesetName?: string | null;
  bestOf?: number | null;
  status?: string | null;
  playedAt?: string | null;
  location?: string | null;
  participants?: Participant[] | null;
  summary?: SummaryData | null;
  events?: ScoreEvent[] | null;
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
        map.set(p.id, withAbsolutePhotoUrl(p));
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
    const res = (await apiFetch(`/v0/sports`, {
      cache: "no-store",
    } as RequestInit)) as Response;
    if (!res.ok) {
      return [];
    }
    return (await res.json()) as Sport[];
  } catch (error) {
    console.warn("Unable to load sports catalog", error);
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
    if (!res.ok) {
      return [];
    }
    return (await res.json()) as Ruleset[];
  } catch (error) {
    console.warn(`Unable to load rulesets for sport ${sportId}`, error);
    return [];
  }
}

export default async function MatchDetailPage({
  params,
}: {
  params: { mid: string };
}) {
  const match = await fetchMatch(params.mid);
  const locale = parseAcceptLanguage(headers().get("accept-language"));

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

  const sportName = sports.find((s) => s.id === match.sport)?.name;
  const rulesetName = match.rulesetId
    ? rulesets.find((r) => r.id === match.rulesetId)?.name
    : undefined;
  const fallbackLabel = "—";
  const statusText =
    typeof match.status === "string" && match.status.trim()
      ? match.status.trim()
      : undefined;

  const sportLabel =
    match.sportName ?? sportName ?? match.sport ?? fallbackLabel;
  const rulesetLabel =
    match.rulesetName ?? rulesetName ?? match.rulesetId ?? fallbackLabel;
  const statusLabel = statusText ?? fallbackLabel;

  const playedAtDate = match.playedAt ? new Date(match.playedAt) : null;
  const playedAtStr = playedAtDate
    ? formatDateTime(playedAtDate, locale)
    : "";

  let initialSummary: SummaryData = match.summary ?? null;
  const summaryRecord = isRecord(initialSummary)
    ? (initialSummary as Record<string, unknown>)
    : null;

  if (isRacketSport(match.sport) && isFinishedStatus(statusText)) {
    const needsRebuild =
      shouldRebuildRacketSummary(initialSummary) || !summaryRecord;
    if (needsRebuild) {
      const config =
        summaryRecord && "config" in summaryRecord
          ? (summaryRecord as { config?: unknown }).config
          : undefined;
      const derived = rebuildRacketSummaryFromEvents(
        match.sport,
        match.events ?? [],
        config
      );
      if (derived) {
        initialSummary = summaryRecord ? { ...summaryRecord, ...derived } : derived;
      }
    }
  }

  return (
    <main className="container">
      <div className="text-sm">
        <Link href="/matches" className="underline underline-offset-2">
          ← Back to matches
        </Link>
      </div>

      <header className="section">
        <h1 className="heading">
          {Object.keys(sidePlayers).length ? (
            <MatchParticipants
              as="span"
              sides={Object.values(sidePlayers)}
              separatorSymbol="/"
            />
          ) : (
            "A vs B"
          )}
        </h1>
        <p className="match-meta">
          {sportLabel} · {rulesetLabel} ·{" "}
          {statusLabel}
          {playedAtStr ? ` · ${playedAtStr}` : ""}
          {match.location ? ` · ${match.location}` : ""}
        </p>
      </header>
      <LiveSummary
        mid={params.mid}
        sport={match.sport}
        status={statusText}
        initialSummary={initialSummary}
        initialEvents={match.events ?? []}
      />
    </main>
  );
}
