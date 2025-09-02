"use client";
import { useEffect, useState } from "react";

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

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${base}/v0/leaderboards?sport=${sport}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLeaders((data.leaders || []) as Leader[]);
      } else {
        setLeaders([]);
      }
    } catch (e) {
      console.error(e);
      setLeaders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  return (
    <main className="container">
      <h1 className="heading">Rankings</h1>
      <label>
        Sport:
        <select
          className="input"
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          style={{ marginLeft: "0.5rem" }}
        >
          {sports.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {loading ? (
        <table
          style={{
            marginTop: "1rem",
            borderCollapse: "collapse",
            width: "100%",
          }}
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
      ) : (
        <table
          style={{
            marginTop: "1rem",
            borderCollapse: "collapse",
            width: "100%",
          }}
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
    </main>
  );
}
