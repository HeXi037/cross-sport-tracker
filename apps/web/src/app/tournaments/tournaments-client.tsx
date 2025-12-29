"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { ensureTrailingSlash } from "../../lib/routes";
import {
  deleteTournament,
  type ApiError,
  type TournamentSummary,
  updateTournament,
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
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

  const canManage = useMemo(() => {
    if (isAdmin) {
      return () => true;
    }
    if (!isLoggedIn || !userId) {
      return () => false;
    }
    return (tournament: TournamentSummary) => tournament.createdByUserId === userId;
  }, [isAdmin, isLoggedIn, userId]);

  const handleDelete = async (tournament: TournamentSummary) => {
    if (!canManage(tournament)) {
      setError("You can only delete tournaments that you created.");
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
        setError("You can only delete tournaments that you created.");
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

  const handleStartEdit = (tournament: TournamentSummary) => {
    if (!canManage(tournament)) {
      setError("You can only edit tournaments that you created.");
      return;
    }
    setStatus(null);
    setError(null);
    setEditingId(tournament.id);
    setEditingName(tournament.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setSavingEdit(false);
  };

  const handleEditSubmit = async (
    event: FormEvent<HTMLFormElement>,
    tournament: TournamentSummary
  ) => {
    event.preventDefault();
    if (!canManage(tournament)) {
      setError("You can only edit tournaments that you created.");
      handleCancelEdit();
      return;
    }
    if (savingEdit) {
      return;
    }
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setError("Enter a tournament name before saving.");
      return;
    }
    setSavingEdit(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await updateTournament(tournament.id, { name: trimmedName });
      setTournaments((prev) => {
        const next = prev.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        );
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      setStatus(`${updated.name} was updated.`);
      handleCancelEdit();
    } catch (err) {
      console.error("Failed to update tournament", err);
      const apiError = err as ApiError | undefined;
      if (apiError?.status === 403) {
        setError("You can only edit tournaments that you created.");
      } else if (apiError?.status === 404) {
        setError("This tournament no longer exists.");
        setTournaments((prev) => prev.filter((item) => item.id !== tournament.id));
        handleCancelEdit();
      } else if (apiError?.status === 400) {
        const detailed =
          typeof apiError.parsedMessage === "string" && apiError.parsedMessage.trim()
            ? apiError.parsedMessage.trim()
            : "Unable to update the tournament. Please check the details and try again.";
        setError(detailed);
      } else {
        setError("Unable to update the tournament. Please try again.");
      }
    } finally {
      setSavingEdit(false);
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
          <section className="card" style={{ padding: 16 }}>
            <h2 className="subheading">Tournament permissions</h2>
            <ul
              className="form-hint"
              style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}
            >
              <li>Admins can create, edit, and delete tournaments for any sport.</li>
              <li>
                Logged-in organisers can create supported formats and manage the tournaments they
                created.
              </li>
              <li>Contact an admin to manage tournaments created by other organisers.</li>
            </ul>
            {!isLoggedIn && (
              <p className="form-hint" style={{ marginTop: 12 }}>
                Sign in to create tournaments and manage their schedules.
              </p>
            )}
          </section>
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
              <p className="form-hint">
                {isAdmin
                  ? "You can edit or delete any tournament."
                  : "You can edit or delete tournaments that you created."}
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
                    {editingId === tournament.id ? (
                      <form
                        onSubmit={(event) => handleEditSubmit(event, tournament)}
                        style={{ display: "flex", flexDirection: "column", gap: 8 }}
                        aria-label={`Edit ${tournament.name}`}
                      >
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div>
                            <label
                              className="form-label"
                              htmlFor={`edit-tournament-name-${tournament.id}`}
                            >
                              Tournament name
                            </label>
                            <input
                              id={`edit-tournament-name-${tournament.id}`}
                              type="text"
                              value={editingName}
                              onChange={(event) => setEditingName(event.target.value)}
                              autoFocus
                            />
                            <p className="form-hint">Update the name shown on tournament pages.</p>
                          </div>
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
                          <button
                            type="submit"
                            className="link-button"
                            disabled={savingEdit}
                          >
                            {savingEdit ? "Saving…" : "Save changes"}
                          </button>
                          <button
                            type="button"
                            className="link-button"
                            onClick={handleCancelEdit}
                            disabled={savingEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
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
                          {canManage(tournament) && (
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => handleStartEdit(tournament)}
                              disabled={deletingId === tournament.id}
                            >
                              Edit
                            </button>
                          )}
                          {canManage(tournament) && (
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
                    )}
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
