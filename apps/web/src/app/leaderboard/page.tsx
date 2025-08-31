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
    <main className="container">
      <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        <Link href="/matches" style={{ textDecoration: "underline" }}>
          ← Back to matches
        </Link>
      </div>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <h1 className="heading">Leaderboards</h1>
        <label style={{ fontSize: "0.9rem" }}>
          Sport{" "}
          <select
            value={sport}
            onChange={(e) =>
              setSport(e.target.value as (typeof SPORTS)[number])
            }
            style={{ marginLeft: "0.25rem" }}
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
        <p>Loading...</p>
      ) : leaders.length === 0 ? (
        <p>{error ?? "No data."}</p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "1rem",
            fontSize: "0.9rem",
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>#</th>
              <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>
                Player
              </th>
              <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>
                Rating
              </th>
              <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>W</th>
              <th style={{ textAlign: "left", padding: "4px 0" }}>L</th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((row) => (
              <tr
                key={`${row.rank}-${row.player.id}`}
                style={{ borderTop: "1px solid #ccc" }}
              >
                <td style={{ padding: "4px 16px 4px 0" }}>{row.rank}</td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  {row.player.name}
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  {row.rating ?? "—"}
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  {row.wins ?? "—"}
                </td>
                <td style={{ padding: "4px 0" }}>
                  {row.losses ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
