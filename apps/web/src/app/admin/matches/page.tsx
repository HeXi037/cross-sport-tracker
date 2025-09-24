'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, isAdmin, withAbsolutePhotoUrl } from "../../../lib/api";
import MatchParticipants from "../../../components/MatchParticipants";
import { type PlayerInfo } from "../../../components/PlayerName";
import { useLocale } from "../../../lib/LocaleContext";

type MatchRow = {
  id: string;
  sport: string;
  bestOf: number | null;
  playedAt: string | null;
  location: string | null;
};

type Participant = {
  side: string;
  playerIds: string[];
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
  participants: PlayerInfo[][];
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
    for (const p of detail.participants) p.playerIds.forEach((id) => ids.add(id));
  }
  const idToPlayer = new Map<string, PlayerInfo>();
  const idList = Array.from(ids);
  if (idList.length) {
    const r = await apiFetch(
      `/v0/players/by-ids?ids=${idList.join(",")}`,
      { cache: "no-store" }
    );
    if (r.ok) {
      const players = (await r.json()) as PlayerInfo[];
      const remaining = new Set(idList);
      const missing: string[] = [];
      players.forEach((p) => {
        if (p.id) {
          remaining.delete(p.id);
          if (p.name) {
            idToPlayer.set(p.id, withAbsolutePhotoUrl(p));
          } else {
            missing.push(p.id);
            idToPlayer.set(p.id, { id: p.id, name: "Unknown" });
          }
        }
      });
      if (remaining.size) {
        missing.push(...Array.from(remaining));
        remaining.forEach((id) =>
          idToPlayer.set(id, { id, name: "Unknown" })
        );
      }
      if (missing.length) {
        console.warn(
          `Player names missing for ids: ${missing.join(", ")}`
        );
      }
    }
  }

  return details.map(({ row, detail }) => {
    const participants = detail.participants
      .slice()
      .sort((a, b) => a.side.localeCompare(b.side))
      .map((p) =>
        p.playerIds.map((id) => idToPlayer.get(id) ?? { id, name: "Unknown" })
      );
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
  const locale = useLocale();
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    [locale],
  );

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
            <MatchParticipants
              sides={m.participants}
              className="match-participants--emphasized"
            />
            <div className="match-meta">
              {formatSummary(m.summary)}
              {m.summary ? " · " : ""}
              {m.sport} · Best of {m.bestOf ?? "—"} ·{" "}
              {m.playedAt ? dateFormatter.format(new Date(m.playedAt)) : "—"} ·{" "}
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

