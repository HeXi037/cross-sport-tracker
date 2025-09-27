"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ensureTrailingSlash } from "../../lib/routes";
import type { TournamentSummary } from "../../lib/api";
import CreateTournamentForm from "./create-tournament-form";

interface TournamentsClientProps {
  initialTournaments: TournamentSummary[];
  loadError?: boolean;
}

export default function TournamentsClient({
  initialTournaments,
  loadError = false,
}: TournamentsClientProps) {
  const [tournaments, setTournaments] = useState(initialTournaments);

  const emptyMessage = useMemo(() => {
    if (loadError) {
      return "Unable to load tournaments.";
    }
    if (tournaments.length === 0) {
      return "No tournaments have been created yet.";
    }
    return null;
  }, [loadError, tournaments.length]);

  const handleTournamentCreated = (created: TournamentSummary) => {
    setTournaments((prev) => {
      const next = [created, ...prev];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <CreateTournamentForm onCreated={handleTournamentCreated} />
      <section
        aria-labelledby="tournament-list-heading"
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 id="tournament-list-heading" className="subheading">
            Existing tournaments
          </h2>
          <p className="form-hint">
            Browse previously created tournaments and manage their stages.
          </p>
        </div>
        {emptyMessage ? (
          <p className={loadError ? "error" : "form-hint"}>{emptyMessage}</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tournaments.map((tournament) => (
              <li key={tournament.id} className="card" style={{ padding: 16 }}>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 600 }}>
                      {tournament.name}
                    </h3>
                    <p className="form-hint">Sport: {tournament.sport}</p>
                    {tournament.clubId && (
                      <p className="form-hint">Club: {tournament.clubId}</p>
                    )}
                  </div>
                  <div>
                    <Link
                      href={ensureTrailingSlash(`/tournaments/${tournament.id}`)}
                      className="link-button"
                    >
                      View tournament
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
