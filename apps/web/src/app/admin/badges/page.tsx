'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch, isAdmin } from '../../../lib/api';
import { rememberLoginRedirect } from '../../../lib/loginRedirect';

type BadgeApi = {
  id: string;
  name: string;
  icon?: string | null;
};

type BadgeRow = {
  id: string;
  name: string;
  icon: string;
};

function normalizeBadge(badge: BadgeApi): BadgeRow {
  return {
    id: badge.id,
    name: badge.name,
    icon: badge.icon ?? '',
  };
}

export default function AdminBadgesPage() {
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [newBadgeName, setNewBadgeName] = useState('');
  const [newBadgeIcon, setNewBadgeIcon] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadBadges = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/v0/badges', { cache: 'no-store' });
      const data = (await res.json()) as BadgeApi[];
      const normalized = data
        .map(normalizeBadge)
        .sort((a, b) => a.name.localeCompare(b.name));
      setBadges(normalized);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('Failed to load badges.');
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
    loadBadges();
  }, [loadBadges]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newBadgeName.trim()) {
      setError('Badge name is required.');
      setSuccess(null);
      return;
    }
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: newBadgeName.trim(),
        icon: newBadgeIcon.trim() ? newBadgeIcon.trim() : null,
      };
      await apiFetch('/v0/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setNewBadgeName('');
      setNewBadgeIcon('');
      await loadBadges();
      setSuccess('Badge created.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create badge.';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const updateBadgeField = (id: string, field: 'name' | 'icon', value: string) => {
    setBadges((prev) =>
      prev.map((badge) =>
        badge.id === id
          ? {
              ...badge,
              [field]: value,
            }
          : badge
      )
    );
  };

  const handleUpdate = async (id: string) => {
    const badge = badges.find((b) => b.id === id);
    if (!badge) return;
    if (!badge.name.trim()) {
      setError('Badge name is required.');
      setSuccess(null);
      return;
    }

    setSaving((prev) => ({ ...prev, [id]: true }));
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        name: badge.name.trim(),
        icon: badge.icon.trim() ? badge.icon.trim() : null,
      };
      await apiFetch(`/v0/badges/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await loadBadges();
      setSuccess('Badge updated.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update badge.';
      setError(message);
    } finally {
      setSaving((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting((prev) => ({ ...prev, [id]: true }));
    setError(null);
    setSuccess(null);

    try {
      await apiFetch(`/v0/badges/${id}`, { method: 'DELETE' });
      await loadBadges();
      setSuccess('Badge deleted.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete badge.';
      setError(message);
    } finally {
      setDeleting((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <main className="container">
      <h1 className="heading">Admin Badges</h1>
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
          <p>Loading badges...</p>
        </div>
      )}

      <section className="card" style={{ marginBottom: 24 }}>
        <h2>Create new badge</h2>
        <form
          aria-label="Create badge"
          onSubmit={handleCreate}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
        >
          <label htmlFor="new-badge-name" style={{ flex: '1 1 200px' }}>
            Name
            <input
              id="new-badge-name"
              value={newBadgeName}
              onChange={(event) => setNewBadgeName(event.target.value)}
              required
              disabled={creating}
            />
          </label>
          <label htmlFor="new-badge-icon" style={{ flex: '1 1 200px' }}>
            Icon
            <input
              id="new-badge-icon"
              value={newBadgeIcon}
              onChange={(event) => setNewBadgeIcon(event.target.value)}
              disabled={creating}
            />
          </label>
          <button type="submit" disabled={creating} style={{ alignSelf: 'flex-end' }}>
            {creating ? 'Creating…' : 'Create badge'}
          </button>
        </form>
      </section>

      <section>
        <h2>Existing badges</h2>
        {badges.length === 0 ? (
          <p>No badges yet.</p>
        ) : (
          <ul className="match-list">
            {badges.map((badge) => {
              const savingBadge = saving[badge.id];
              const deletingBadge = deleting[badge.id];
              return (
                <li
                  key={badge.id}
                  className="card"
                  style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}
                >
                  <label htmlFor={`badge-name-${badge.id}`} style={{ flex: '1 1 200px' }}>
                    Name
                    <input
                      id={`badge-name-${badge.id}`}
                      value={badge.name}
                      onChange={(event) =>
                        updateBadgeField(badge.id, 'name', event.target.value)
                      }
                    />
                  </label>
                  <label htmlFor={`badge-icon-${badge.id}`} style={{ flex: '1 1 200px' }}>
                    Icon
                    <input
                      id={`badge-icon-${badge.id}`}
                      value={badge.icon}
                      onChange={(event) =>
                        updateBadgeField(badge.id, 'icon', event.target.value)
                      }
                    />
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleUpdate(badge.id)}
                      disabled={savingBadge || deletingBadge}
                    >
                      {savingBadge ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(badge.id)}
                      disabled={savingBadge || deletingBadge}
                    >
                      {deletingBadge ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
