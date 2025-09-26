"use client";
import { useCallback, useEffect, useState } from "react";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const sports = ["padel", "bowling"];

interface Leader {
  playerId: string;
  playerName: string;
  rating: number;
}

export default function RankingsPage() {
  const [sport, setSport] = useState<string>("padel");
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${base}/v0/leaderboards?sport=${sport}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLeaders((data.leaders || []) as Leader[]);
        setError(null);
      } else {
        setLeaders([]);
        setError("Unable to load rankings. Please try again.");
      }
    } catch (e) {
      console.error(e);
      setLeaders([]);
      setError("Unable to load rankings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    load();
  }, [load]);

  const selectId = "rankings-sport";
  const resultsHeadingId = "rankings-results";
  const statusMessage = loading
    ? "Loading rankings…"
    : error
      ? `Error loading rankings: ${error}`
      : leaders.length
        ? `Loaded ${leaders.length} ranking ${leaders.length === 1 ? "entry" : "entries"}.`
        : "No rankings available for the selected sport.";

  return (
    <main className="container">
      <h1 className="heading">Rankings</h1>
      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>
      <section aria-labelledby="rankings-filter-heading" style={{ marginTop: "1.5rem" }}>
        <h2
          id="rankings-filter-heading"
          style={{
            fontSize: "1.25rem",
            margin: "0 0 0.75rem",
            color: "var(--color-accent-red)",
          }}
        >
          Filters
        </h2>
        <div className="form-field" style={{ maxWidth: "240px" }}>
          <label htmlFor={selectId} className="form-label">
            Sport
          </label>
          <select
            id={selectId}
            className="input"
            value={sport}
            onChange={(e) => setSport(e.target.value)}
          >
            {sports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section
        aria-labelledby={resultsHeadingId}
        style={{ marginTop: "2rem" }}
      >
        <h2
          id={resultsHeadingId}
          style={{
            fontSize: "1.25rem",
            margin: "0 0 0.75rem",
            color: "var(--color-accent-red)",
          }}
        >
          Results
        </h2>
        {loading ? (
          <table
            style={{
              marginTop: "0.5rem",
              borderCollapse: "collapse",
              width: "100%",
            }}
            aria-busy="true"
            aria-describedby={resultsHeadingId}
          >
            <thead>
              <tr>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "0.5rem",
                    textAlign: "left",
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "0.5rem",
                    textAlign: "left",
                  }}
                >
                  Player
                </th>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "0.5rem",
                    textAlign: "left",
                  }}
                >
                  Rating
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                    <div className="skeleton" style={{ width: "12px", height: "1em" }} />
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                    <div className="skeleton" style={{ width: "120px", height: "1em" }} />
                  </td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                    <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : error ? (
          <div
            role="alert"
            aria-live="polite"
            style={{
              marginTop: "0.5rem",
              padding: "1rem",
              borderRadius: "8px",
              border: "1px solid #f3c5c5",
              background: "#fff5f5",
              color: "#8a1c1c",
            }}
          >
            {error}
          </div>
        ) : leaders.length === 0 ? (
          <p>No rankings available for this sport.</p>
        ) : (
          <table
            style={{
              marginTop: "0.5rem",
              borderCollapse: "collapse",
              width: "100%",
            }}
            aria-describedby={resultsHeadingId}
          >
            <thead>
              <tr>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "0.5rem",
                    textAlign: "left",
                  }}
                >
                  #
                </th>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "0.5rem",
                    textAlign: "left",
                  }}
                >
                  Player
                </th>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "0.5rem",
                    textAlign: "left",
                  }}
                >
                  Rating
                </th>
              </tr>
            </thead>
            <tbody>
              {leaders.map((l, i) => (
                <tr key={l.playerId}>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>{i + 1}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>{l.playerName}</td>
                  <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>{Math.round(l.rating)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
