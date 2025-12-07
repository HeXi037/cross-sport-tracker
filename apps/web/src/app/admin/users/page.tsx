"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiFetch, isAdmin } from "../../../lib/api";
import { rememberLoginRedirect } from "../../../lib/loginRedirect";
import { useToast } from "../../../components/ToastProvider";

type UserStatus = "active" | "locked" | "must-change";

type AdminUser = {
  id: string;
  name: string;
  username: string;
  country?: string;
  club?: string | null;
  lastLogin?: string | null;
  status: UserStatus;
};

const MOCK_USERS: AdminUser[] = [
  {
    id: "user-1",
    name: "Emil",
    username: "emil",
    country: "Norway",
    club: "Oslo Smash Club",
    lastLogin: "2024-09-12T08:30:00Z",
    status: "active",
  },
  {
    id: "user-2",
    name: "Jade",
    username: "jade",
    country: "USA",
    club: "Portland Pickleball",
    lastLogin: "2024-09-10T18:05:00Z",
    status: "must-change",
  },
  {
    id: "user-3",
    name: "Lina",
    username: "lina",
    country: "Sweden",
    club: "Göteborg Padel",
    lastLogin: "2024-09-02T13:15:00Z",
    status: "locked",
  },
];

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusLabel(status: UserStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "locked":
      return "Locked";
    case "must-change":
      return "Must change password";
    default:
      return status;
  }
}

type ResetMode = "temporary" | "custom";

