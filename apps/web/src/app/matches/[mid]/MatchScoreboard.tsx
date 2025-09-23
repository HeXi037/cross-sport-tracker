"use client";

import type { SummaryData } from "./live-summary";

const RACKET_SPORTS = new Set([
  "padel",
  "tennis",
  "pickleball",
  "badminton",
  "table-tennis",
  "table_tennis",
]);

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return Number.isFinite(value) ? `${value}` : "—";
  return String(value);
}

function formatToPar(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : `${value}`;
}

function renderRacketSummary(summary: SummaryData) {
  if (!summary || typeof summary !== "object") return null;
  const sets = "sets" in summary ? (summary as Record<string, unknown>).sets : undefined;
  const games = "games" in summary ? (summary as Record<string, unknown>).games : undefined;
  const points = "points" in summary ? (summary as Record<string, unknown>).points : undefined;
  const setScoresRaw =
    "set_scores" in summary
      ? (summary as Record<string, unknown>).set_scores
      : undefined;
  const setScores = Array.isArray(setScoresRaw)
    ? (setScoresRaw as Array<Record<string, unknown>>)
    : [];

  if (!sets && !games && !points && setScores.length === 0) return null;

  const sides = Array.from(
    new Set([
      ...Object.keys((sets as Record<string, number>) ?? {}),
      ...Object.keys((games as Record<string, number>) ?? {}),
      ...Object.keys((points as Record<string, number>) ?? {}),
      ...setScores.flatMap((set) => Object.keys((set as Record<string, number>) ?? {})),
    ])
  ).sort();

  return (
    <table className="scoreboard-table" aria-label="Racket scoreboard">
      <thead>
        <tr>
          <th scope="col">Side</th>
          {setScores.map((_, idx) => (
            <th scope="col" key={`set-${idx}`}>{`Set ${idx + 1}`}</th>
          ))}
          {sets ? <th scope="col">Sets</th> : null}
          {games ? <th scope="col">Games</th> : null}
          {points ? <th scope="col">Points</th> : null}
        </tr>
      </thead>
      <tbody>
        {sides.map((side) => (
          <tr key={side}>
            <th scope="row">{side}</th>
            {setScores.map((set, idx) => (
              <td key={`set-${idx}`}>{formatValue((set as Record<string, unknown>)[side])}</td>
            ))}
            {sets ? <td>{formatValue((sets as Record<string, unknown>)[side])}</td> : null}
            {games ? <td>{formatValue((games as Record<string, unknown>)[side])}</td> : null}
            {points ? <td>{formatValue((points as Record<string, unknown>)[side])}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderDiscGolfSummary(summary: SummaryData) {
  if (!summary || typeof summary !== "object") return null;
  if (!("scores" in summary)) return null;

  const scores = (summary as { scores?: Record<string, Array<number | null | undefined>> }).scores;
  if (!scores) return null;

  const pars = (summary as { pars?: Array<number | null | undefined> }).pars ?? [];
  const totals = (summary as { totals?: Record<string, number | null | undefined> }).totals ?? {};
  const toPar = (summary as { toPar?: Record<string, number | null | undefined> }).toPar ?? {};
  const parTotal = (summary as { parTotal?: number | null | undefined }).parTotal;

  const holeCount = Math.max(
    pars.length,
    ...Object.values(scores).map((arr) => arr?.length ?? 0),
    0
  );
  const holes = Array.from({ length: holeCount }, (_, i) => i + 1);
  const sides = Object.keys(scores).sort();

  return (
    <table className="scoreboard-table" aria-label="Disc golf scoreboard">
      <thead>
        <tr>
          <th scope="col">Side</th>
          {holes.map((hole) => (
            <th scope="col" key={hole}>{`H${hole}`}</th>
          ))}
          <th scope="col">Total</th>
          <th scope="col">To Par</th>
        </tr>
      </thead>
      <tbody>
        {pars.length ? (
          <tr className="scoreboard-par-row">
            <th scope="row">Par</th>
            {holes.map((hole, idx) => (
              <td key={hole}>{formatValue(pars[idx])}</td>
            ))}
            <td>
              {formatValue(
                typeof parTotal === "number" && Number.isFinite(parTotal)
                  ? parTotal
                  : pars.reduce((acc: number, val) => {
                      if (typeof val === "number" && Number.isFinite(val)) {
                        return acc + val;
                      }
                      return acc;
                    }, 0)
              )}
            </td>
            <td>E</td>
          </tr>
        ) : null}
        {sides.map((side) => (
          <tr key={side}>
            <th scope="row">{side}</th>
            {holes.map((hole, idx) => (
              <td key={hole}>{formatValue(scores[side]?.[idx])}</td>
            ))}
            <td>{formatValue(totals[side])}</td>
            <td>{formatToPar(toPar[side])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function renderBowlingSummary(summary: SummaryData) {
  if (!summary || typeof summary !== "object") return null;
  if (!("frames" in summary) && !("scores" in summary)) return null;

  const frames = (summary as { frames?: Array<Array<number | null | undefined>> }).frames ?? [];
  const scores = (summary as { scores?: Array<number | null | undefined> }).scores ?? [];
  const total = (summary as { total?: number | null | undefined }).total;
  const frameCount = Math.max(frames.length, scores.length, 10);
  const frameNumbers = Array.from({ length: frameCount }, (_, i) => i + 1);

  const formatFrame = (frame: Array<number | null | undefined> | undefined) => {
    if (!frame || frame.length === 0) return "—";
    return frame.map((roll) => formatValue(roll)).join(", ");
  };

  return (
    <table className="scoreboard-table" aria-label="Bowling scoreboard">
      <thead>
        <tr>
          <th scope="col">Frame</th>
          {frameNumbers.map((num) => (
            <th scope="col" key={num}>{num}</th>
          ))}
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Rolls</th>
          {frameNumbers.map((num, idx) => (
            <td key={num}>{formatFrame(frames[idx])}</td>
          ))}
          <td>—</td>
        </tr>
        <tr>
          <th scope="row">Cumulative</th>
          {frameNumbers.map((num, idx) => (
            <td key={num}>{formatValue(scores[idx])}</td>
          ))}
          <td>{formatValue(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function renderFallback(summary: SummaryData) {
  if (!summary) {
    return <p className="scoreboard-empty">No live summary available yet.</p>;
  }

  return (
    <pre className="scoreboard-fallback" aria-label="Raw summary">
      {JSON.stringify(summary, null, 2)}
    </pre>
  );
}

export default function MatchScoreboard({
  summary,
  sport,
}: {
  summary: SummaryData;
  sport?: string | null;
  config?: unknown;
}) {
  if (sport && RACKET_SPORTS.has(sport)) {
    const racket = renderRacketSummary(summary);
    if (racket) {
      return <div className="scoreboard-wrapper">{racket}</div>;
    }
  }

  if (sport === "disc_golf") {
    const discGolf = renderDiscGolfSummary(summary);
    if (discGolf) {
      return <div className="scoreboard-wrapper">{discGolf}</div>;
    }
  }

  if (sport === "bowling") {
    const bowling = renderBowlingSummary(summary);
    if (bowling) {
      return <div className="scoreboard-wrapper">{bowling}</div>;
    }
  }

  const racketFallback = renderRacketSummary(summary);
  if (racketFallback) {
    return <div className="scoreboard-wrapper">{racketFallback}</div>;
  }

  return <div className="scoreboard-wrapper">{renderFallback(summary)}</div>;
}
