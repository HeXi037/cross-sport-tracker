"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ensureTrailingSlash } from "../../lib/routes";
import {
  deleteTournament,
  type ApiError,
  type TournamentSummary,
} from "../../lib/api";
import CreateTournamentForm from "./create-tournament-form";
import { useSessionSnapshot } from "../../lib/useSessionSnapshot";

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
  const session = useSessionSnapshot();
  const { isAdmin, isLoggedIn, userId } = session;
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const emptyMessage = useMemo(() => {
    if (loadError) {
      return "Unable to load tournaments. Please try again later.";
    }
    if (tournaments.length === 0) {
      return "No tournaments have been created yet.";
    }
    return null;
  }, [loadError, tournaments.length]);

  const handleTournamentCreated = (created: TournamentSummary) => {
    setError(null);
    setStatus(
      `Added ${created.name}. Use the links below to manage stages and matches.`
    );
    setTournaments((prev) => {
      const next = [created, ...prev];
      next.sort((a, b) => a.name.localeCompare(b.name));
      return next;
    });
  };

  const canDelete = useMemo(() => {
    if (isAdmin) {
      return () => true;
    }
    if (!isLoggedIn || !userId) {
      return () => false;
    }
    return (tournament: TournamentSummary) =>
      tournament.createdByUserId === userId && tournament.sport === "padel";
  }, [isAdmin, isLoggedIn, userId]);

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
    setStatus(null);
    try {
      await deleteTournament(tournament.id);
      setTournaments((prev) => prev.filter((t) => t.id !== tournament.id));
      setStatus(`${tournament.name} was deleted.`);
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
            The Americano tournament scheduler is still being set up. Check back soon to generate
            rotations and manage fixtures.
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
            {status && (
              <p className="form-hint" role="status">
                {status}
              </p>
            )}
            {emptyMessage ? (
              <p className={loadError ? "error" : "form-hint"}>{emptyMessage}</p>
            ) : (
              <ul style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {tournaments.map((tournament) => (
                  <li key={tournament.id} className="card" style={{ padding: 16 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <h3 style={{ fontSize: 18, fontWeight: 600 }}>{tournament.name}</h3>
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

