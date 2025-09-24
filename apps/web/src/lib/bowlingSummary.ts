export interface BowlingSummaryResult {
  frames: number[][];
  frameScores: number[];
  total: number;
}

const FRAME_COUNT = 10;

function parsePins(
  value: string,
  context: string,
  rollNumber: number
): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${context}: enter roll ${rollNumber}.`);
  }
  const pins = Number(trimmed);
  if (!Number.isFinite(pins) || !Number.isInteger(pins)) {
    throw new Error(`${context}: roll ${rollNumber} must be a whole number.`);
  }
  if (pins < 0 || pins > 10) {
    throw new Error(
      `${context}: roll ${rollNumber} must be between 0 and 10 pins.`
    );
  }
  return pins;
}

function ensureNoExtraRolls(
  values: string[],
  startIndex: number,
  context: string,
  limit: number
) {
  const extra = values.slice(startIndex).find((val) => val.trim() !== "");
  if (extra !== undefined) {
    throw new Error(
      `${context}: only ${limit} roll${limit === 1 ? "" : "s"} allowed in this frame.`
    );
  }
}

function parseRegularFrame(
  frame: string[] | undefined,
  frameIndex: number,
  playerLabel: string
): number[] {
  const values = frame ?? [];
  const frameNumber = frameIndex + 1;
  const context = `${playerLabel} – Frame ${frameNumber}`;
  const firstValue = values[0]?.trim() ?? "";
  if (!firstValue) {
    throw new Error(`${context}: enter roll 1.`);
  }
  const first = parsePins(firstValue, context, 1);
  ensureNoExtraRolls(values, 2, context, 2);
  if (first === 10) {
    const secondValue = values[1]?.trim() ?? "";
    if (secondValue) {
      throw new Error(`${context}: leave roll 2 empty after a strike.`);
    }
    return [first];
  }
  const secondValue = values[1]?.trim() ?? "";
  if (!secondValue) {
    throw new Error(`${context}: enter roll 2.`);
  }
  const second = parsePins(secondValue, context, 2);
  if (first + second > 10) {
    throw new Error(`${context}: rolls 1 and 2 cannot exceed 10 pins.`);
  }
  return [first, second];
}

function parseFinalFrame(
  frame: string[] | undefined,
  playerLabel: string
): number[] {
  const values = frame ?? [];
  const context = `${playerLabel} – Frame ${FRAME_COUNT}`;
  const firstValue = values[0]?.trim() ?? "";
  if (!firstValue) {
    throw new Error(`${context}: enter roll 1.`);
  }
  const first = parsePins(firstValue, context, 1);
  const secondValue = values[1]?.trim() ?? "";
  if (!secondValue) {
    throw new Error(`${context}: enter roll 2.`);
  }
  const second = parsePins(secondValue, context, 2);
  const thirdValue = values[2]?.trim() ?? "";
  ensureNoExtraRolls(values, 3, context, 3);
  const sumFirstTwo = first + second;
  if (first === 10) {
    if (!thirdValue) {
      throw new Error(`${context}: enter roll 3 after a strike.`);
    }
    const third = parsePins(thirdValue, context, 3);
    if (second !== 10 && second + third > 10) {
      throw new Error(
        `${context}: rolls 2 and 3 cannot exceed 10 pins unless roll 2 is a strike.`
      );
    }
    return [first, second, third];
  }
  if (sumFirstTwo > 10) {
    throw new Error(`${context}: rolls 1 and 2 cannot exceed 10 pins.`);
  }
  if (sumFirstTwo === 10) {
    if (!thirdValue) {
      throw new Error(`${context}: enter roll 3 after a spare.`);
    }
    const third = parsePins(thirdValue, context, 3);
    return [first, second, third];
  }
  if (thirdValue) {
    throw new Error(
      `${context}: roll 3 is only available after a strike or spare.`
    );
  }
  return [first, second];
}

function frameScore(
  frames: number[][],
  index: number,
  tenthBonus: boolean
): number {
  const frame = frames[index] ?? [];
  if (index < FRAME_COUNT - 1) {
    const first = frame[0] ?? 0;
    if (first === 10) {
      const nextRolls: number[] = [];
      for (let i = index + 1; i < frames.length; i += 1) {
        nextRolls.push(...frames[i]);
        if (nextRolls.length >= 2) break;
      }
      return 10 + (nextRolls[0] ?? 0) + (nextRolls[1] ?? 0);
    }
    const second = frame[1] ?? 0;
    if (first + second === 10) {
      const nextFrame = frames[index + 1] ?? [];
      return 10 + (nextFrame[0] ?? 0);
    }
    return first + second;
  }
  if (!tenthBonus) {
    return (frame[0] ?? 0) + (frame[1] ?? 0);
  }
  const first = frame[0] ?? 0;
  const second = frame[1] ?? 0;
  if (first === 10) {
    return 10 + (frame[1] ?? 0) + (frame[2] ?? 0);
  }
  if (first + second === 10) {
    return 10 + (frame[2] ?? 0);
  }
  return first + second;
}

export function summarizeBowlingInput(
  frameInputs: string[][],
  options: { playerLabel: string; tenthFrameBonus?: boolean }
): BowlingSummaryResult {
  const frames: number[][] = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    if (i === FRAME_COUNT - 1) {
      frames.push(parseFinalFrame(frameInputs[i], options.playerLabel));
    } else {
      frames.push(parseRegularFrame(frameInputs[i], i, options.playerLabel));
    }
  }
  const tenthBonus = options.tenthFrameBonus ?? true;
  const frameScores: number[] = [];
  let total = 0;
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const score = frameScore(frames, i, tenthBonus);
    frameScores.push(score);
    total += score;
  }
  return { frames, frameScores, total };
}
