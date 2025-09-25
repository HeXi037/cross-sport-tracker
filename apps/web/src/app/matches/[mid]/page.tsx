import Link from "next/link";
import { headers } from "next/headers";
import { apiFetch, withAbsolutePhotoUrl } from "../../../lib/api";
import LiveSummary from "./live-summary";
import MatchParticipants from "../../../components/MatchParticipants";
import { PlayerInfo } from "../../../components/PlayerName";
import { formatDateTime, parseAcceptLanguage } from "../../../lib/i18n";
import { ensureTrailingSlash } from "../../../lib/routes";
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

const MATCH_LOAD_ERROR_MESSAGE =
  "Could not load this match. Please refresh the page or try again later.";
const PLAYER_LOOKUP_ERROR_MESSAGE =
  "Could not load player names for this match. Some entries may appear as \"Unknown\". Please refresh the page or try again later.";
const PLAYER_LOOKUP_NETWORK_MESSAGE =
  "Could not reach the player service. Some entries may appear as \"Unknown\". Check your connection and try again.";

type MatchRulesetInfo = {
  id?: string | null;
  name?: string | null;
  label?: string | null;
  displayName?: string | null;
  code?: string | null;
  value?: string | null;
  [key: string]: unknown;
};

type MatchStatusInfo = {
  label?: string | null;
  name?: string | null;
  display?: string | null;
  description?: string | null;
  value?: string | null;
  code?: string | null;
  status?: string | null;
  [key: string]: unknown;
};

type MatchDetail = {
  id: ID;
  sport?: string | null;
  sportName?: string | null;
  rulesetId?: string | null;
  rulesetName?: string | null;
  rulesetLabel?: string | null;
  ruleset?: MatchRulesetInfo | string | null;
  bestOf?: number | null;
  status?: MatchStatusInfo | string | null;
  statusName?: string | null;
  statusLabel?: string | null;
  playedAt?: string | null;
  location?: string | null;
  participants?: Participant[] | null;
  summary?: SummaryData | null;
  events?: ScoreEvent[] | null;
};

const PLACEHOLDER_LABELS = new Set(["-", "–", "—", "n/a", "na"]);

function normalizeLabel(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.replace(/\s+/g, " ");
  const normalizedLower = normalized.toLowerCase();
  if (
    PLACEHOLDER_LABELS.has(normalized) ||
    PLACEHOLDER_LABELS.has(normalizedLower)
  ) {
    return undefined;
  }
  return normalized;
}

