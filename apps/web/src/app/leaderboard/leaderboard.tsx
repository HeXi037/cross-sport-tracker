"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Identifier type for players
export type ID = string | number;

// Basic leaderboard entry returned by the API
export type Leader = {
  rank: number;
  playerId: ID;
  playerName: string;
  rating?: number | null;
  setsWon?: number;
  setsLost?: number;
  sport?: string;
};

const SPORTS = ["padel", "badminton", "table-tennis"] as const;

type Props = {
  sport: string;
};

export default function Leaderboard({ sport }: Props) {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (sport === "all") {
          const results = await Promise.all(
            SPORTS.map(async (s) => {
              const res = await fetch(
                `/api/v0/leaderboards?sport=${encodeURIComponent(s)}`
              );
              if (!res.ok) return [] as Leader[];
              const data = await res.json();
              const arr = Array.isArray(data) ? data : data.leaders ?? [];
              return (arr as Leader[]).map((l) => ({ ...l, sport: s }));
            })
          );
          const combined = results
            .flat()
            .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
            .map((l, i) => ({ ...l, rank: i + 1 }));
          if (!cancelled) setLeaders(combined);
        } else if (sport === "master") {
          const res = await fetch(`/api/v0/leaderboards/master`);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const arr = Array.isArray(data) ? data : data.leaders ?? [];
          if (!cancelled) setLeaders(arr as Leader[]);
        } else {
          const res = await fetch(
            `/api/v0/leaderboards?sport=${encodeURIComponent(sport)}`
          );
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          const data = await res.json();
          const arr = Array.isArray(data) ? data : data.leaders ?? [];
          if (!cancelled) setLeaders(arr as Leader[]);
        }
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

  const TableHeader = () => (
    <thead>
      <tr>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>#</th>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>Player</th>
        {sport === "all" && (
          <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>Sport</th>
        )}
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>Rating</th>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>W</th>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>L</th>
        <th style={{ textAlign: "left", padding: "4px 16px 4px 0" }}>Matches</th>
        <th style={{ textAlign: "left", padding: "4px 0" }}>Win%</th>
      </tr>
    </thead>
  );

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
        <nav style={{ display: "flex", gap: "0.5rem", fontSize: "0.9rem" }}>
          <Link
            href="/leaderboard/master"
            style={{ textDecoration: sport === "master" ? "underline" : "none" }}
          >
            All sports
          </Link>
          <Link
            href="/leaderboard"
            style={{ textDecoration: sport === "all" ? "underline" : "none" }}
          >
            Best of all sports
          </Link>
          {SPORTS.map((s) => (
            <Link
              key={s}
              href={`/leaderboard/${s}`}
              style={{ textDecoration: sport === s ? "underline" : "none" }}
            >
              {s}
            </Link>
          ))}
        </nav>
      </header>

      {loading ? (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            marginTop: "1rem",
            fontSize: "0.9rem",
          }}
        >
          <TableHeader />
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={`skeleton-${i}`} style={{ borderTop: "1px solid #ccc" }}>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "12px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "120px", height: "1em" }} />
                </td>
                {sport === "all" && (
                  <td style={{ padding: "4px 16px 4px 0" }}>
                    <div className="skeleton" style={{ width: "80px", height: "1em" }} />
                  </td>
                )}
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "20px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "20px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 16px 4px 0" }}>
                  <div className="skeleton" style={{ width: "30px", height: "1em" }} />
                </td>
                <td style={{ padding: "4px 0" }}>
                  <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <TableHeader />
          <tbody>
            {leaders.map((row) => {
              const won = row.setsWon ?? 0;
              const lost = row.setsLost ?? 0;
              const total = won + lost;
              const winPct = total > 0 ? Math.round((won / total) * 100) : null;
              return (
                <tr
                  key={`${row.rank}-${row.playerId}-${row.sport ?? ""}`}
                  style={{ borderTop: "1px solid #ccc" }}
                >
                  <td style={{ padding: "4px 16px 4px 0" }}>{row.rank}</td>
                  <td style={{ padding: "4px 16px 4px 0" }}>{row.playerName}</td>
                  {sport === "all" && (
                    <td style={{ padding: "4px 16px 4px 0" }}>{row.sport}</td>
                  )}
                  <td style={{ padding: "4px 16px 4px 0" }}>
                    {row.rating != null ? Math.round(row.rating) : "—"}
                  </td>
                  <td style={{ padding: "4px 16px 4px 0" }}>{row.setsWon ?? "—"}</td>
                  <td style={{ padding: "4px 16px 4px 0" }}>{row.setsLost ?? "—"}</td>
                  <td style={{ padding: "4px 16px 4px 0" }}>{total || "—"}</td>
                  <td style={{ padding: "4px 0" }}>
                    {winPct != null ? `${winPct}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}

export const ALL_SPORTS = "all";
export { SPORTS };
