"use client";
import { useEffect, useState } from "react";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const sports = ["padel", "bowling"];

interface Leader {
  rank: number;
  playerId: string;
  playerName: string;
  rating: number;
  rankChange: number;
  sets: number;
  setsWon: number;
  setsLost: number;
  setDiff: number;
}

export default function LeaderboardPage() {
  const [sport, setSport] = useState<string>("padel");
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${base}/v0/leaderboards?sport=${sport}`, {
        cache: "no-store",
      });
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
      <h1 className="heading">Leaderboard</h1>
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
        <p>Loading...</p>
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
              <th
                style={{
                  border: "1px solid #ccc",
                  padding: "0.5rem",
                  textAlign: "left",
                }}
              >
                Change
              </th>
              <th
                style={{
                  border: "1px solid #ccc",
                  padding: "0.5rem",
                  textAlign: "left",
                }}
              >
                Sets
              </th>
              <th
                style={{
                  border: "1px solid #ccc",
                  padding: "0.5rem",
                  textAlign: "left",
                }}
              >
                W
              </th>
              <th
                style={{
                  border: "1px solid #ccc",
                  padding: "0.5rem",
                  textAlign: "left",
                }}
              >
                L
              </th>
              <th
                style={{
                  border: "1px solid #ccc",
                  padding: "0.5rem",
                  textAlign: "left",
                }}
              >
                +/-
              </th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((l) => (
              <tr key={l.playerId}>
                <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                  {l.rank}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                  {l.playerName}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                  {l.rating}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                  {l.rankChange > 0 ? `+${l.rankChange}` : l.rankChange}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                  {l.sets}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                  {l.setsWon}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                  {l.setsLost}
                </td>
                <td style={{ border: "1px solid #ccc", padding: "0.5rem" }}>
                  {l.setDiff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

