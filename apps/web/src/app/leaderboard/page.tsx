"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ID = string | number;

type Leader = {
  rank: number;
  player: { id: ID; name: string };
  rating?: number | null;
  wins?: number;
  losses?: number;
};

const SPORTS = ["padel", "badminton", "table-tennis"] as const;

export default function LeaderboardPage() {
  const [sport, setSport] = useState<(typeof SPORTS)[number]>("padel");
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/v0/leaderboards?sport=${encodeURIComponent(sport)}`
        );
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = (await res.json()) as Leader[];
        if (!cancelled) setLeaders(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) {
          setLeaders([]);
          setError("No leaderboard data yet.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sport]);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <div className="text-sm">
        <Link href="/matches" className="underline underline-offset-2">
          ← Back to matches
        </Link>
      </div>

      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Leaderboards</h1>
        <label className="text-sm">
          Sport{" "}
          <select
            value={sport}
            onChange={(e) =>
              setSport(e.target.value as (typeof SPORTS)[number])
            }
            className="border rounded px-2 py-1"
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </header>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : leaders.length === 0 ? (
        <p className="text-sm text-gray-500">{error ?? "No data."}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1 pr-4">#</th>
              <th className="py-1 pr-4">Player</th>
              <th className="py-1 pr-4">Rating</th>
              <th className="py-1 pr-4">W</th>
              <th className="py-1">L</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((row) => (
              <tr key={`${row.rank}-${row.player.id}`} className="border-t">
                <td className="py-1 pr-4 tabular-nums">{row.rank}</td>
                <td className="py-1 pr-4">{row.player.name}</td>
                <td className="py-1 pr-4 tabular-nums">
                  {row.rating ?? "—"}
                </td>
                <td className="py-1 pr-4 tabular-nums">{row.wins ?? "—"}</td>
                <td className="py-1 tabular-nums">{row.losses ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
