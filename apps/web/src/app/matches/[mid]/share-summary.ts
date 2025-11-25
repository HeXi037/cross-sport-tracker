export type ShareParticipant = {
  label: string;
  players: string[];
  sideKey?: string;
};

export type ShareSummaryColumn = {
  key: string;
  label: string;
};

export type ShareSummaryRow = {
  label: string;
  values: Record<string, number | null>;
  sideKey?: string;
};

export type RatingDelta = {
  player: string;
  delta?: number | null;
};

export type ShareSummaryCard = {
  title: string;
  body: string;
};

export type ShareSummaryPayload = {
  matchTitle: string;
  matchUrl: string;
  metaLines: string[];
  scoreline?: string | null;
  performerLines: string[];
  ratingDeltaLines: string[];
  cards: ShareSummaryCard[];
  shareText: string;
};

type BuildShareSummaryPayloadArgs = {
  matchTitle: string;
  matchUrl: string;
  participants: ShareParticipant[];
  summaryColumns: ShareSummaryColumn[];
  summaryRows: ShareSummaryRow[];
  meta: string[];
  status?: string | null;
  playedAt?: string | null;
  location?: string | null;
  ratingDeltas?: RatingDelta[];
};

const SUMMARY_KEY_PRIORITY = ["sets", "games", "points"];

export function buildMatchMetaLines({
  meta,
  status,
  playedAt,
  location,
}: Pick<BuildShareSummaryPayloadArgs, "meta" | "status" | "playedAt" | "location">): string[] {
  const lines: string[] = [];
  if (status) lines.push(`Status: ${status}`);
  if (playedAt) lines.push(`Date & time: ${playedAt}`);
  if (location) lines.push(`Location: ${location}`);
  meta.forEach((entry) => {
    if (!lines.includes(entry)) {
      lines.push(entry);
    }
  });
  return lines;
}

function resolvePrimarySummaryKey(
  columns: ShareSummaryColumn[],
  rows: ShareSummaryRow[]
): string | undefined {
  for (const key of SUMMARY_KEY_PRIORITY) {
    const hasValues = columns.some(
      (column) =>
        column.key === key &&
        rows.some((row) => {
          const value = row.values[key];
          return typeof value === "number" && Number.isFinite(value);
        })
    );
    if (hasValues) return key;
  }
  const fallbackColumn = columns.find((column) =>
    rows.some((row) => row.values[column.key] != null)
  );
  return fallbackColumn?.key;
}

function buildScoreline(
  primaryKey: string | undefined,
  columns: ShareSummaryColumn[],
  rows: ShareSummaryRow[]
): string | null {
  if (!primaryKey) return null;
  const columnLabel =
    columns.find((column) => column.key === primaryKey)?.label ?? primaryKey;
  const rowParts = rows
    .map((row) => {
      const value = row.values[primaryKey];
      if (typeof value === "number" && Number.isFinite(value)) {
        return `${row.label} ${value}`;
      }
      return null;
    })
    .filter((part): part is string => Boolean(part));
  if (!rowParts.length) return null;
  return `${columnLabel}: ${rowParts.join(" – ")}`;
}

function buildPerformerLines(
  primaryKey: string | undefined,
  participants: ShareParticipant[],
  rows: ShareSummaryRow[]
): string[] {
  const lines: string[] = [];
  if (!primaryKey) return lines;

  let winningRow: ShareSummaryRow | undefined;
  for (const row of rows) {
    const value = row.values[primaryKey];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (!winningRow) {
      winningRow = row;
      continue;
    }
    const winningValue = winningRow.values[primaryKey];
    if (typeof winningValue !== "number") continue;
    if (value > winningValue) {
      winningRow = row;
    }
  }

  if (!winningRow) return lines;

  const participant = participants.find(
    (entry) => entry.sideKey && entry.sideKey === winningRow?.sideKey
  );
  const playerNames = participant?.players.filter(Boolean) ?? [];
  if (playerNames.length) {
    lines.push(`${playerNames.join(" & ")} (${winningRow.label})`);
  } else {
    lines.push(winningRow.label);
  }
  return lines;
}