function pickFirstString(
  source: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const candidate = normalizeLabel(source[key]);
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function resolveRulesetName(match: MatchDetail): string | undefined {
  const direct =
    normalizeLabel(match.rulesetName ?? match.rulesetLabel) ?? undefined;
  if (direct) return direct;

  const { ruleset } = match;
  if (!ruleset) return undefined;

  if (typeof ruleset === "string") {
    return normalizeLabel(ruleset);
  }

  if (typeof ruleset === "object" && !Array.isArray(ruleset)) {
    return pickFirstString(ruleset as Record<string, unknown>, [
      "name",
      "label",
      "displayName",
      "title",
    ]);
  }

  return undefined;
}

function resolveRulesetIdentifier(match: MatchDetail): string | undefined {
  const direct = normalizeLabel(match.rulesetId);
  if (direct) return direct;

  const { ruleset } = match;
  if (!ruleset) return undefined;

  if (typeof ruleset === "object" && !Array.isArray(ruleset)) {
    const fromObject = pickFirstString(ruleset as Record<string, unknown>, [
      "id",
      "code",
      "value",
      "slug",
    ]);
    if (fromObject) {
      return fromObject;
    }
  }

  if (typeof ruleset === "string") {
    return normalizeLabel(ruleset);
  }

  return undefined;
}

function resolveStatusCode(match: MatchDetail): string | undefined {
  const { status } = match;
  if (typeof status === "string") {
    return normalizeLabel(status);
  }

  if (status && typeof status === "object" && !Array.isArray(status)) {
    const fromKnown = pickFirstString(status as Record<string, unknown>, [
      "status",
      "code",
      "value",
      "name",
      "id",
    ]);
    if (fromKnown) {
      return fromKnown;
    }

    for (const value of Object.values(status as Record<string, unknown>)) {
      const candidate = normalizeLabel(value);
      if (candidate) {
        return candidate;
      }
    }
  }

  const fallback =
    normalizeLabel(match.statusName) ?? normalizeLabel(match.statusLabel);
  return fallback;
}

function resolveStatusText(match: MatchDetail): string | undefined {
  const labeled =
    normalizeLabel(match.statusLabel ?? match.statusName) ?? undefined;
  if (labeled) return labeled;

  const { status } = match;
  if (!status) return undefined;

  if (typeof status === "string") {
    return normalizeLabel(status);
  }

  if (typeof status === "object" && !Array.isArray(status)) {
    const fromKnown = pickFirstString(status as Record<string, unknown>, [
      "label",
      "name",
      "display",
      "description",
      "value",
      "code",
      "status",
    ]);
    if (fromKnown) {
      return fromKnown;
    }

    for (const value of Object.values(status as Record<string, unknown>)) {
      const candidate = normalizeLabel(value);
      if (candidate) {
        return candidate;
      }
    }
  }

  return undefined;
}

async function fetchMatch(mid: string): Promise<MatchDetail> {
  const res = (await apiFetch(`/v0/matches/${encodeURIComponent(mid)}`, {
    cache: "no-store",
  } as RequestInit)) as Response;
  if (!res.ok) throw new Error(`match ${mid}`);
  return (await res.json()) as MatchDetail;
}

async function fetchPlayers(ids: string[]): Promise<{
  map: Map<string, PlayerInfo>;
  error: string | null;
}> {
  const map = new Map<string, PlayerInfo>();
  if (!ids.length) {
    return { map, error: null };
  }

  try {
    const res = (await apiFetch(
      `/v0/players/by-ids?ids=${ids.join(",")}`,
      { cache: "no-store" }
    )) as Response;
    if (!res.ok) {
      ids.forEach((id) => map.set(id, { id, name: "Unknown" }));
      console.warn(`Player names missing for ids: ${ids.join(", ")}`);
      return { map, error: PLAYER_LOOKUP_ERROR_MESSAGE };
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
      return { map, error: PLAYER_LOOKUP_ERROR_MESSAGE };
    }

    return { map, error: null };
  } catch (error) {
    console.error("Failed to load player names for match participants", error);
    ids.forEach((id) => map.set(id, { id, name: "Unknown" }));
    return { map, error: PLAYER_LOOKUP_NETWORK_MESSAGE };
  }
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
  let match: MatchDetail | null = null;
  let matchError: string | null = null;
  try {
    match = await fetchMatch(params.mid);
  } catch (error) {
    console.error(`Failed to load match ${params.mid}`, error);
    matchError = MATCH_LOAD_ERROR_MESSAGE;
  }

  if (!match) {
    return (
      <main className="container">
        <div className="text-sm">
          <Link
            href={ensureTrailingSlash('/matches')}
            className="underline underline-offset-2"
          >
            ← Back to matches
          </Link>
        </div>
        <h1 className="heading mt-6">Match unavailable</h1>
        <p className="mt-2 text-red-600" role="alert">
          {matchError ?? MATCH_LOAD_ERROR_MESSAGE}
        </p>
        <div className="mt-4 flex flex-col items-start gap-3 md:flex-row md:items-center">
          <Link
            href={ensureTrailingSlash(`/matches/${params.mid}`)}
            className="button"
          >
            Try again
          </Link>
          <Link href={ensureTrailingSlash('/matches')} className="underline">
            Back to matches
          </Link>
        </div>
      </main>
    );
  }
  const locale = parseAcceptLanguage(headers().get("accept-language"));

  const parts = match.participants ?? [];
  const uniqueIds = Array.from(
    new Set(parts.flatMap((p) => p.playerIds ?? []))
  );
  const [playerLookup, sports, rulesets] = await Promise.all([
    fetchPlayers(uniqueIds),
    fetchSports(),
    fetchRulesets(match.sport),
  ]);
  const idToPlayer = playerLookup.map;
  const playerLookupError = playerLookup.error;

  const sidePlayers: Record<string, PlayerInfo[]> = {};
  for (const p of parts) {
    const players = (p.playerIds ?? []).map(
      (id) => idToPlayer.get(id) ?? { id, name: "Unknown" }
    );
    sidePlayers[p.side] = players;
  }

  const notices: string[] = [];
  if (playerLookupError) {
    notices.push(playerLookupError);
  }

  const sportName = sports.find((s) => s.id === match.sport)?.name;
  const matchedRuleset = match.rulesetId
    ? rulesets.find((r) => r.id === match.rulesetId)
    : undefined;
  const rulesetNameFromLookup = normalizeLabel(matchedRuleset?.name);
  const fallbackLabel = "—";
  const statusText = resolveStatusText(match);
  const statusCode = resolveStatusCode(match);

  const resolvedRulesetName = resolveRulesetName(match);
  const resolvedRulesetId = resolveRulesetIdentifier(match);

  const sportLabel =
    normalizeLabel(match.sportName) ??
    normalizeLabel(sportName) ??
    normalizeLabel(match.sport) ??
    fallbackLabel;
  const resolvedRulesetLabel =
    resolvedRulesetName ?? rulesetNameFromLookup ?? resolvedRulesetId;
  const rulesetLabel =
    normalizeLabel(resolvedRulesetLabel) ?? fallbackLabel;
  const resolvedStatusLabel =
    normalizeLabel(statusText) ?? normalizeLabel(statusCode);
  const statusLabel = resolvedStatusLabel ?? fallbackLabel;

  const playedAtDate = match.playedAt ? new Date(match.playedAt) : null;
  const playedAtStr = playedAtDate
    ? formatDateTime(playedAtDate, locale)
    : "";

  let initialSummary: SummaryData = match.summary ?? null;
  const summaryRecord = isRecord(initialSummary)
    ? (initialSummary as Record<string, unknown>)
    : null;

  const finishedStatus = statusCode ?? statusText;
  const isFinished = isFinishedStatus(finishedStatus);

  if (isRacketSport(match.sport) && isFinished) {
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
        <Link
          href={ensureTrailingSlash('/matches')}
          className="underline underline-offset-2"
        >
          ← Back to matches
        </Link>
      </div>

      {notices.length ? (
        <div
          role="alert"
          className="mt-6 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
        >
          {notices.map((notice, index) => (
            <p
              key={`${index}-${notice}`}
              className={index > 0 ? "mt-2" : undefined}
            >
              {notice}
            </p>
          ))}
        </div>
      ) : null}

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
        statusCode={statusCode}
        initialSummary={initialSummary}
        initialEvents={match.events ?? []}
        initiallyFinished={isFinished}
      />
    </main>
  );
}
