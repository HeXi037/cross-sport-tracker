import TournamentsClient from "./tournaments-client";
import {
  listTournaments,
  type ApiError,
  type TournamentSummary,
} from "../../lib/api";

export default async function TournamentsPage() {
  let tournaments: TournamentSummary[] = [];
  let loadError = false;
  let comingSoon = false;

  try {
    tournaments = await listTournaments({ cache: "no-store" });
  } catch (err) {
    const apiError = err as ApiError | undefined;
    if (apiError?.status === 404) {
      comingSoon = true;
    } else {
      console.error("Failed to load tournaments", err);
      loadError = true;
    }
  }

  return (
    <main className="container">
      <h1 className="heading">Tournaments</h1>
      <p className="form-hint">
        Create Americano tournaments, generate schedules, and review standings.
      </p>
      <TournamentsClient
        initialTournaments={tournaments}
        loadError={loadError}
        comingSoon={comingSoon}
      />
    </main>
  );
}