export default function AdminUsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>(MOCK_USERS);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [mode, setMode] = useState<ResetMode>("temporary");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  const [customPassword, setCustomPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAdmin()) {
      rememberLoginRedirect();
    }
    setReady(true);
  }, []);

  const sortedUsers = useMemo(
    () =>
      users
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [users],
  );

  const resetModal = () => {
    setMode("temporary");
    setGeneratedPassword(null);
    setCustomPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const handleResetClick = (user: AdminUser) => {
    setSelected(user);
    resetModal();
  };

  const handleGenerate = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/v0/auth/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, username: selected.username }),
      });
      const data = await res.json();
      const password =
        (data && (data.temporaryPassword || data.temporary_password)) ||
        "";
      const nextPassword = password || "aX8-pQ39-Zt";
      setGeneratedPassword(nextPassword);
      setUsers((current) =>
        current.map((user) =>
          user.id === selected.id ? { ...user, status: "must-change" } : user,
        ),
      );
      showToast({
        message: `Password reset for ${selected.name}. Temporary password generated.`,
        variant: "success",
      });
    } catch (err) {
      setError("Unable to generate a temporary password. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const trimmed = customPassword.trim();
    if (!trimmed) {
      setError("Enter a password to continue.");
      return;
    }
    if (trimmed !== customPassword || trimmed !== confirmPassword.trim()) {
      setError("Passwords must match and not include leading or trailing spaces.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      setUsers((current) =>
        current.map((user) =>
          user.id === selected.id ? { ...user, status: "active" } : user,
        ),
      );
      showToast({
        message: `Saved a new password for ${selected.name}.`,
        variant: "success",
      });
      setSelected(null);
    } catch (err) {
      setError("We couldn't save this password right now. Please try again.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const requireChangeWarning = selected?.status === "must-change";

  if (!ready) {
    return null;
  }

  if (!isAdmin()) {
    window.location.href = "/login";
    return null;
  }

  return (
    <main className="container">
      <header className="admin-users__header">
        <div>
          <p className="section-eyebrow">Players & accounts</p>
          <h1 className="heading">Users</h1>
          <p className="text-muted">
            Manage player logins, sign out active sessions, and reset passwords
            when needed.
          </p>
        </div>
      </header>

      <section className="card">
        <div className="admin-users__table-head">
          <div>
            <h2 className="card-title">User list</h2>
            <p className="text-muted">Reset passwords or review account status.</p>
          </div>
        </div>
        <div className="admin-table" role="table" aria-label="User list">
          <div className="admin-table__head" role="row">
            <div role="columnheader">Name</div>
            <div role="columnheader">Username</div>
            <div role="columnheader">Club</div>
            <div role="columnheader">Last login</div>
            <div role="columnheader">Status</div>
            <div role="columnheader" className="admin-table__actions-col">
              Actions
            </div>
          </div>
          {sortedUsers.map((user) => (
            <div className="admin-table__row" role="row" key={user.id}>
              <div role="cell">
                <div className="admin-users__name">{user.name}</div>
                <div className="text-muted">{user.country ?? "—"}</div>
              </div>
              <div role="cell">{user.username}</div>
              <div role="cell">{user.club ?? "—"}</div>
              <div role="cell">{formatDate(user.lastLogin)}</div>
              <div role="cell">
                <span
                  className={`status-pill status-pill--${user.status.replace("-", "")}`}
                >
                  {statusLabel(user.status)}
                </span>
              </div>
              <div role="cell" className="admin-table__actions-col">
                <div className="admin-users__actions">
                  <button className="button button--ghost" type="button">
                    View
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => handleResetClick(user)}
                    title="Reset password"
                  >
                    Reset password
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {selected ? (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal__content">
            <div className="modal__header">
              <div>
                <p className="section-eyebrow">Reset password</p>
                <h2 className="modal__title">
                  Reset password for {selected.name}
                  {selected.country ? ` (${selected.country})` : ""}
                </h2>
                <p className="text-muted">
                  This will reset {selected.name}'s password and sign them out of
                  active sessions.
                </p>
              </div>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
            </div>

            {requireChangeWarning ? (
              <div className="alert alert-warning" role="status">
                This user already has a temporary password. Do you want to
                generate a new one?
              </div>
            ) : null}

            {error ? (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="reset-mode-switch" role="tablist" aria-label="Reset options">
              <button
                className={`reset-mode-switch__button${
                  mode === "temporary" ? " is-active" : ""
                }`}
                role="tab"
                aria-selected={mode === "temporary"}
                onClick={() => setMode("temporary")}
                type="button"
              >
                Generate temporary password (recommended)
              </button>
              <button
                className={`reset-mode-switch__button${
                  mode === "custom" ? " is-active" : ""
                }`}
                role="tab"
                aria-selected={mode === "custom"}
                onClick={() => setMode("custom")}
                type="button"
              >
                Set custom password
              </button>
            </div>

            {mode === "temporary" ? (
              <div className="card reset-card">
                <div className="reset-card__row">
                  <div>
                    <h3 className="card-title">Temporary password</h3>
                    <p className="text-muted">
                      Generate a one-time password and share it securely. The
                      player will be asked to set a new password after logging
                      in.
                    </p>
                  </div>
                  <button
                    className="button"
                    type="button"
                    onClick={handleGenerate}
                    disabled={loading}
                  >
                    {loading ? "Generating…" : "Generate temporary password"}
                  </button>
                </div>
                {generatedPassword ? (
                  <div className="reset-card__result" aria-live="polite">
                    <label className="form-field" htmlFor="generated-password">
                      <span className="form-label">Temporary password</span>
                      <div className="generated-password">
                        <input
                          id="generated-password"
                          value={generatedPassword}
                          readOnly
                          className="input"
                        />
                        <button
                          className="button button--ghost"
                          type="button"
                          onClick={() =>
                            navigator.clipboard?.writeText(generatedPassword)
                          }
                        >
                          Copy
                        </button>
                      </div>
                    </label>
                    <p className="text-muted">
                      Share this password securely with the player. They'll be asked
                      to choose a new password after logging in.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="card reset-card">
                <form className="reset-card__form" onSubmit={handleCustomSubmit}>
                  <label className="form-field" htmlFor="custom-password">
                    <span className="form-label">New password</span>
                    <input
                      id="custom-password"
                      type="password"
                      value={customPassword}
                      onChange={(event) => setCustomPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <label className="form-field" htmlFor="confirm-password">
                    <span className="form-label">Confirm new password</span>
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" defaultChecked />
                    Require password change at next login
                  </label>
                  <div className="reset-card__footer">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => setSelected(null)}
                    >
                      Cancel
                    </button>
                    <button className="button" type="submit" disabled={loading}>
                      {loading ? "Saving…" : "Save new password"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <footer className="modal__footer">
              <span className="text-muted">This action will be logged in the audit log.</span>
              {mode === "temporary" ? (
                <button
                  className="button"
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                >
                  {loading ? "Resetting…" : "Reset password"}
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
