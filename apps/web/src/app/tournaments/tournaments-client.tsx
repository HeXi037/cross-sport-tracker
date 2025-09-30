"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ensureTrailingSlash } from "../../lib/routes";
import {
  currentUserId,
  deleteTournament,
  isAdmin,
  isLoggedIn,
  type ApiError,
  type TournamentSummary,
} from "../../lib/api";
import CreateTournamentForm from "./create-tournament-form";

interface TournamentsClientProps {
  initialTournaments: TournamentSummary[];
  loadError?: boolean;
  comingSoon?: boolean;
}

export default function TournamentsClient({
  initialTournaments,
  loadError = false,
  comingSoon = false,
}: TournamentsClientProps) {
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [admin, setAdmin] = useState(() => isAdmin());
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [userId, setUserId] = useState(() => currentUserId());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setAdmin(isAdmin());
      setLoggedIn(isLoggedIn());
      setUserId(currentUserId());
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

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
    setError(null);
    setTournaments((prev) => {
      const next = [created, ...prev];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
  };

  const canDelete = useMemo(() => {
    if (admin) {
      return () => true;
    }
    if (!loggedIn || !userId) {
      return () => false;
    }
    return (tournament: TournamentSummary) =>
      tournament.createdByUserId === userId && tournament.sport === "padel";
  }, [admin, loggedIn, userId]);

  const handleDelete = async (tournament: TournamentSummary) => {
    if (!canDelete(tournament)) {
      setError("You do not have permission to delete this tournament.");
      return;
    }
    if (deletingId) return;
    const confirmed = window.confirm(
      `Delete ${tournament.name}? This will remove all scheduled matches.`
    );
    if (!confirmed) {
      return;
    }
    setDeletingId(tournament.id);
    setError(null);
    try {
      await deleteTournament(tournament.id);
      setTournaments((prev) => prev.filter((t) => t.id !== tournament.id));
    } catch (err) {
      console.error("Failed to delete tournament", err);
      const apiError = err as ApiError | undefined;
      if (apiError?.status === 403) {
        setError("You can only delete Americano tournaments that you created.");
      } else if (apiError?.status === 404) {
        setError("This tournament no longer exists.");
        setTournaments((prev) => prev.filter((t) => t.id !== tournament.id));
      } else {
        setError("Unable to delete the tournament. Please try again.");
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {comingSoon ? (
        <section className="card" style={{ padding: 16 }}>
          <h2 className="subheading">Coming soon</h2>
          <p className="form-hint" style={{ marginTop: 8 }}>
            The Americano tournament scheduler is still being set up. Check
            back soon to generate rotations and manage fixtures.
          </p>
        </section>
      ) : (
        <>
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
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
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
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link
                          href={ensureTrailingSlash(`/tournaments/${tournament.id}`)}
                          className="link-button"
                        >
                          View tournament
                        </Link>
                        {canDelete(tournament) && (
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => handleDelete(tournament)}
                            disabled={deletingId === tournament.id}
                          >
                            {deletingId === tournament.id ? "Deleting…" : "Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
