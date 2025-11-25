'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch, isAdmin } from '../../../lib/api';
import { rememberLoginRedirect } from '../../../lib/loginRedirect';

type BadgeApi = {
  id: string;
  name: string;
  icon?: string | null;
  category?: string;
  rarity?: string;
  description?: string | null;
  sport_id?: string | null;
  rule?: unknown;
};

type BadgeRow = {
  id: string;
  name: string;
  icon: string;
  category: string;
  rarity: string;
  description: string;
  sportId: string;
  ruleText: string;
};

function normalizeBadge(badge: BadgeApi): BadgeRow {
  return {
    id: badge.id,
    name: badge.name,
    icon: badge.icon ?? '',
    category: badge.category ?? 'special',
    rarity: badge.rarity ?? 'common',
    description: badge.description ?? '',
    sportId: badge.sport_id ?? '',
    ruleText: badge.rule ? JSON.stringify(badge.rule) : '',
  };
}

export default function AdminBadgesPage() {
  const [badges, setBadges] = useState<BadgeRow[]>([]);
  const [newBadgeName, setNewBadgeName] = useState('');
  const [newBadgeIcon, setNewBadgeIcon] = useState('');
  const [newBadgeCategory, setNewBadgeCategory] = useState('special');
  const [newBadgeRarity, setNewBadgeRarity] = useState('common');
  const [newBadgeDescription, setNewBadgeDescription] = useState('');
  const [newBadgeSport, setNewBadgeSport] = useState('');
  const [newBadgeRule, setNewBadgeRule] = useState('');
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

  const parseRuleText = (value: string): object | null | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      setError('Rule must be valid JSON.');
      setSuccess(null);
      return undefined;
    }
  };

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
      const rule = parseRuleText(newBadgeRule);
      if (rule === undefined) {
        setCreating(false);
        return;
      }
      const payload = {
        name: newBadgeName.trim(),
        icon: newBadgeIcon.trim() ? newBadgeIcon.trim() : null,
        category: newBadgeCategory,
        rarity: newBadgeRarity,
        description: newBadgeDescription.trim() || null,
        sport_id: newBadgeSport.trim() || null,
        rule,
      };
      await apiFetch('/v0/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setNewBadgeName('');
      setNewBadgeIcon('');
      setNewBadgeCategory('special');
      setNewBadgeRarity('common');
      setNewBadgeDescription('');
      setNewBadgeSport('');
      setNewBadgeRule('');
      await loadBadges();
      setSuccess('Badge created.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create badge.';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const updateBadgeField = (
    id: string,
    field: 'name' | 'icon' | 'category' | 'rarity' | 'description' | 'sportId' | 'ruleText',
    value: string,
  ) => {
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
      const rule = parseRuleText(badge.ruleText);
      if (rule === undefined) {
        setSaving((prev) => ({ ...prev, [id]: false }));
        return;
      }
      const payload = {
        name: badge.name.trim(),
        icon: badge.icon.trim() ? badge.icon.trim() : null,
        category: badge.category,
        rarity: badge.rarity,
        description: badge.description.trim() || null,
        sport_id: badge.sportId.trim() || null,
        rule,
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
          <label htmlFor="new-badge-category" style={{ flex: '1 1 200px' }}>
            Category
            <select
              id="new-badge-category"
              value={newBadgeCategory}
              onChange={(event) => setNewBadgeCategory(event.target.value)}
              disabled={creating}
            >
              <option value="skill">Skill</option>
              <option value="milestone">Milestone</option>
              <option value="special">Special</option>
            </select>
          </label>
          <label htmlFor="new-badge-rarity" style={{ flex: '1 1 200px' }}>
            Rarity
            <select
              id="new-badge-rarity"
              value={newBadgeRarity}
              onChange={(event) => setNewBadgeRarity(event.target.value)}
              disabled={creating}
            >
              <option value="common">Common</option>
              <option value="rare">Rare</option>
              <option value="epic">Epic</option>
              <option value="legendary">Legendary</option>
            </select>
          </label>
          <label htmlFor="new-badge-description" style={{ flex: '1 1 300px' }}>
            Description
            <textarea
              id="new-badge-description"
              value={newBadgeDescription}
              onChange={(event) => setNewBadgeDescription(event.target.value)}
              rows={2}
              disabled={creating}
            />
          </label>
          <label htmlFor="new-badge-sport" style={{ flex: '1 1 200px' }}>
            Sport (optional)
            <input
              id="new-badge-sport"
              value={newBadgeSport}
              onChange={(event) => setNewBadgeSport(event.target.value)}
              disabled={creating}
              placeholder="e.g. padel"
            />
          </label>
          <label htmlFor="new-badge-rule" style={{ flex: '1 1 300px' }}>
            Rule JSON (optional)
            <textarea
              id="new-badge-rule"
              value={newBadgeRule}
              onChange={(event) => setNewBadgeRule(event.target.value)}
              rows={2}
              disabled={creating}
              placeholder='{"type":"rating_at_least","sport_id":"padel","threshold":800}'
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
                  <label htmlFor={`badge-category-${badge.id}`} style={{ flex: '1 1 200px' }}>
                    Category
                    <select
                      id={`badge-category-${badge.id}`}
                      value={badge.category}
                      onChange={(event) =>
                        updateBadgeField(badge.id, 'category', event.target.value)
                      }
                    >
                      <option value="skill">Skill</option>
                      <option value="milestone">Milestone</option>
                      <option value="special">Special</option>
                    </select>
                  </label>
                  <label htmlFor={`badge-rarity-${badge.id}`} style={{ flex: '1 1 200px' }}>
                    Rarity
                    <select
                      id={`badge-rarity-${badge.id}`}
                      value={badge.rarity}
                      onChange={(event) =>
                        updateBadgeField(badge.id, 'rarity', event.target.value)
                      }
                    >
                      <option value="common">Common</option>
                      <option value="rare">Rare</option>
                      <option value="epic">Epic</option>
                      <option value="legendary">Legendary</option>
                    </select>
                  </label>
                  <label htmlFor={`badge-description-${badge.id}`} style={{ flex: '1 1 300px' }}>
                    Description
                    <textarea
                      id={`badge-description-${badge.id}`}
                      value={badge.description}
                      onChange={(event) =>
                        updateBadgeField(badge.id, 'description', event.target.value)
                      }
                      rows={2}
                    />
                  </label>
                  <label htmlFor={`badge-sport-${badge.id}`} style={{ flex: '1 1 200px' }}>
                    Sport
                    <input
                      id={`badge-sport-${badge.id}`}
                      value={badge.sportId}
                      onChange={(event) =>
                        updateBadgeField(badge.id, 'sportId', event.target.value)
                      }
                    />
                  </label>
                  <label htmlFor={`badge-rule-${badge.id}`} style={{ flex: '1 1 300px' }}>
                    Rule JSON
                    <textarea
                      id={`badge-rule-${badge.id}`}
                      value={badge.ruleText}
                      onChange={(event) =>
                        updateBadgeField(badge.id, 'ruleText', event.target.value)
                      }
                      rows={2}
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
