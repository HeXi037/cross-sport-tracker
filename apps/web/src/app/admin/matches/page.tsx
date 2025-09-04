'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, isAdmin } from "../../../lib/api";

type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
};

type Participant = {
  side: string;
  playerIds?: string[];
};

type MatchDetail = {
  participants: Participant[];
  summary?: {
    sets?: Record<string, number>;
    games?: Record<string, number>;
    points?: Record<string, number>;
  } | null;
};

type EnrichedMatch = MatchRow & {
  participants: string[][];
  summary?: MatchDetail["summary"];
};

async function getMatches(limit: number, offset: number): Promise<MatchRow[]> {
  const r = await apiFetch(`/v0/matches?limit=${limit}&offset=${offset}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Failed to load matches: ${r.status}`);
  return (await r.json()) as MatchRow[];
}

async function enrichMatches(rows: MatchRow[]): Promise<EnrichedMatch[]> {
  const details = await Promise.all(
    rows.map(async (m) => {
      const r = await apiFetch(`/v0/matches/${m.id}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Failed to load match ${m.id}`);
      const d = (await r.json()) as MatchDetail;
      return { row: m, detail: d };
    })
  );

  const ids = new Set<string>();
  for (const { detail } of details) {
    for (const p of detail.participants) (p.playerIds ?? []).forEach((id) => ids.add(id));
  }
  const idToName = new Map<string, string>();
  const idList = Array.from(ids);
  if (idList.length) {
    const r = await apiFetch(
      `/v0/players/by-ids?ids=${idList.join(",")}`,
      { cache: "no-store" }
    );
    if (r.ok) {
      const players = (await r.json()) as {
        id?: string;
        name?: string;
        playerId?: string;
        playerName?: string;
      }[];
      players.forEach((p) => {
        const pid = p.id ?? p.playerId;
        const pname = p.name ?? p.playerName;
        if (pid && pname) idToName.set(pid, pname);
      });
    }
  }

  return details.map(({ row, detail }) => {
    const participants = detail.participants
      .slice()
      .sort((a, b) => a.side.localeCompare(b.side))
      .map((p) => {
        const ids = p.playerIds ?? [];
        const names = ids.map((id) => idToName.get(id) ?? id);
        return names.length ? names : [p.side];
      });
    return { ...row, participants, summary: detail.summary };
  });
}

function formatSummary(s?: MatchDetail["summary"]): string {
  if (!s) return "";
  const render = (scores: Record<string, number>, label: string) => {
    const parts = Object.keys(scores)
      .sort()
      .map((k) => scores[k]);
    return `${label} ${parts.join("-")}`;
  };
  if (s.sets) return render(s.sets, "Sets");
  if (s.games) return render(s.games, "Games");
  if (s.points) return render(s.points, "Points");
  return "";
}

export default function AdminMatchesPage() {
  const [matches, setMatches] = useState<EnrichedMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await getMatches(100, 0);
      rows.sort((a, b) => {
        if (!a.playedAt) return 1;
        if (!b.playedAt) return -1;
        return new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime();
      });
      const enriched = await enrichMatches(rows);
      setMatches(enriched);
      setError(null);
    } catch {
      setError("Failed to load matches.");
    }
  }, []);

  useEffect(() => {
    if (!isAdmin()) {
      window.location.href = "/login";
      return;
    }
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    await apiFetch(`/v0/matches/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <main className="container">
      <h1 className="heading">Admin Matches</h1>
      {error && <p className="error">{error}</p>}
      <ul className="match-list">
        {matches.map((m) => (
          <li key={m.id} className="card match-item">
            <div style={{ fontWeight: 500 }}>
              {m.participants.map((names) => names.join(" & ")).join(" vs ")}
            </div>
            <div className="match-meta">
              {formatSummary(m.summary)}
              {m.summary ? " · " : ""}
              {m.sport} · Best of {m.bestOf ?? "—"} ·{" "}
              {m.playedAt ? new Date(m.playedAt).toLocaleDateString() : "—"} ·{" "}
              {m.location ?? "—"}
            </div>
            <div>
              <Link href={`/matches/${m.id}`}>More info</Link>
              <button
                onClick={() => handleDelete(m.id)}
                style={{ marginLeft: 8 }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

