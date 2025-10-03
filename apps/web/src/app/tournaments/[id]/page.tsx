import Link from "next/link";
import { notFound } from "next/navigation";
import {
  apiFetch,
  fetchStageStandings,
  getTournament,
  listStageMatches,
  listTournamentStages,
  withAbsolutePhotoUrl,
  type ApiError,
  type StageScheduleMatch,
  type StageStandings as StageStandingsResponse,
  type StageSummary,
  type TournamentSummary,
} from "../../../lib/api";
import type { PlayerInfo } from "../../../components/PlayerName";
import StageScheduleTable from "../stage-schedule";
import StageStandings from "../stage-standings";
import { ensureTrailingSlash } from "../../../lib/routes";

function formatErrorMessage(error: unknown, fallback: string): string {
  const apiError = error as ApiError | undefined;
  const parsed = apiError?.parsedMessage ?? null;
  const detailed =
    typeof parsed === "string" && parsed.trim().length > 0
      ? parsed.trim()
      : typeof apiError?.message === "string"
      ? apiError.message
      : null;

  if (detailed && detailed !== fallback) {
    return `${fallback} (${detailed})`;
  }

  return fallback;
}

const PLAYER_LOOKUP_INCOMPLETE_MESSAGE =
  "Some player names could not be loaded. Names that are missing will appear as 'Unknown player'.";
const PLAYER_LOOKUP_FAILED_MESSAGE =
  "We couldn't load player details. Names will appear as 'Unknown player'. Try again later.";

async function fetchPlayersByIds(
  ids: string[]
): Promise<{ map: Map<string, PlayerInfo>; error: string | null }> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  const map = new Map<string, PlayerInfo>();
  if (uniqueIds.length === 0) {
    return { map, error: null };
  }

  let errorMessage: string | null = null;
  const missing = new Set(uniqueIds);
  try {
    const res = await apiFetch(
      `/v0/players/by-ids?ids=${uniqueIds.map(encodeURIComponent).join(",")}`,
      { cache: "no-store" }
    );
    const players = (await res.json()) as PlayerInfo[];
    players.forEach((player) => {
      if (player.id) {
        const normalizedName =
          typeof player.name === "string" && player.name.trim().length > 0
            ? player.name
            : null;
        if (normalizedName) {
          missing.delete(player.id);
          map.set(player.id, withAbsolutePhotoUrl(player));
        } else {
          map.set(player.id, { id: player.id, name: "Unknown player" });
        }
      }
    });
  } catch (error) {
    console.error("Failed to load player names for stage", error);
    errorMessage = formatErrorMessage(error, PLAYER_LOOKUP_FAILED_MESSAGE);
  }

  uniqueIds.forEach((id) => {
    if (!map.has(id)) {
      map.set(id, { id, name: "Unknown player" });
    }
  });

  if (errorMessage) {
    return { map, error: errorMessage };
  }

  if (missing.size > 0) {
    console.warn(
      `Player names missing for ids: ${Array.from(missing).join(", ")}`
    );
    return { map, error: PLAYER_LOOKUP_INCOMPLETE_MESSAGE };
  }

  return { map, error: null };
}

function describeStageType(stage: StageSummary): string {
  const label = stage.type.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function TournamentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let tournament: TournamentSummary;
  try {
    tournament = await getTournament(params.id, { cache: "no-store" });
  } catch (error) {
    const apiError = error as ApiError | undefined;
    if (apiError?.status === 404) {
      notFound();
    }
    throw error;
  }
  let stages: StageSummary[] = [];
  let stagesError: string | null = null;

  try {
    stages = await listTournamentStages(params.id, { cache: "no-store" });
  } catch (error) {
    console.error("Failed to load tournament stages", error);
    stagesError = formatErrorMessage(
      error,
      "Failed to load tournament stages. Try again later."
    );
  }

  if (stagesError) {
    return (
      <main className="container">
        <nav aria-label="Breadcrumb" style={{ marginBottom: 12 }}>
          <Link
            href={ensureTrailingSlash("/tournaments")}
            className="link-button"
          >
            ← Back to tournaments
          </Link>
        </nav>
        <h1 className="heading">{tournament.name}</h1>
        <p className="error" role="alert">
          {stagesError}
        </p>
      </main>
    );
  }

  const stageData = await Promise.all(
    stages.map(async (stage) => {
      let matches: StageScheduleMatch[] = [];
      let standings: StageStandingsResponse | null = null;
      let matchesError: string | null = null;
      let standingsError: string | null = null;

      try {
        matches = await listStageMatches(params.id, stage.id, {
          cache: "no-store",
        });
      } catch (error) {
        console.error("Failed to load matches for stage", error);
        matchesError = formatErrorMessage(
          error,
          "Failed to load matches for this stage. Try again later."
        );
      }

      try {
        standings = await fetchStageStandings(params.id, stage.id, {
          cache: "no-store",
        });
      } catch (error) {
        console.error("Failed to load standings for stage", error);
        standingsError = formatErrorMessage(
          error,
          "Failed to load standings for this stage. Try again later."
        );
      }

      const playerIds = new Set<string>();
      matches.forEach((match) => {
        match.participants.forEach((participant) => {
          participant.playerIds.forEach((id) => playerIds.add(id));
        });
      });
      standings?.standings.forEach((row) => playerIds.add(row.playerId));

      const { map: players, error: playerError } = await fetchPlayersByIds(
        Array.from(playerIds)
      );

      return {
        stage,
        matches,
        standings: standings?.standings ?? [],
        players,
        matchesError,
        standingsError,
        playerError,
      };
    })
  );

  return (
    <main className="container">
      <nav aria-label="Breadcrumb" style={{ marginBottom: 12 }}>
        <Link href={ensureTrailingSlash("/tournaments")} className="link-button">
          ← Back to tournaments
        </Link>
      </nav>
      <h1 className="heading">{tournament.name}</h1>
      <p className="form-hint">Sport: {tournament.sport}</p>
      <div style={{ margin: "12px 0" }}>
        <Link
          href={ensureTrailingSlash(`/record/${tournament.sport}`)}
          className="link-button"
        >
          Record a match for this sport
        </Link>
      </div>
      {stageData.length === 0 ? (
        <p className="form-hint" role="status">
          No stages have been configured yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {stageData.map(
            ({
              stage,
              matches,
              standings,
              players,
              matchesError,
              standingsError,
              playerError,
            }) => (
              <section key={stage.id} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>
                  Stage: {describeStageType(stage)}
                </h2>
                {playerError && (
                  <p className="error" role="alert">
                    {playerError}
                  </p>
                )}
                <StageScheduleTable
                  matches={matches}
                  playerLookup={players}
                  title="Scheduled matches"
                  emptyLabel="Matches will appear once the stage has been scheduled."
                  error={matchesError ?? undefined}
                />
                <StageStandings
                  standings={standings}
                  playerLookup={players}
                  title="Leaderboard"
                  error={standingsError ?? undefined}
                />
              </section>
            )
          )}
        </div>
      )}
    </main>
  );
}

