import Link from "next/link";
import { notFound } from "next/navigation";
import {
  apiFetch,
  fetchStageStandings,
  listStageMatches,
  withAbsolutePhotoUrl,
  type ApiError,
  type StageScheduleMatch,
  type StageStandings,
  type StageSummary,
  type TournamentSummary,
} from "../../../lib/api";
import type { PlayerInfo } from "../../../components/PlayerName";
import StageScheduleTable from "../stage-schedule";
import StageStandings from "../stage-standings";
import { ensureTrailingSlash } from "../../../lib/routes";

async function fetchTournament(id: string): Promise<TournamentSummary> {
  try {
    const res = await apiFetch(`/v0/tournaments/${id}`, { cache: "no-store" });
    return (await res.json()) as TournamentSummary;
  } catch (error) {
    const apiError = error as ApiError | undefined;
    if (apiError?.status === 404) {
      notFound();
    }
    throw error;
  }
}

async function fetchStages(tournamentId: string): Promise<StageSummary[]> {
  try {
    const res = await apiFetch(`/v0/tournaments/${tournamentId}/stages`, {
      cache: "no-store",
    });
    return (await res.json()) as StageSummary[];
  } catch (error) {
    console.error("Failed to load tournament stages", error);
    return [];
  }
}

async function fetchPlayersByIds(ids: string[]): Promise<Map<string, PlayerInfo>> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  const map = new Map<string, PlayerInfo>();
  if (uniqueIds.length === 0) {
    return map;
  }

  try {
    const res = await apiFetch(
      `/v0/players/by-ids?ids=${uniqueIds.map(encodeURIComponent).join(",")}`,
      { cache: "no-store" }
    );
    const players = (await res.json()) as PlayerInfo[];
    players.forEach((player) => {
      if (player.id) {
        map.set(player.id, withAbsolutePhotoUrl(player));
      }
    });
  } catch (error) {
    console.error("Failed to load player names for stage", error);
  }

  uniqueIds.forEach((id) => {
    if (!map.has(id)) {
      map.set(id, { id, name: "Unknown player" });
    }
  });

  return map;
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
  const tournament = await fetchTournament(params.id);
  const stages = await fetchStages(params.id);

  const stageData = await Promise.all(
    stages.map(async (stage) => {
      let matches: StageScheduleMatch[] = [];
      let standings: StageStandings | null = null;

      try {
        matches = await listStageMatches(params.id, stage.id, {
          cache: "no-store",
        });
      } catch (error) {
        console.error("Failed to load matches for stage", error);
      }

      try {
        standings = await fetchStageStandings(params.id, stage.id, {
          cache: "no-store",
        });
      } catch (error) {
        console.error("Failed to load standings for stage", error);
      }

      const playerIds = new Set<string>();
      matches.forEach((match) => {
        match.participants.forEach((participant) => {
          participant.playerIds.forEach((id) => playerIds.add(id));
        });
      });
      standings?.standings.forEach((row) => playerIds.add(row.playerId));

      const players = await fetchPlayersByIds(Array.from(playerIds));

      return {
        stage,
        matches,
        standings: standings?.standings ?? [],
        players,
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
        <p className="form-hint">No stages have been configured yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {stageData.map(({ stage, matches, standings, players }) => (
            <section key={stage.id} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>
                Stage: {describeStageType(stage)}
              </h2>
              <StageScheduleTable
                matches={matches}
                playerLookup={players}
                title="Scheduled matches"
                emptyLabel="Matches will appear once the stage has been scheduled."
              />
              <StageStandings
                standings={standings}
                playerLookup={players}
                title="Leaderboard"
              />
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
