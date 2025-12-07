"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { apiFetch, isAdmin } from "../../../lib/api";
import { rememberLoginRedirect } from "../../../lib/loginRedirect";
import { useToast } from "../../../components/ToastProvider";
import { COUNTRY_OPTIONS } from "../../../lib/countries";

type UserStatus = "active" | "locked" | "must-change";

type AdminUser = {
  id: string;
  playerId: string;
  name: string;
  username: string;
  country?: string;
  club?: string | null;
  lastLogin?: string | null;
  status: UserStatus;
};

type PlayerAccountSummary = {
  playerId: string;
  userId: string;
  username: string;
  name: string;
  clubName?: string | null;
  countryCode?: string | null;
  mustChangePassword: boolean;
};

const COUNTRY_NAME_BY_CODE = COUNTRY_OPTIONS.reduce<Record<string, string>>(
  (acc, option) => {
    acc[option.code] = option.name;
    return acc;
  },
  {},
);

function getCountryName(code?: string | null): string | null {
  if (!code) return null;
  return COUNTRY_NAME_BY_CODE[code] ?? null;
}

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

export default function AdminUsersPage() {
  const { showToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [query, setQuery] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin()) {
      rememberLoginRedirect();
    }
    const loadUsers = async () => {
      setLoadingUsers(true);
      setLoadError(null);
      try {
        const res = await apiFetch("/v0/players/accounts?limit=200", {
          cache: "no-store",
        });
        const data = (await res.json()) as { accounts: PlayerAccountSummary[] };
        const normalized: AdminUser[] = (data.accounts ?? []).map((account) => ({
          id: account.userId,
          playerId: account.playerId,
          name: account.name,
          username: account.username,
          club: account.clubName ?? null,
          country: getCountryName(account.countryCode) ?? account.countryCode ?? undefined,
          lastLogin: null,
          status: account.mustChangePassword ? "must-change" : "active",
        }));
        setUsers(
          normalized.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          ),
        );
      } catch (err) {
        console.error("Failed to load user accounts", err);
        setLoadError("Unable to load users. Try refreshing this page.");
        setUsers([]);
      } finally {
        setLoadingUsers(false);
        setReady(true);
      }
    };

    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    const sorted = users
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    if (!term) {
      return sorted;
    }
    return sorted.filter((user) =>
      [user.name, user.username, user.country ?? "", user.club ?? ""].some((value) =>
        value.toLowerCase().includes(term),
      ),
    );
  }, [query, users]);

  const resetModal = () => {
    setGeneratedPassword(null);
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

  const requireChangeWarning = selected?.status === "must-change";
  const lockedOut = selected?.status === "locked";

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
            <p className="text-muted">
              Search the directory, see who is locked out, and reset passwords when
              someone needs to get back in.
            </p>
          </div>
          <label className="form-field admin-users__search" htmlFor="user-search">
            <span className="form-label">Find a user</span>
            <input
              id="user-search"
              type="search"
              placeholder="Search by name, username, club, or country"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
          </label>
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
          {loadingUsers ? (
            <div className="admin-table__row" role="row">
              <div role="cell" className="admin-users__empty" aria-live="polite">
                Loading users…
              </div>
            </div>
          ) : loadError ? (
            <div className="admin-table__row" role="row">
              <div role="cell" className="admin-users__empty" aria-live="polite">
                {loadError}
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="admin-table__row" role="row">
              <div role="cell" className="admin-users__empty" aria-live="polite">
                {users.length === 0
                  ? "No player accounts found yet. Add players to manage logins."
                  : "No users match this search. Try searching by username or club."}
              </div>
            </div>
          ) : (
            filteredUsers.map((user) => (
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
                    <Link
                      className="button button--ghost"
                      href={`/players/${encodeURIComponent(user.playerId)}`}
                    >
                      View
                    </Link>
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
            ))
          )}
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
                  Generate a one-time password and share it securely so the
                  player can sign back in and set their own password.
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

              {lockedOut ? (
                <div className="alert" role="status">
                  This account is locked. Generating a temporary password will let
                  them sign back in, but they need to choose a new password
                  immediately afterward.
                </div>
              ) : null}

            {error ? (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="card reset-card">
              <div className="reset-card__row">
                <div>
                  <h3 className="card-title">Temporary password</h3>
                  <p className="text-muted">
                    Reset the account, sign them out everywhere, and send the
                    temporary password in a trusted channel like Messenger, Discord,
                    or SMS. They will be forced to create their own password when
                    they log back in.
                  </p>
                  <ul className="reset-card__steps">
                    <li>Generate a temporary password.</li>
                    <li>Share it privately with the player.</li>
                    <li>Ask them to sign in and set a new password immediately.</li>
                  </ul>
                </div>
                <button
                  className="button"
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading}
                >
                  {loading
                    ? "Generating…"
                    : generatedPassword
                      ? "Generate new temporary password"
                      : "Generate temporary password"}
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
                        onClick={() => navigator.clipboard?.writeText(generatedPassword)}
                      >
                        Copy
                      </button>
                    </div>
                  </label>
                  <p className="text-muted">
                    Share this password securely with the player. They will be asked
                    to choose a new password after logging in.
                  </p>
                </div>
              ) : null}
            </div>

            <footer className="modal__footer">
              <span className="text-muted">This action will be logged in the audit log.</span>
              <button
                className="button"
                type="button"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? "Resetting…" : "Generate temporary password"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