function buildRatingDeltaLines(
  ratingDeltas: RatingDelta[] | undefined,
  metaLines: string[]
): string[] {
  const deltas: string[] = [];
  if (ratingDeltas?.length) {
    ratingDeltas.forEach((entry) => {
      const { player, delta } = entry;
      if (!player) return;
      if (typeof delta === "number" && Number.isFinite(delta)) {
        const prefix = delta > 0 ? "+" : "";
        deltas.push(`${player}: ${prefix}${delta}`);
      } else {
        deltas.push(`${player}: —`);
      }
    });
  }

  if (!deltas.length) {
    metaLines.forEach((line) => {
      if (/rating|elo|glicko/i.test(line)) {
        deltas.push(line);
      }
    });
  }

  if (!deltas.length) {
    deltas.push("Not recorded");
  }

  return deltas;
}

function buildShareCards(
  scoreline: string | null,
  performerLines: string[],
  ratingDeltaLines: string[]
): ShareSummaryCard[] {
  const cards: ShareSummaryCard[] = [];
  cards.push({
    title: "Scoreline",
    body: scoreline ?? "No scoreline recorded",
  });
  cards.push({
    title: "Top performers",
    body: performerLines.length
      ? performerLines.join(" · ")
      : "No standout players recorded",
  });
  cards.push({
    title: "Rating deltas",
    body: ratingDeltaLines.length
      ? ratingDeltaLines.join(" · ")
      : "Rating changes not recorded",
  });
  return cards;
}

function buildShareText(
  matchTitle: string,
  matchUrl: string,
  scoreline: string | null,
  performerLines: string[],
  ratingDeltaLines: string[],
  metaLines: string[]
): string {
  const lines: string[] = [];
  const heading = scoreline ? `${matchTitle} · ${scoreline}` : matchTitle;
  lines.push(heading);
  if (performerLines.length) {
    lines.push(`Top performers: ${performerLines.join("; ")}`);
  } else {
    lines.push("Top performers: Not recorded");
  }

  lines.push(
    ratingDeltaLines.length
      ? `Rating deltas: ${ratingDeltaLines.join("; ")}`
      : "Rating deltas: Not recorded"
  );
  metaLines.forEach((line) => lines.push(line));
  lines.push(matchUrl);
  return lines.filter(Boolean).join("\n");
}

export function buildShareSummaryPayload(
  args: BuildShareSummaryPayloadArgs
): ShareSummaryPayload {
  const metaLines = buildMatchMetaLines(args);
  const primaryKey = resolvePrimarySummaryKey(args.summaryColumns, args.summaryRows);
  const scoreline = buildScoreline(primaryKey, args.summaryColumns, args.summaryRows);
  const performerLines = buildPerformerLines(
    primaryKey,
    args.participants,
    args.summaryRows
  );
  const ratingDeltaLines = buildRatingDeltaLines(args.ratingDeltas, metaLines);
  const cards = buildShareCards(scoreline, performerLines, ratingDeltaLines);
  const shareText = buildShareText(
    args.matchTitle,
    args.matchUrl,
    scoreline,
    performerLines,
    ratingDeltaLines,
    metaLines
  );

  return {
    matchTitle: args.matchTitle,
    matchUrl: args.matchUrl,
    metaLines,
    scoreline,
    performerLines,
    ratingDeltaLines,
    cards,
    shareText,
  };
}

export function buildPrefilledShareLinks(payload: ShareSummaryPayload) {
  const encodedText = encodeURIComponent(payload.shareText);
  const encodedUrl = encodeURIComponent(payload.matchUrl);
  return {
    x: `https://twitter.com/intent/tweet?text=${encodedText}`,
    whatsapp: `https://wa.me/?text=${encodedText}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    sms: `sms:?&body=${encodedText}`,
  };
}
