"use client";

import type {
  BowlingSummaryPlayer,
  SummaryData,
} from "../../../lib/match-summary";
import {
  getNumericEntries,
  isRacketSport,
  normalizeSportId,
  isRecord,
} from "../../../lib/match-summary";

const BOWLING_FRAME_COUNT = 10;

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

function renderRacketSummary(
  summary: SummaryData,
  { hideIfEmpty = false }: { hideIfEmpty?: boolean } = {}
) {
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

  const setEntries = getNumericEntries(sets);
  const gameEntries = getNumericEntries(games);
  const pointEntries = getNumericEntries(points);
  const hasSetScores = setScores.length > 0;
  const showSetsColumn = setEntries.length > 0;
  const showGamesColumn = gameEntries.length > 0;
  const showPointsColumn = pointEntries.length > 0;

  const shouldRender =
    hasSetScores ||
    showGamesColumn ||
    showPointsColumn ||
    (!hideIfEmpty && showSetsColumn);

  if (!shouldRender) return null;

  const setsRecord = isRecord(sets) ? (sets as Record<string, unknown>) : undefined;
  const gamesRecord = isRecord(games) ? (games as Record<string, unknown>) : undefined;
  const pointsRecord = isRecord(points)
    ? (points as Record<string, unknown>)
    : undefined;

  const sides = Array.from(
    new Set([
      ...Object.keys((setsRecord as Record<string, number>) ?? {}),
      ...Object.keys((gamesRecord as Record<string, number>) ?? {}),
      ...Object.keys((pointsRecord as Record<string, number>) ?? {}),
      ...setScores.flatMap((set) => Object.keys((set as Record<string, number>) ?? {})),
    ])
  ).sort();

  return (
    <table className="scoreboard-table" aria-label="Racket scoreboard">
      <caption className="sr-only">
        Set, game, and point totals for each side
      </caption>
      <thead>
        <tr>
          <th scope="col">Side</th>
          {setScores.map((_, idx) => (
            <th scope="col" key={`set-${idx}`}>{`Set ${idx + 1}`}</th>
          ))}
          {showSetsColumn ? <th scope="col">Sets</th> : null}
          {showGamesColumn ? <th scope="col">Games</th> : null}
          {showPointsColumn ? <th scope="col">Points</th> : null}
        </tr>
      </thead>
      <tbody>
        {sides.map((side) => (
          <tr key={side}>
            <th scope="row">{side}</th>
            {setScores.map((set, idx) => (
              <td key={`set-${idx}`}>{formatValue((set as Record<string, unknown>)[side])}</td>
            ))}
            {showSetsColumn ? (
              <td>{formatValue(setsRecord?.[side])}</td>
            ) : null}
            {showGamesColumn ? (
              <td>{formatValue(gamesRecord?.[side])}</td>
            ) : null}
            {showPointsColumn ? (
              <td>{formatValue(pointsRecord?.[side])}</td>
            ) : null}
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
      <caption className="sr-only">Hole-by-hole disc golf scores by side</caption>
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

  const formatFrame = (frame: Array<number | null | undefined> | undefined) => {
    if (!frame || frame.length === 0) return "—";
    return frame.map((roll) => formatValue(roll)).join(", ");
  };

  const maybePlayers = (summary as { players?: unknown }).players;
  const players: BowlingSummaryPlayer[] = Array.isArray(maybePlayers)
    ? maybePlayers.filter(
        (player): player is BowlingSummaryPlayer =>
          !!player && typeof player === "object"
      )
    : [];

  if (players.length) {
    const frameCount = Math.max(
      BOWLING_FRAME_COUNT,
      ...players.map((player) => player.frames?.length ?? 0),
      ...players.map((player) => player.scores?.length ?? 0)
    );
    const frameNumbers = Array.from({ length: frameCount }, (_, i) => i + 1);

    return (
      <table className="scoreboard-table" aria-label="Bowling scoreboard">
        <caption className="sr-only">Frame scores for each bowler</caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            {frameNumbers.map((num) => (
              <th scope="col" key={num}>
                {num}
              </th>
            ))}
            <th scope="col">Total</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, idx) => {
            const label =
              player.playerName ??
              player.side ??
              `Player ${String.fromCharCode(65 + idx)}`;
            return (
              <tr key={player.playerId ?? player.side ?? idx}>
                <th scope="row">{label}</th>
                {frameNumbers.map((num, frameIdx) => (
                  <td key={`${label}-${num}`}>
                    <div className="bowling-frame-cell">
                      <span className="bowling-frame-rolls">
                        {formatFrame(player.frames?.[frameIdx])}
                      </span>
                      <span className="bowling-frame-total">
                        {formatValue(player.scores?.[frameIdx])}
                      </span>
                    </div>
                  </td>
                ))}
                <td>
                  <span className="bowling-total">
                    {formatValue(player.total)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  if (!("frames" in summary) && !("scores" in summary)) return null;

  const frames = (summary as { frames?: Array<Array<number | null | undefined>> }).frames ?? [];
  const scores = (summary as { scores?: Array<number | null | undefined> }).scores ?? [];
  const total = (summary as { total?: number | null | undefined }).total;
  const frameCount = Math.max(frames.length, scores.length, BOWLING_FRAME_COUNT);
  const frameNumbers = Array.from({ length: frameCount }, (_, i) => i + 1);

  return (
    <table className="scoreboard-table" aria-label="Bowling scoreboard">
      <caption className="sr-only">Frame-by-frame bowling summary</caption>
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
  isFinished,
}: {
  summary: SummaryData;
  sport?: string | null;
  config?: unknown;
  isFinished?: boolean;
}) {
  const sportId = normalizeSportId(sport);

  if (isRacketSport(sport)) {
    const racket = renderRacketSummary(summary, {
      hideIfEmpty: Boolean(isFinished),
    });
    if (racket) {
      return <div className="scoreboard-wrapper">{racket}</div>;
    }
  }

  if (sportId === "disc_golf") {
    const discGolf = renderDiscGolfSummary(summary);
    if (discGolf) {
      return <div className="scoreboard-wrapper">{discGolf}</div>;
    }
  }

  if (sportId === "bowling") {
    const bowling = renderBowlingSummary(summary);
    if (bowling) {
      return <div className="scoreboard-wrapper">{bowling}</div>;
    }
  }

  const racketFallback = renderRacketSummary(summary, {
    hideIfEmpty: Boolean(isFinished),
  });
  if (racketFallback) {
    return <div className="scoreboard-wrapper">{racketFallback}</div>;
  }

  return <div className="scoreboard-wrapper">{renderFallback(summary)}</div>;
}
