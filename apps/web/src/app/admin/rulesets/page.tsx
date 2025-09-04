'use client';

import { useEffect, useState } from "react";
import { apiFetch, isAdmin } from "../../../lib/api";

interface RuleSet {
  id: string;
  sport_id: string;
  name: string;
}

export default function AdminRuleSetsPage() {
  const [sport, setSport] = useState("");
  const [name, setName] = useState("");
  const [config, setConfig] = useState("{}");
  const [rulesets, setRuleSets] = useState<RuleSet[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!sport) return;
    try {
      const res = await apiFetch(`/v0/rulesets?sport=${sport}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setRuleSets(await res.json());
    } catch {
      setError("Failed to load rulesets.");
    }
  };

  useEffect(() => {
    if (!isAdmin()) {
      window.location.href = "/login";
    }
  }, []);

  const create = async () => {
    try {
      await apiFetch("/v0/rulesets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport_id: sport,
          name,
          config: JSON.parse(config || '{}'),
        }),
      });
      setName("");
      setConfig("{}");
      await load();
    } catch {
      setError("Failed to create ruleset.");
    }
  };

  const remove = async (id: string) => {
    await apiFetch(`/v0/rulesets/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <main className="container">
      <h1 className="heading">Admin RuleSets</h1>
      <div className="mb-4">
        <input
          className="input mr-2"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          placeholder="sport"
        />
        <button className="button mr-2" onClick={load} disabled={!sport.trim()}>
          Load
        </button>
      </div>
      <div className="mb-4">
        <input
          className="input mr-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name"
        />
        <input
          className="input mr-2"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          placeholder="config JSON"
        />
        <button
          className="button"
          onClick={create}
          disabled={!sport.trim() || !name.trim()}
        >
          Add
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <ul>
        {rulesets.map((r) => (
          <li key={r.id} className="mb-2">
            {r.name}
            <button style={{ marginLeft: 8 }} onClick={() => remove(r.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

