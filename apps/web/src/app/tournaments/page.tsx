import TournamentsClient from "./tournaments-client";
import { listTournaments, type TournamentSummary } from "../../lib/api";

export default async function TournamentsPage() {
  let tournaments: TournamentSummary[] = [];
  let loadError = false;

  try {
    tournaments = await listTournaments({ cache: "no-store" });
  } catch (err) {
    console.error("Failed to load tournaments", err);
    loadError = true;
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
      />
    </main>
  );
}
