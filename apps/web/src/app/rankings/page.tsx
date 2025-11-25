"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatSportName } from "../../lib/sports";

const base = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

type RatingDistribution = {
  minimum: number;
  maximum: number;
  average: number;
  histogram: Array<{ bucket: number; count: number; upperBound?: number }>;
  percentiles: Record<string, number>;
};

interface Leader {
  playerId: string;
  playerName: string;
  rating: number;
  rank: number;
  matchesPlayed?: number | null;
  winProbabilities?: Record<string, number> | null;
  rankChange?: number;
}

interface LeaderboardResponse {
  sport: string;
  leaders: Leader[];
  total: number;
  ratingDistribution?: RatingDistribution | null;
}

interface SportOption {
  id: string;
  name: string;
}

function formatWinProbability(value?: number) {
  if (typeof value !== "number") {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

function Sparkline({ distribution }: { distribution: RatingDistribution | null | undefined }) {
  if (!distribution || !distribution.histogram?.length) {
    return <p className="muted">No distribution available yet.</p>;
  }

  const maxCount = Math.max(...distribution.histogram.map((bin) => bin.count));

  return (
    <div
      role="img"
      aria-label="Rating distribution histogram"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${distribution.histogram.length}, minmax(6px, 1fr))`,
        gap: "4px",
        alignItems: "end",
        marginTop: "0.5rem",
      }}
    >
      {distribution.histogram.map((bin, idx) => (
        <div key={`bin-${idx}`} style={{ textAlign: "center" }}>
          <div
            style={{
              height: maxCount ? `${(bin.count / maxCount) * 60}px` : "2px",
              background: "linear-gradient(180deg, #71c0ff, #1c7ed6)",
              borderRadius: "4px 4px 2px 2px",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function ProbabilityBadge({ label, probability }: { label: string; probability?: number }) {
  const formatted = formatWinProbability(probability);
  const severity = probability === undefined ? "muted" : probability > 0.6 ? "positive" : probability < 0.4 ? "negative" : "neutral";
  const colors: Record<string, string> = {
    positive: "#0f9d58",
    neutral: "#f6c343",
    negative: "#db504a",
    muted: "#6c757d",
  };

  return (
    <span
      className="badge"
      aria-label={`${label}: ${formatted}`}
      style={{
        background: `${colors[severity]}22`,
        color: colors[severity],
        border: `1px solid ${colors[severity]}55`,
        padding: "0.2rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.85rem",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
      }}
    >
      <span aria-hidden="true">🎯</span>
      <span>{label}</span>
      <strong>{formatted}</strong>
    </span>
  );
}

export default function RankingsPage() {
  const [sport, setSport] = useState<string>("padel");
  const [sports, setSports] = useState<SportOption[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [masterLeaderboard, setMasterLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crossSportView, setCrossSportView] = useState(false);

  const selectId = "rankings-sport";
  const resultsHeadingId = "rankings-results";

  useEffect(() => {
    async function loadSports() {
      try {
        const res = await fetch(`${base}/v0/sports`, { cache: "force-cache" });
        if (!res.ok) {
          throw new Error("Unable to load sports catalog");
        }
        const data = (await res.json()) as SportOption[];
        const uniqueSports = Array.from(
          new Map((data || []).map((s) => [s.id, { ...s, name: formatSportName(s.id, { sportName: s.name }) }]))
        ).map(([, value]) => value);
        setSports([{ id: "master", name: "Master (all sports)" }, ...uniqueSports]);
      } catch (err) {
        console.warn(err);
        setSports([
          { id: "master", name: "Master (all sports)" },
          { id: "padel", name: "Padel" },
          { id: "bowling", name: "Bowling" },
        ]);
      }
    }

    loadSports();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = sport === "master" ? `/v0/leaderboards/master` : `/v0/leaderboards?sport=${sport}`;
      const [res, masterRes] = await Promise.all([
        fetch(`${base}${endpoint}`, { cache: "no-store" }),
        fetch(`${base}/v0/leaderboards/master`, { cache: "no-store" }),
      ]);

      if (res.ok) {
        const data = (await res.json()) as LeaderboardResponse;
        setLeaderboard(data);
        setError(null);
      } else {
        setLeaderboard(null);
        setError("Unable to load rankings. Please try again.");
      }

      if (masterRes.ok) {
        const data = (await masterRes.json()) as LeaderboardResponse;
        setMasterLeaderboard(data);
      }
    } catch (e) {
      console.error(e);
      setLeaderboard(null);
      setError("Unable to load rankings. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [sport]);

  useEffect(() => {
    load();
  }, [load]);

  const leaders = leaderboard?.leaders ?? [];
  const masterByPlayer = useMemo(() => {
    const map = new Map<string, Leader>();
    masterLeaderboard?.leaders?.forEach((l) => map.set(l.playerId, l));
    return map;
  }, [masterLeaderboard]);

  const statusMessage = loading
    ? "Loading rankings and predictive metrics…"
    : error
      ? `Error loading rankings: ${error}`
      : leaders.length
        ? `Loaded ${leaders.length} ranking ${leaders.length === 1 ? "entry" : "entries"} with predictive insights.`
        : "No rankings available for the selected sport.";

  const showCrossSportColumns = crossSportView && sport !== "master" && masterLeaderboard;
  const topCompetitorId = leaders[0]?.playerId;

  return (
    <main className="container">
      <h1 className="heading">Rankings &amp; Predictions</h1>
      <p className="sr-only" aria-live="polite">
        {statusMessage}
      </p>
      <section aria-labelledby="rankings-filter-heading" style={{ marginTop: "1.5rem" }}>
        <h2
          id="rankings-filter-heading"
          style={{
            fontSize: "1.25rem",
            margin: "0 0 0.75rem",
            color: "var(--color-heading)",
          }}
        >
          Filters &amp; view options
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
          <div className="form-field" style={{ minWidth: "220px" }}>
            <label htmlFor={selectId} className="form-label">
              Sport or cross-sport view
            </label>
            <select
              id={selectId}
              className="input"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              aria-describedby="rankings-filter-description"
            >
              {sports.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <p id="rankings-filter-description" className="muted" style={{ marginTop: "0.25rem" }}>
              Select a sport leaderboard or the master leaderboard that blends all sports.
            </p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={crossSportView}
              onChange={(e) => setCrossSportView(e.target.checked)}
              disabled={!masterLeaderboard || sport === "master"}
            />
            <span>Enable cross-sport comparison (shows master rank/rating)</span>
          </label>
        </div>
      </section>

      <section aria-labelledby="insights-heading" style={{ marginTop: "1.5rem" }}>
        <h2
          id="insights-heading"
          style={{
            fontSize: "1.25rem",
            margin: "0 0 0.5rem",
            color: "var(--color-heading)",
          }}
        >
          Rating insights &amp; predictive metrics
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "1rem",
          }}
        >
          <div className="card" style={{ padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
            <p className="muted" style={{ margin: 0 }}>
              Distribution (all players)
            </p>
            <Sparkline distribution={leaderboard?.ratingDistribution} />
            {leaderboard?.ratingDistribution && (
              <dl style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginTop: "0.75rem" }}>
                <div>
                  <dt className="muted">Min</dt>
                  <dd style={{ margin: 0 }}>{Math.round(leaderboard.ratingDistribution.minimum)}</dd>
                </div>
                <div>
                  <dt className="muted">Median</dt>
                  <dd style={{ margin: 0 }}>{Math.round(leaderboard.ratingDistribution.percentiles?.["50"] ?? leaderboard.ratingDistribution.average)}</dd>
                </div>
                <div>
                  <dt className="muted">Max</dt>
                  <dd style={{ margin: 0 }}>{Math.round(leaderboard.ratingDistribution.maximum)}</dd>
                </div>
              </dl>
            )}
          </div>
          <div className="card" style={{ padding: "1rem", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
            <p className="muted" style={{ margin: 0 }}>Predictive guidance</p>
            <ul style={{ paddingLeft: "1rem", marginTop: "0.5rem" }}>
              <li>Win-chance badges show expected outcomes versus the field leader.</li>
              <li>Cross-sport comparison reveals how the same player stacks up in the master leaderboard.</li>
            </ul>
          </div>
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
            color: "var(--color-heading)",
          }}
        >
          Results &amp; predictions
        </h2>
        {loading ? (
          <div className="table-scroll-container" style={{ marginTop: "0.5rem" }}>
            <table
              className="scoreboard-table leaderboard-table"
              aria-busy="true"
              aria-describedby={resultsHeadingId}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="table-header--sticky leaderboard-col-rank"
                  >
                    #
                  </th>
                  <th
                    scope="col"
                    className="table-header--sticky leaderboard-col-player"
                  >
                    Player
                  </th>
                  <th
                    scope="col"
                    className="table-header--sticky leaderboard-col-rating"
                  >
                    Rating
                  </th>
                  {showCrossSportColumns && (
                    <>
                      <th className="table-header--sticky">Master rank</th>
                      <th className="table-header--sticky">Master rating</th>
                    </>
                  )}
                  <th className="table-header--sticky">Win chance vs leader</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    <td className="leaderboard-col-rank">
                      <div className="skeleton" style={{ width: "12px", height: "1em" }} />
                    </td>
                    <td className="leaderboard-col-player">
                      <div className="skeleton" style={{ width: "120px", height: "1em" }} />
                    </td>
                    <td className="leaderboard-col-rating">
                      <div className="skeleton" style={{ width: "40px", height: "1em" }} />
                    </td>
                    {showCrossSportColumns && (
                      <>
                        <td>
                          <div className="skeleton" style={{ width: "50px", height: "1em" }} />
                        </td>
                        <td>
                          <div className="skeleton" style={{ width: "60px", height: "1em" }} />
                        </td>
                      </>
                    )}
                    <td>
                      <div className="skeleton" style={{ width: "80px", height: "1em" }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          <div className="table-scroll-container" style={{ marginTop: "0.5rem" }}>
            <table
              className="scoreboard-table leaderboard-table"
              aria-describedby={resultsHeadingId}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="table-header--sticky leaderboard-col-rank"
                  >
                    #
                  </th>
                  <th
                    scope="col"
                    className="table-header--sticky leaderboard-col-player"
                  >
                    Player
                  </th>
                  <th
                    scope="col"
                    className="table-header--sticky leaderboard-col-rating"
                  >
                    Rating
                  </th>
                  {showCrossSportColumns && (
                    <>
                      <th className="table-header--sticky">Master rank</th>
                      <th className="table-header--sticky">Master rating</th>
                    </>
                  )}
                  <th className="table-header--sticky">Win chance vs leader</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l) => {
                  const masterEntry = showCrossSportColumns ? masterByPlayer.get(l.playerId) : null;
                  const probability = l.winProbabilities?.[topCompetitorId ?? ""];
                  return (
                    <tr key={l.playerId}>
                      <td className="leaderboard-col-rank">{l.rank ?? "—"}</td>
                      <td className="leaderboard-col-player">{l.playerName}</td>
                      <td className="leaderboard-col-rating">{Math.round(l.rating)}</td>
                      {showCrossSportColumns && (
                        <>
                          <td>{masterEntry ? masterEntry.rank : "—"}</td>
                          <td>{masterEntry ? Math.round(masterEntry.rating) : "—"}</td>
                        </>
                      )}
                      <td>
                        <ProbabilityBadge label="Win chance vs #1" probability={probability} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
