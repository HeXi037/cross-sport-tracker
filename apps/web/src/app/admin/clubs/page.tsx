'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch, isAdmin, type ApiError } from '../../../lib/api';
import { rememberLoginRedirect } from '../../../lib/loginRedirect';

type ClubRecord = {
  id: string;
  name: string;
};

function normalizeClubs(clubs: ClubRecord[]): ClubRecord[] {
  return clubs
    .map((club) => ({ id: club.id.trim(), name: club.name.trim() }))
    .filter((club) => club.id.length > 0 && club.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function errorMessageFrom(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const { parsedMessage } = err as Partial<ApiError>;
    if (typeof parsedMessage === 'string' && parsedMessage.trim().length > 0) {
      return parsedMessage.trim();
    }
    const { message } = err as Partial<Error>;
    if (typeof message === 'string' && message.trim().length > 0) {
      return message.trim();
    }
  }
  return fallback;
}

export default function AdminClubsPage() {
  const [clubs, setClubs] = useState<ClubRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newClubId, setNewClubId] = useState('');
  const [newClubName, setNewClubName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadClubs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v0/clubs', { cache: 'no-store' });
      const data = (await res.json()) as ClubRecord[];
      setClubs(normalizeClubs(data));
      setError(null);
    } catch (err) {
      setError(errorMessageFrom(err, 'Failed to load clubs.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin()) {
      rememberLoginRedirect();
      window.location.href = '/login';
      return;
    }
    void loadClubs();
  }, [loadClubs]);

  const sortedClubs = useMemo(() => normalizeClubs(clubs), [clubs]);

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const id = newClubId.trim();
      const name = newClubName.trim();

      if (!id || !name) {
        setError('Club ID and name are required.');
        setSuccess(null);
        return;
      }
      if (/\s/.test(id)) {
        setError('Club ID cannot contain whitespace.');
        setSuccess(null);
        return;
      }

      setCreating(true);
      setError(null);
      setSuccess(null);

      try {
        await apiFetch('/v0/clubs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, name }),
        });
        setNewClubId('');
        setNewClubName('');
        await loadClubs();
        setSuccess('Club created.');
      } catch (err) {
        setError(errorMessageFrom(err, 'Failed to create club.'));
      } finally {
        setCreating(false);
      }
    },
    [loadClubs, newClubId, newClubName]
  );

  return (
    <main className="container">
      <h1 className="heading">Admin Clubs</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      {loading && (
        <div role="status" aria-live="polite" aria-atomic="true">
          <p>Loading clubs...</p>
        </div>
      )}

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>Create new club</h2>
        <form
          aria-label="Create club"
          onSubmit={handleCreate}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
        >
          <label htmlFor="new-club-id" style={{ flex: '1 1 160px' }}>
            Club ID
            <input
              id="new-club-id"
              value={newClubId}
              onChange={(event) => setNewClubId(event.target.value)}
              required
              disabled={creating}
            />
          </label>
          <label htmlFor="new-club-name" style={{ flex: '2 1 240px' }}>
            Club name
            <input
              id="new-club-name"
              value={newClubName}
              onChange={(event) => setNewClubName(event.target.value)}
              required
              disabled={creating}
            />
          </label>
          <button type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create club'}
          </button>
        </form>
        <p style={{ marginTop: 12, color: '#4b5563' }}>
          Use a short, unique identifier (letters, numbers, or dashes) for the club ID.
        </p>
      </section>

      <section className="card">
        <h2>Existing clubs</h2>
        {sortedClubs.length === 0 ? (
          <p>No clubs have been created yet.</p>
        ) : (
          <ul style={{ display: 'grid', gap: 12, padding: 0, listStyle: 'none' }}>
            {sortedClubs.map((club) => (
              <li
                key={club.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{club.name}</div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>{club.id}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
