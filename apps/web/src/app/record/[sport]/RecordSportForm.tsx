"use client";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, type ApiError } from "../../../lib/api";
import ClubSelect from "../../../components/ClubSelect";
import { invalidateMatchesCache } from "../../../lib/useApiSWR";
import { invalidateNotificationsCache } from "../../../lib/useNotifications";
import { useLocale } from "../../../lib/LocaleContext";
import { rememberLoginRedirect } from "../../../lib/loginRedirect";
import { useSessionSnapshot } from "../../../lib/useSessionSnapshot";
import {
  getDateExample,
  getDatePlaceholder,
  getTimeExample,
  usesTwentyFourHourClock,
} from "../../../lib/i18n";
import { buildPlayedAtISOString } from "../../../lib/datetime";
import {
  summarizeBowlingInput,
  previewBowlingInput,
  type BowlingSummaryResult,
} from "../../../lib/bowlingSummary";
import { getSportCopy } from "../../../lib/sportCopy";
import { usePreferredTimeFormat } from "../../../lib/usePreferredTimeFormat";

interface Player {
  id: string;
  name: string;
  club_id?: string | null;
}

interface IdMap {
  a1: string;
  a2: string;
  b1: string;
  b2: string;
}

type StoredPairing = {
  teamA: string[];
  teamB: string[];
  count: number;
};

type PlayerPreferences = {
  lastSelection: IdMap | null;
  recentPlayers: string[];
  favouritePairings: StoredPairing[];
};

const BOWLING_FRAME_COUNT = 10;
const MAX_BOWLING_PLAYERS = 6;

const DUPLICATE_PLAYERS_ERROR_CODE = "match_duplicate_players";
const DUPLICATE_PLAYERS_REGEX = /duplicate players:\s*(.+)/i;

const PADEL_AMERICANO_STORAGE_KEY = "record:padel-americano:defaults";
const PLAYER_PREFERENCES_STORAGE_KEY = "record:players:preferences";
const DEFAULT_PADEL_AMERICANO_TARGET = "32";

function parseDuplicatePlayerNames(message?: string | null): string[] {
  if (typeof message !== "string") {
    return [];
  }
  const match = message.match(DUPLICATE_PLAYERS_REGEX);
  if (!match) {
    return [];
  }
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

type BowlingFrames = string[][];

type GameScore = {
  a: string;
  b: string;
};

function createGameScoreRows(count: number): GameScore[] {
  return Array.from({ length: count }, () => ({ a: "", b: "" }));
}

function parseNonNegativeInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < 0) {
    return null;
  }
  return parsed;
}

export type GameSeriesConfig = {
  maxGames: number;
  gamesNeededOptions: number[];
  invalidSeriesMessage: string;
  maxPointsPerGame?: number;
  allowScoresBeyondMax?: boolean;
  requiredWinningMargin?: number;
  overtimeCap?: number;
};

type NormalizedGameSeries = {
  sets: [number, number][];
  winsA: number;
  winsB: number;
  targetWins: number;
};

export function normalizeGameSeries(
  rows: GameScore[],
  config: GameSeriesConfig,
): NormalizedGameSeries {
  const trimmed: [number, number][] = [];
  let encounteredBlankAfterScores = false;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const trimmedA = row?.a?.trim() ?? "";
    const trimmedB = row?.b?.trim() ?? "";
    const hasA = trimmedA !== "";
    const hasB = trimmedB !== "";

    if (!hasA && !hasB) {
      if (trimmed.length > 0) {
        encounteredBlankAfterScores = true;
      }
      continue;
    }

    if (!hasA || !hasB) {
      throw new Error(`Enter points for both teams in game ${i + 1}.`);
    }

    if (encounteredBlankAfterScores) {
      throw new Error(
        `Game ${i + 1} has a score after an empty game. Enter games in order without gaps.`,
      );
    }

    const valueA = Number(trimmedA);
    const valueB = Number(trimmedB);

    if (!Number.isFinite(valueA) || !Number.isInteger(valueA)) {
      throw new Error(`Game ${i + 1} points must be a whole number.`);
    }
    if (!Number.isFinite(valueB) || !Number.isInteger(valueB)) {
      throw new Error(`Game ${i + 1} points must be a whole number.`);
    }

    if (valueA < 0 || valueB < 0) {
      throw new Error(`Game ${i + 1} points must be zero or higher.`);
    }

    const maxPoints = config.maxPointsPerGame;
    const allowsScoresBeyondMax = Boolean(config.allowScoresBeyondMax);
    const exceedsMax =
      typeof maxPoints === "number" &&
      (valueA > maxPoints || valueB > maxPoints);

    if (exceedsMax && !allowsScoresBeyondMax) {
      throw new Error(
        `Game ${i + 1} points must be between 0 and ${config.maxPointsPerGame}.`,
      );
    }

    if (valueA === valueB) {
      throw new Error(`Game ${i + 1} cannot be tied.`);
    }

    const winningPoints = Math.max(valueA, valueB);
    const losingPoints = Math.min(valueA, valueB);

    if (
      exceedsMax &&
      allowsScoresBeyondMax &&
      typeof maxPoints === "number"
    ) {
      const minPointsForOvertime = maxPoints - 1;
      if (
        winningPoints < minPointsForOvertime ||
        losingPoints < minPointsForOvertime
      ) {
        throw new Error(
          `Game ${i + 1} scores above ${maxPoints} require both teams to reach at least ${minPointsForOvertime} points first.`,
        );
      }
    }

    if (
      typeof config.requiredWinningMargin === "number" &&
      winningPoints - losingPoints < config.requiredWinningMargin
    ) {
      throw new Error(
        `Game ${i + 1} must be won by at least ${config.requiredWinningMargin} points.`,
      );
    }

    if (
      allowsScoresBeyondMax &&
      typeof config.overtimeCap === "number" &&
      winningPoints > config.overtimeCap
    ) {
      throw new Error(
        `Game ${i + 1} scores cannot exceed ${config.overtimeCap}.`,
      );
    }

    trimmed.push([valueA, valueB]);
  }

  if (trimmed.length === 0) {
    throw new Error("Enter the points for at least one game.");
  }

  if (trimmed.length > config.maxGames) {
    throw new Error(`Too many games entered. Maximum allowed is ${config.maxGames}.`);
  }

  let winsA = 0;
  let winsB = 0;
  const reachedAt = new Map<number, number | null | "invalid">();
  for (const option of config.gamesNeededOptions) {
    reachedAt.set(option, null);
  }

  for (let i = 0; i < trimmed.length; i += 1) {
    const [aScore, bScore] = trimmed[i];

    if (aScore > bScore) {
      winsA += 1;
    } else {
      winsB += 1;
    }

    for (const option of config.gamesNeededOptions) {
      const previous = reachedAt.get(option);
      if (previous === "invalid") {
        continue;
      }

      const currentWinnerWins = Math.max(winsA, winsB);
      const currentLoserWins = Math.min(winsA, winsB);

      if (currentLoserWins > option - 1 || currentWinnerWins > option) {
        reachedAt.set(option, "invalid");
        continue;
      }

      if (typeof previous === "number" && previous < i + 1) {
        reachedAt.set(option, "invalid");
        continue;
      }

      if (previous === null && currentWinnerWins === option) {
        reachedAt.set(option, i + 1);
      }
    }
  }

  if (winsA === winsB) {
    throw new Error("Enter enough games for one side to win the match.");
  }

  const winnerWins = Math.max(winsA, winsB);
  const loserWins = Math.min(winsA, winsB);

  const validTarget = config.gamesNeededOptions.find((option) => {
    const reached = reachedAt.get(option);
    if (reached === null || reached === "invalid") {
      return false;
    }
    if (typeof reached !== "number" || !Number.isFinite(reached) || reached <= 0) {
      return false;
    }
    if (winnerWins !== option) {
      return false;
    }
    if (loserWins > option - 1) {
      return false;
    }
    const maxGamesForOption = option * 2 - 1;
    if (trimmed.length > maxGamesForOption) {
      return false;
    }
    return reached === trimmed.length;
  });

  if (!validTarget) {
    throw new Error(config.invalidSeriesMessage);
  }

  return { sets: trimmed, winsA, winsB, targetWins: validTarget };
}

function getBowlingInputKey(
  entryIndex: number,
  frameIndex: number,
  rollIndex: number,
): string {
  return `${entryIndex}-${frameIndex}-${rollIndex}`;
}

function isBowlingRollEnabled(
  frames: BowlingFrames,
  frameIndex: number,
  rollIndex: number,
): boolean {
  const frame = frames[frameIndex];
  if (!frame) {
    return false;
  }

  if (rollIndex === 0) {
    return true;
  }

  const isFinalFrame = frameIndex === BOWLING_FRAME_COUNT - 1;
  const first = frame[0]?.trim() ?? "";

  if (!first) {
    return false;
  }

  if (!isFinalFrame) {
    if (rollIndex === 1) {
      return first !== "10";
    }
    return false;
  }

  if (rollIndex === 1) {
    return true;
  }

  if (rollIndex === 2) {
    const second = frame[1]?.trim() ?? "";
    if (!second) {
      return false;
    }
    const firstPins = Number(first);
    const secondPins = Number(second);
    if (!Number.isFinite(firstPins) || !Number.isFinite(secondPins)) {
      return false;
    }
    if (firstPins === 10) {
      return true;
    }
    return firstPins + secondPins === 10;
  }

  return false;
}

function getBowlingFramePinSum(frame: string[]): number {
  return frame.reduce((total, roll) => {
    const trimmed = roll?.trim() ?? "";
    if (!trimmed) {
      return total;
    }
    const pins = Number(trimmed);
    if (!Number.isFinite(pins)) {
      return total;
    }
    return total + pins;
  }, 0);
}

function findNextBowlingInputKey(
  entries: BowlingEntry[],
  entryIndex: number,
  frameIndex: number,
  rollIndex: number,
): string | null {
  for (let e = entryIndex; e < entries.length; e += 1) {
    const frames = entries[e]?.frames ?? [];
    for (
      let f = e === entryIndex ? frameIndex : 0;
      f < frames.length;
      f += 1
    ) {
      const frame = frames[f];
      if (!frame) {
        continue;
      }
      const rollStart = e === entryIndex && f === frameIndex ? rollIndex + 1 : 0;
      for (let r = rollStart; r < frame.length; r += 1) {
        if (isBowlingRollEnabled(frames, f, r)) {
          return getBowlingInputKey(e, f, r);
        }
      }
    }
  }
  return null;
}

function findPreviousBowlingInputKey(
  entries: BowlingEntry[],
  entryIndex: number,
  frameIndex: number,
  rollIndex: number,
): string | null {
  for (let e = entryIndex; e >= 0; e -= 1) {
    const frames = entries[e]?.frames ?? [];
    for (
      let f = e === entryIndex ? frameIndex : frames.length - 1;
      f >= 0;
      f -= 1
    ) {
      const frame = frames[f];
      if (!frame) {
        continue;
      }
      const initialRollIndex =
        e === entryIndex && f === frameIndex ? rollIndex - 1 : frame.length - 1;
      for (let r = initialRollIndex; r >= 0; r -= 1) {
        if (isBowlingRollEnabled(frames, f, r)) {
          return getBowlingInputKey(e, f, r);
        }
      }
    }
  }
  return null;
}

function findFrameStartKey(
  entries: BowlingEntry[],
  entryIndex: number,
  frameIndex: number,
): string | null {
  const entry = entries[entryIndex];
  if (!entry) {
    return null;
  }
  const frame = entry.frames[frameIndex];
  if (!frame) {
    return null;
  }
  for (let r = 0; r < frame.length; r += 1) {
    if (isBowlingRollEnabled(entry.frames, frameIndex, r)) {
      return getBowlingInputKey(entryIndex, frameIndex, r);
    }
  }
  return null;
}

function findBowlingInputKeyInFrame(
  entry: BowlingEntry | undefined,
  entryIndex: number,
  frameIndex: number,
  preferredRollIndex: number,
): string | null {
  if (!entry) {
    return null;
  }
  const frames = entry.frames ?? [];
  const frame = frames[frameIndex];
  if (!frame) {
    return null;
  }
  if (
    preferredRollIndex < frame.length &&
    isBowlingRollEnabled(frames, frameIndex, preferredRollIndex)
  ) {
    return getBowlingInputKey(entryIndex, frameIndex, preferredRollIndex);
  }
  for (let r = 0; r < frame.length; r += 1) {
    if (isBowlingRollEnabled(frames, frameIndex, r)) {
      return getBowlingInputKey(entryIndex, frameIndex, r);
    }
  }
  return null;
}

function findVerticalBowlingInputKey(
  entries: BowlingEntry[],
  entryIndex: number,
  frameIndex: number,
  rollIndex: number,
  direction: 1 | -1,
): string | null {
  for (
    let e = entryIndex + direction;
    e >= 0 && e < entries.length;
    e += direction
  ) {
    const key = findBowlingInputKeyInFrame(
      entries[e],
      e,
      frameIndex,
      rollIndex,
    );
    if (key) {
      return key;
    }
  }
  return null;
}

function findFirstEnabledKey(entries: BowlingEntry[], startEntry: number): string | null {
  for (let e = startEntry; e < entries.length; e += 1) {
    const frames = entries[e]?.frames ?? [];
    for (let f = 0; f < frames.length; f += 1) {
      const frame = frames[f];
      if (!frame) {
        continue;
      }
      for (let r = 0; r < frame.length; r += 1) {
        if (isBowlingRollEnabled(frames, f, r)) {
          return getBowlingInputKey(e, f, r);
        }
      }
    }
  }
  return null;
}

interface BowlingEntry {
  playerId: string;
  frames: BowlingFrames;
}

interface RecordSportFormProps {
  sportId: string;
}

function createEmptyBowlingFrames(): BowlingFrames {
  return Array.from({ length: BOWLING_FRAME_COUNT }, (_, idx) =>
    idx === BOWLING_FRAME_COUNT - 1 ? ["", "", ""] : ["", ""]
  );
}

function getBowlingPlayerLabel(
  entry: BowlingEntry,
  index: number,
  players: Player[],
): string {
  const player = players.find((p) => p.id === entry.playerId);
  return player?.name?.trim() ? player.name : `Player ${index + 1}`;
}

function sanitizeBowlingRollInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.toLowerCase() === "x") {
    return "10";
  }
  if (trimmed === "-" || trimmed === "–" || trimmed === "—") {
    return "0";
  }
  const pins = Number(trimmed);
  if (!Number.isFinite(pins) || !Number.isInteger(pins)) {
    return null;
  }
  if (pins < 0 || pins > 10) {
    return null;
  }
  return String(pins);
}

function invalidRollMessage(
  playerLabel: string,
  frameIndex: number,
  rollIndex: number,
): string {
  return `${playerLabel} – Frame ${frameIndex + 1}: roll ${
    rollIndex + 1
  } must be a whole number between 0 and 10 pins.`;
}

function validateRegularFrame(
  frame: string[],
  frameIndex: number,
  playerLabel: string,
): string | null {
  const context = `${playerLabel} – Frame ${frameIndex + 1}`;
  const firstRaw = frame[0]?.trim() ?? "";
  if (!firstRaw) {
    return null;
  }
  const first = Number(firstRaw);
  if (!Number.isFinite(first) || !Number.isInteger(first)) {
    return `${context}: roll 1 must be a whole number.`;
  }
  if (first < 0 || first > 10) {
    return `${context}: roll 1 must be between 0 and 10 pins.`;
  }
  const secondRaw = frame[1]?.trim() ?? "";
  if (first === 10) {
    if (secondRaw) {
      return `${context}: leave roll 2 empty after a strike.`;
    }
    return null;
  }
  if (!secondRaw) {
    return null;
  }
  const second = Number(secondRaw);
  if (!Number.isFinite(second) || !Number.isInteger(second)) {
    return `${context}: roll 2 must be a whole number.`;
  }
  if (second < 0 || second > 10) {
    return `${context}: roll 2 must be between 0 and 10 pins.`;
  }
  if (first + second > 10) {
    return `${context}: rolls 1 and 2 cannot exceed 10 pins.`;
  }
  return null;
}

function validateFinalFrame(frame: string[], playerLabel: string): string | null {
  const context = `${playerLabel} – Frame ${BOWLING_FRAME_COUNT}`;
  const firstRaw = frame[0]?.trim() ?? "";
  if (!firstRaw) {
    return null;
  }
  const first = Number(firstRaw);
  if (!Number.isFinite(first) || !Number.isInteger(first)) {
    return `${context}: roll 1 must be a whole number.`;
  }
  if (first < 0 || first > 10) {
    return `${context}: roll 1 must be between 0 and 10 pins.`;
  }
  const secondRaw = frame[1]?.trim() ?? "";
  if (!secondRaw) {
    return null;
  }
  const second = Number(secondRaw);
  if (!Number.isFinite(second) || !Number.isInteger(second)) {
    return `${context}: roll 2 must be a whole number.`;
  }
  if (second < 0 || second > 10) {
    return `${context}: roll 2 must be between 0 and 10 pins.`;
  }
  if (first !== 10 && first + second > 10) {
    return `${context}: rolls 1 and 2 cannot exceed 10 pins.`;
  }
  const thirdRaw = frame[2]?.trim() ?? "";
  const earnedThird = first === 10 || first + second === 10;
  if (!thirdRaw) {
    return null;
  }
  if (!earnedThird) {
    return `${context}: roll 3 is only available after a strike or spare.`;
  }
  const third = Number(thirdRaw);
  if (!Number.isFinite(third) || !Number.isInteger(third)) {
    return `${context}: roll 3 must be a whole number.`;
  }
  if (third < 0 || third > 10) {
    return `${context}: roll 3 must be between 0 and 10 pins.`;
  }
  if (first === 10 && second !== 10 && second + third > 10) {
    return `${context}: rolls 2 and 3 cannot exceed 10 pins unless roll 2 is a strike.`;
  }
  return null;
}

function validateBowlingFrameInput(
  frames: BowlingFrames,
  frameIndex: number,
  playerLabel: string,
): string | null {
  if (frameIndex === BOWLING_FRAME_COUNT - 1) {
    return validateFinalFrame(frames[frameIndex] ?? [], playerLabel);
  }
  return validateRegularFrame(frames[frameIndex] ?? [], frameIndex, playerLabel);
}

export default function RecordSportForm({ sportId }: RecordSportFormProps) {
  const router = useRouter();
  const session = useSessionSnapshot();
  const loggedIn = session.isLoggedIn;
  const isAnonymous = !loggedIn;
  const sport = sportId;
  const isStandardPadel = sport === "padel";
  const isPadel = sport === "padel" || sport === "padel_americano";
  const isPadelAmericano = sport === "padel_americano";
  const isBadminton = sport === "badminton";
  const isPickleball = sport === "pickleball";
  const isTableTennis = sport === "table_tennis";
  const supportsSinglesOrDoubles =
    isStandardPadel || isPickleball || isTableTennis || isBadminton;
  const isBowling = sport === "bowling";
  const gameSeriesConfig = useMemo<GameSeriesConfig | null>(() => {
    if (isBadminton) {
      return {
        maxGames: 3,
        gamesNeededOptions: [2],
        invalidSeriesMessage:
          "Badminton matches finish when a side wins two games (best of three). Adjust the game scores.",
        maxPointsPerGame: 21,
        allowScoresBeyondMax: true,
        requiredWinningMargin: 2,
        overtimeCap: 30,
      };
    }
    if (isPickleball) {
      return {
        maxGames: 3,
        gamesNeededOptions: [2],
        invalidSeriesMessage:
          "Pickleball matches finish when a side wins two games (best of three). Adjust the game scores.",
        maxPointsPerGame: 11,
        allowScoresBeyondMax: true,
        requiredWinningMargin: 2,
      };
    }
    if (isTableTennis) {
      return {
        maxGames: 5,
        gamesNeededOptions: [2, 3],
        invalidSeriesMessage:
          "Table tennis matches finish when a side wins two or three games. Adjust the game scores.",
      };
    }
    return null;
  }, [isBadminton, isPickleball, isTableTennis]);
  const usesGameSeries = Boolean(gameSeriesConfig);
  const maxGames = gameSeriesConfig?.maxGames ?? 0;

  const [players, setPlayers] = useState<Player[]>([]);
  const [ids, setIds] = useState<IdMap>({ a1: "", a2: "", b1: "", b2: "" });
  const [playerSearch, setPlayerSearch] = useState<IdMap>({
    a1: "",
    a2: "",
    b1: "",
    b2: "",
  });
  const [playerPreferences, setPlayerPreferences] = useState<PlayerPreferences>({
    lastSelection: null,
    recentPlayers: [],
    favouritePairings: [],
  });
  const [selectedPairingKey, setSelectedPairingKey] = useState<string>("");
  const [bowlingEntries, setBowlingEntries] = useState<BowlingEntry[]>([
    { playerId: "", frames: createEmptyBowlingFrames() },
  ]);
  const [bowlingValidationErrors, setBowlingValidationErrors] = useState<
    (string | null)[]
  >([null]);
  const [
    bowlingFieldErrors,
    setBowlingFieldErrors,
  ] = useState<(null | { frameIndex: number; rollIndex: number | null })[]>([
    null,
  ]);
  const [
    bowlingTouchedEntries,
    setBowlingTouchedEntries,
  ] = useState<boolean[]>([false]);
  const bowlingMaxReached =
    bowlingEntries.length >= MAX_BOWLING_PLAYERS;
  const bowlingMaxHintId = useId();
  const duplicatePlayersHintId = useId();
  const bowlingInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingBowlingFocusRef = useRef<string | null>(null);
  const hasLoadedPadelAmericanoDefaults = useRef(false);
  const [scoreA, setScoreA] = useState("0");
  const [scoreB, setScoreB] = useState("0");
  const [padelAmericanoTarget, setPadelAmericanoTarget] = useState(
    DEFAULT_PADEL_AMERICANO_TARGET,
  );
  const [error, setError] = useState<string | null>(null);
  const [duplicatePlayerNames, setDuplicatePlayerNames] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [isFriendly, setIsFriendly] = useState(false);
  const [clubId, setClubId] = useState("");
  const [doubles, setDoubles] = useState(isPadel);
  const [submitting, setSubmitting] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [gameScores, setGameScores] = useState<GameScore[]>(() =>
    createGameScoreRows(maxGames),
  );
  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((player) => {
      if (player?.id) {
        map.set(player.id, player.name);
      }
    });
    return map;
  }, [players]);
  const duplicateNameSet = useMemo(
    () =>
      new Set(
        duplicatePlayerNames
          .map((name) => name.trim().toLowerCase())
          .filter((name) => name.length > 0),
      ),
    [duplicatePlayerNames],
  );
  const duplicateHintActive = duplicatePlayerNames.length > 0;
  const isDuplicateSelection = useCallback(
    (playerId: string) => {
      if (!playerId) {
        return false;
      }
      const name = playerNameById.get(playerId);
      if (!name) {
        return false;
      }
      return duplicateNameSet.has(name.trim().toLowerCase());
    },
    [playerNameById, duplicateNameSet],
  );
  const locale = useLocale();
  const preferredTimeFormat = usePreferredTimeFormat();
  const commonT = useTranslations("Common");
  const recordT = useTranslations("Record");
  const dateExample = useMemo(() => getDateExample(locale), [locale]);
  const datePlaceholder = useMemo(() => getDatePlaceholder(locale), [locale]);
  const uses24HourTime = useMemo(
    () => usesTwentyFourHourClock(locale, preferredTimeFormat),
    [locale, preferredTimeFormat],
  );
  const timeExample = useMemo(
    () => getTimeExample(locale, preferredTimeFormat),
    [locale, preferredTimeFormat],
  );
  const sportCopy = useMemo(
    () => getSportCopy(sport, locale),
    [locale, sport],
  );
  const scorePlaceholderA =
    sportCopy.scorePlaceholderA ?? "Team A whole-number score (e.g. 0)";
  const scorePlaceholderB =
    sportCopy.scorePlaceholderB ?? "Team B whole-number score (e.g. 0)";
  const gameScorePlaceholder =
    sportCopy.gameScorePlaceholder ?? "Whole-number points (e.g. 11)";
  const gameScoreMax =
    !isPickleball && typeof gameSeriesConfig?.maxPointsPerGame === "number"
      ? gameSeriesConfig.maxPointsPerGame
      : undefined;
  const dateLocaleHintId = useMemo(
    () => `${sport || "record"}-date-locale-note`,
    [sport],
  );
  const timeHintId = useMemo(
    () => `${sport || "record"}-time-hint`,
    [sport],
  );
  const friendlyHintId = useMemo(
    () => `${sport || "record"}-friendly-hint`,
    [sport],
  );
  const clubHintId = useId();
  const padelAmericanoTargetHintId = useId();
  const timeHintText = useMemo(() => {
    const base = sportCopy.timeHint?.trim() ?? "";
    const exampleSuffix = uses24HourTime
      ? `Example: ${timeExample}.`
      : `Example: ${timeExample} (include AM or PM).`;
    if (!base) {
      return exampleSuffix;
    }
    const needsPeriod = !/[.!?]$/.test(base);
    const decoratedBase = needsPeriod ? `${base}.` : base;
    return `${decoratedBase} ${exampleSuffix}`;
  }, [sportCopy.timeHint, timeExample, uses24HourTime]);
  const matchTypeGroupName = useMemo(
    () => `${sport || "record"}-match-type`,
    [sport],
  );
  const duplicateHintId = duplicateHintActive ? duplicatePlayersHintId : undefined;
  const gameSeriesHintId = useId();
  const gameSeriesStatusId = useId();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const preferredPlayerIds = useMemo(() => new Set(players.map((p) => p.id)), [
    players,
  ]);

  useEffect(() => {
    setGameScores(createGameScoreRows(maxGames));
  }, [maxGames]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(PLAYER_PREFERENCES_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as PlayerPreferences | null;
      if (!parsed || typeof parsed !== "object") {
        return;
      }
      setPlayerPreferences({
        lastSelection: parsed.lastSelection ?? null,
        recentPlayers: Array.isArray(parsed.recentPlayers)
          ? parsed.recentPlayers.filter((id) => typeof id === "string")
          : [],
        favouritePairings: Array.isArray(parsed.favouritePairings)
          ? parsed.favouritePairings
              .filter(
                (pairing): pairing is StoredPairing =>
                  Boolean(
                    pairing &&
                      Array.isArray(pairing.teamA) &&
                      Array.isArray(pairing.teamB) &&
                      typeof pairing.count === "number",
                  ),
              )
              .map((pairing) => ({
                teamA: pairing.teamA.map(String),
                teamB: pairing.teamB.map(String),
                count: pairing.count,
              }))
          : [],
      });
    } catch (err) {
      console.warn("Failed to parse player preferences", err);
    }
  }, []);

  useEffect(() => {
    if (!isPadelAmericano) {
      return;
    }
    if (hasLoadedPadelAmericanoDefaults.current) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    hasLoadedPadelAmericanoDefaults.current = true;
    const raw = window.localStorage.getItem(PADEL_AMERICANO_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as {
        date?: string;
        time?: string;
        location?: string;
        isFriendly?: boolean;
        clubId?: string;
        tieTarget?: string;
      } | null;
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.date === "string") {
          setDate(parsed.date);
        }
        if (typeof parsed.time === "string") {
          setTime(parsed.time);
        }
        if (typeof parsed.location === "string") {
          setLocation(parsed.location);
        }
        if (typeof parsed.isFriendly === "boolean") {
          setIsFriendly(parsed.isFriendly);
        }
        if (typeof parsed.clubId === "string") {
          setClubId(parsed.clubId);
        }
        if (typeof parsed.tieTarget === "string") {
          setPadelAmericanoTarget(parsed.tieTarget);
        }
      }
    } catch (err) {
      // Ignore malformed stored data
    }
  }, [isPadelAmericano]);

  useEffect(() => {
    if (!isPadelAmericano) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const payload = {
      date,
      time,
      location,
      isFriendly,
      clubId,
      tieTarget: padelAmericanoTarget,
    };
    try {
      window.localStorage.setItem(
        PADEL_AMERICANO_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch (err) {
      // Ignore persistence failures (e.g. private mode)
    }
  }, [
    clubId,
    date,
    isFriendly,
    isPadelAmericano,
    location,
    padelAmericanoTarget,
    time,
  ]);

  const gameSeriesSummary = useMemo(() => {
    let winsA = 0;
    let winsB = 0;
    let completed = 0;

    for (const row of gameScores) {
      const trimmedA = row?.a?.trim() ?? "";
      const trimmedB = row?.b?.trim() ?? "";
      if (!trimmedA || !trimmedB) {
        continue;
      }
      const valueA = Number(trimmedA);
      const valueB = Number(trimmedB);
      if (!Number.isFinite(valueA) || !Number.isInteger(valueA)) {
        continue;
      }
      if (!Number.isFinite(valueB) || !Number.isInteger(valueB)) {
        continue;
      }
      if (valueA === valueB) {
        continue;
      }
      completed += 1;
      if (valueA > valueB) {
        winsA += 1;
      } else {
        winsB += 1;
      }
    }

    return { winsA, winsB, completed };
  }, [gameScores]);

  const handleGameScoreChange = useCallback(
    (index: number, side: "A" | "B", value: string) => {
      setError(null);
      setSuccessMessage(null);
      setGameScores((prev) => {
        if (index < 0 || index >= prev.length) {
          return prev;
        }
        const next = prev.slice();
        const row = next[index];
        if (!row) {
          return prev;
        }
        next[index] = {
          ...row,
          [side === "A" ? "a" : "b"]: value,
        };
        return next;
      });
    },
    [],
  );

  const handleScoreAChange = useCallback((value: string) => {
    setScoreA(value);
    setError(null);
    setSuccessMessage(null);
  }, []);

  const handleScoreBChange = useCallback((value: string) => {
    setScoreB(value);
    setError(null);
    setSuccessMessage(null);
  }, []);

  const setBowlingFieldError = useCallback(
    (entryIndex: number, frameIndex: number | null, rollIndex: number | null) => {
      setBowlingFieldErrors((prev) => {
        const next = prev.slice();
        if (entryIndex >= next.length) {
          next.length = entryIndex + 1;
        }
        next[entryIndex] =
          frameIndex === null
            ? null
            : { frameIndex, rollIndex: rollIndex ?? null };
        return next;
      });
    },
    [],
  );

  const markBowlingEntryTouched = useCallback((entryIndex: number) => {
    setBowlingTouchedEntries((prev) => {
      const next = prev.slice();
      if (entryIndex >= next.length) {
        next.length = entryIndex + 1;
      }
      next[entryIndex] = true;
      return next;
    });
  }, []);

  const handleBowlingRollBlur = useCallback(
    (entryIndex: number) => {
      markBowlingEntryTouched(entryIndex);
    },
    [markBowlingEntryTouched],
  );

  const focusBowlingInput = useCallback((key: string | null) => {
    if (!key) {
      return;
    }
    const target = bowlingInputRefs.current[key];
    if (target) {
      target.focus();
      target.select();
    }
  }, []);

  const registerBowlingInput = useCallback(
    (key: string) => (element: HTMLInputElement | null) => {
      if (element) {
        bowlingInputRefs.current[key] = element;
      } else {
        delete bowlingInputRefs.current[key];
      }
    },
    [],
  );

  const scheduleBowlingFocus = useCallback((key: string | null) => {
    pendingBowlingFocusRef.current = key;
  }, []);

  useLayoutEffect(() => {
    if (!pendingBowlingFocusRef.current) {
      return;
    }
    const target = bowlingInputRefs.current[pendingBowlingFocusRef.current];
    if (target) {
      target.focus();
      target.select();
    }
    pendingBowlingFocusRef.current = null;
  }, [bowlingEntries]);

  useEffect(() => {
    if (!loggedIn) {
      setPlayers([]);
      return;
    }

    let active = true;

    async function loadPlayers() {
      try {
        const res = await apiFetch(`/v0/players`, { cache: "no-store" });
        if (!active) {
          return;
        }
        const data = (await res.json()) as { players: Player[] };
        const sortedPlayers = (data.players ?? [])
          .slice()
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
          );
        setPlayers(sortedPlayers);
      } catch (err) {
        const apiError = err instanceof Error ? (err as ApiError) : null;
        if (apiError?.status === 401 && active) {
          rememberLoginRedirect();
          router.push("/login");
        }
      }
    }

    loadPlayers();

    return () => {
      active = false;
    };
  }, [loggedIn, router]);

  const handleIdChange = (key: keyof IdMap, value: string) => {
    setIds((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setDuplicatePlayerNames([]);
    setSuccessMessage(null);
  };

  const handleBowlingPlayerChange = (index: number, value: string) => {
    setBowlingEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, playerId: value } : entry,
      ),
    );
    setError(null);
    setSuccessMessage(null);
    setBowlingValidationErrors((prev) => {
      const next = prev.slice();
      if (index >= next.length) {
        next.length = index + 1;
      }
      next[index] = null;
      return next;
    });
    setBowlingFieldError(index, null, null);
  };

  const handleBowlingRollChange = (
    entryIndex: number,
    frameIndex: number,
    rollIndex: number,
    rawValue: string,
  ) => {
    const entry = bowlingEntries[entryIndex];
    if (!entry) {
      return;
    }

    setError(null);
    const playerLabel = getBowlingPlayerLabel(entry, entryIndex, players);
    const frames = entry.frames.map((frame) => frame.slice());
    const frame = frames[frameIndex] ?? [];
    const isTenthFrame = frameIndex === BOWLING_FRAME_COUNT - 1;

    const trimmedInput = rawValue.trim();
    let sanitized = sanitizeBowlingRollInput(rawValue);

    if (sanitized === null && trimmedInput === "/" && rollIndex > 0) {
      const firstValue = frame[0]?.trim() ?? "";
      if (firstValue && firstValue !== "10") {
        const firstPins = Number(firstValue);
        if (Number.isFinite(firstPins)) {
          sanitized = String(10 - firstPins);
        }
      }
    }

    if (sanitized === null) {
      setBowlingValidationErrors((prev) => {
        const next = prev.slice();
        next[entryIndex] = invalidRollMessage(playerLabel, frameIndex, rollIndex);
        return next;
      });
      setBowlingFieldError(entryIndex, frameIndex, rollIndex);
      return;
    }

    if (!isTenthFrame && rollIndex === 1) {
      const firstValue = frame[0]?.trim() ?? "";
      if (firstValue === "10" && sanitized !== "") {
        setBowlingValidationErrors((prev) => {
          const next = prev.slice();
          next[entryIndex] = `${playerLabel} – Frame ${frameIndex + 1}: leave roll 2 empty after a strike.`;
          return next;
        });
        setBowlingFieldError(entryIndex, frameIndex, rollIndex);
        return;
      }
    }

    if (isTenthFrame && rollIndex === 2 && sanitized !== "") {
      const secondValue = frame[1]?.trim() ?? "";
      if (!secondValue) {
        setBowlingValidationErrors((prev) => {
          const next = prev.slice();
          next[entryIndex] = `${playerLabel} – Frame ${BOWLING_FRAME_COUNT}: enter roll 2 before roll 3.`;
          return next;
        });
        setBowlingFieldError(entryIndex, frameIndex, rollIndex);
        return;
      }
    }

    frame[rollIndex] = sanitized;

    if (rollIndex === 0) {
      if (!sanitized) {
        for (let i = 1; i < frame.length; i += 1) {
          frame[i] = "";
        }
      } else if (!isTenthFrame && sanitized === "10") {
        frame[1] = "";
      } else if (isTenthFrame && sanitized !== "10") {
        frame[2] = "";
      }
    }

    if (isTenthFrame && rollIndex === 1 && !sanitized) {
      frame[2] = "";
    }

    if (isTenthFrame) {
      const firstValue = frame[0]?.trim() ?? "";
      const secondValue = frame[1]?.trim() ?? "";
      if (!firstValue) {
        frame[1] = "";
        frame[2] = "";
      } else {
        const firstPins = Number(firstValue);
        const secondPins = secondValue ? Number(secondValue) : null;
        const earnedThird =
          firstPins === 10 ||
          (secondPins !== null && firstPins + secondPins === 10);
        if (!earnedThird) {
          frame[2] = "";
        }
      }
    }

    frames[frameIndex] = frame;

    const validationError = validateBowlingFrameInput(
      frames,
      frameIndex,
      playerLabel,
    );
    if (validationError) {
      setBowlingValidationErrors((prev) => {
        const next = prev.slice();
        next[entryIndex] = validationError;
        return next;
      });
      setBowlingFieldError(entryIndex, frameIndex, null);
      return;
    }

    const nextEntries = bowlingEntries.map((item, idx) =>
      idx === entryIndex ? { ...item, frames } : item,
    );

    const shouldAdvance = sanitized !== "";
    const nextFocusKey = shouldAdvance
      ? findNextBowlingInputKey(nextEntries, entryIndex, frameIndex, rollIndex)
      : null;

    scheduleBowlingFocus(nextFocusKey);

    setBowlingEntries(nextEntries);

    setBowlingValidationErrors((prev) => {
      const next = prev.slice();
      next[entryIndex] = null;
      return next;
    });
    setBowlingFieldError(entryIndex, null, null);
  };

  const handleBowlingInputKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    entryIndex: number,
    frameIndex: number,
    rollIndex: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const verticalKey = findVerticalBowlingInputKey(
        bowlingEntries,
        entryIndex,
        frameIndex,
        rollIndex,
        direction,
      );
      if (verticalKey) {
        event.preventDefault();
        focusBowlingInput(verticalKey);
        return;
      }

      const targetFrameIndex = frameIndex + direction;
      const samePlayerFrameKey =
        targetFrameIndex >= 0 && targetFrameIndex < BOWLING_FRAME_COUNT
          ? findBowlingInputKeyInFrame(
              bowlingEntries[entryIndex],
              entryIndex,
              targetFrameIndex,
              rollIndex,
            )
          : null;
      if (samePlayerFrameKey) {
        event.preventDefault();
        focusBowlingInput(samePlayerFrameKey);
        return;
      }

      const fallbackKey =
        direction > 0
          ? findNextBowlingInputKey(
              bowlingEntries,
              entryIndex,
              frameIndex,
              rollIndex,
            )
          : findPreviousBowlingInputKey(
              bowlingEntries,
              entryIndex,
              frameIndex,
              rollIndex,
            );
      if (fallbackKey) {
        event.preventDefault();
        focusBowlingInput(fallbackKey);
      }
      return;
    }

    if (event.key === "ArrowRight") {
      const nextKey = findNextBowlingInputKey(
        bowlingEntries,
        entryIndex,
        frameIndex,
        rollIndex,
      );
      if (nextKey) {
        event.preventDefault();
        focusBowlingInput(nextKey);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      const previousKey = findPreviousBowlingInputKey(
        bowlingEntries,
        entryIndex,
        frameIndex,
        rollIndex,
      );
      if (previousKey) {
        event.preventDefault();
        focusBowlingInput(previousKey);
      }
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const nextFrameKey =
        findFrameStartKey(bowlingEntries, entryIndex, frameIndex + 1) ??
        findFirstEnabledKey(bowlingEntries, entryIndex + 1);
      focusBowlingInput(nextFrameKey);
    }
  };

  const handleRemoveBowlingPlayer = (index: number) => {
    setBowlingEntries((prev) => prev.filter((_, i) => i !== index));
    setBowlingValidationErrors((prev) => prev.filter((_, i) => i !== index));
    setBowlingFieldErrors((prev) => prev.filter((_, i) => i !== index));
    setBowlingTouchedEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddBowlingPlayer = () => {
    if (bowlingMaxReached) {
      return;
    }
    flushSync(() => {
      setBowlingEntries((prev) => [
        ...prev,
        { playerId: "", frames: createEmptyBowlingFrames() },
      ]);
    });
    flushSync(() => {
      setBowlingValidationErrors((prev) => [...prev, null]);
    });
    flushSync(() => {
      setBowlingFieldErrors((prev) => [...prev, null]);
    });
    flushSync(() => {
      setBowlingTouchedEntries((prev) => [...prev, false]);
    });
  };

  const handleToggle = (next: boolean) => {
    if (!next) {
      setIds((prev) => ({ ...prev, a2: "", b2: "" }));
    }
    setError(null);
    setDuplicatePlayerNames([]);
    setDoubles(next);
    setSuccessMessage(null);
  };

  const applyPlayerSelection = useCallback(
    (selection: IdMap) => {
      setIds(selection);
      setError(null);
      setDuplicatePlayerNames([]);
      setSuccessMessage(null);
      const shouldEnableDoubles = Boolean(
        selection.a2 || selection.b2 || doubles || isPadel,
      );
      setDoubles(shouldEnableDoubles);
    },
    [doubles, isPadel],
  );

  const persistPlayerPreferences = useCallback(
    (selection: IdMap) => {
      setPlayerPreferences((previous) => {
        const selectedIds = [selection.a1, selection.a2, selection.b1, selection.b2]
          .filter(Boolean)
          .map(String);
        const recent = Array.from(
          new Set([
            ...selectedIds,
            ...(previous?.recentPlayers?.filter(Boolean) ?? []),
          ]),
        ).slice(0, 8);

        const teamAIds = [selection.a1, selection.a2].filter(Boolean).map(String);
        const teamBIds = [selection.b1, selection.b2].filter(Boolean).map(String);
        let favouritePairings = previous?.favouritePairings ?? [];
        if (teamAIds.length > 0 && teamBIds.length > 0) {
          const existingIndex = favouritePairings.findIndex(
            (pairing) =>
              pairing.teamA.join("|") === teamAIds.join("|") &&
              pairing.teamB.join("|") === teamBIds.join("|"),
          );
          if (existingIndex >= 0) {
            favouritePairings = favouritePairings.map((pairing, index) =>
              index === existingIndex
                ? { ...pairing, count: pairing.count + 1 }
                : pairing,
            );
          } else {
            favouritePairings = [
              { teamA: teamAIds, teamB: teamBIds, count: 1 },
              ...favouritePairings,
            ].slice(0, 6);
          }
        }

        const next: PlayerPreferences = {
          lastSelection: selection,
          recentPlayers: recent,
          favouritePairings,
        };

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              PLAYER_PREFERENCES_STORAGE_KEY,
              JSON.stringify(next),
            );
          } catch (storageErr) {
            console.warn("Failed to persist player preferences", storageErr);
          }
        }

        return next;
      });
    },
    [],
  );

  const recentPlayers = useMemo(() => {
    const mapped = playerPreferences.recentPlayers
      .map((id) => players.find((p) => p.id === id))
      .filter((player): player is Player => Boolean(player));
    return mapped;
  }, [playerPreferences.recentPlayers, players]);

  const mePlayer = useMemo(
    () => players.find((player) => player.id === session.userId) ?? null,
    [players, session.userId],
  );

  const presetPairings = useMemo(() => {
    const lookupByName = new Map(
      players.map((p) => [p.name.trim().toLowerCase(), p.id]),
    );
    const maybePairing = [
      {
        teamA: ["Emil", "Alex"],
        teamB: ["Jonas", "Sara"],
      },
    ]
      .map(({ teamA, teamB }) => {
        const teamAIds = teamA
          .map((name) => lookupByName.get(name.trim().toLowerCase()))
          .filter((id): id is string => Boolean(id));
        const teamBIds = teamB
          .map((name) => lookupByName.get(name.trim().toLowerCase()))
          .filter((id): id is string => Boolean(id));
        if (teamAIds.length !== teamA.length || teamBIds.length !== teamB.length) {
          return null;
        }
        return { teamA: teamAIds, teamB: teamBIds, label: "Favourite pairing" };
      })
      .filter((pairing): pairing is { teamA: string[]; teamB: string[]; label: string } =>
        Boolean(pairing),
      );
    return maybePairing;
  }, [players]);

  const favouritePairingOptions = useMemo(() => {
    const namedLookup = new Map(players.map((p) => [p.id, p.name]));
    const stored = playerPreferences.favouritePairings
      .filter(
        (pairing) =>
          pairing.teamA.every((id) => preferredPlayerIds.has(id)) &&
          pairing.teamB.every((id) => preferredPlayerIds.has(id)),
      )
      .map((pairing) => ({
        key: `${pairing.teamA.join("|")}::${pairing.teamB.join("|")}`,
        teamA: pairing.teamA,
        teamB: pairing.teamB,
        label: `${pairing.teamA
          .map((id) => namedLookup.get(id) ?? "Player")
          .join(" + ")} vs ${pairing.teamB
          .map((id) => namedLookup.get(id) ?? "Player")
          .join(" + ")}`,
        count: pairing.count,
      }));

    const presets = presetPairings.map((pairing) => ({
      key: `${pairing.teamA.join("|")}::${pairing.teamB.join("|")}`,
      teamA: pairing.teamA,
      teamB: pairing.teamB,
      label: `${pairing.label}: ${pairing.teamA
        .map((id) => namedLookup.get(id) ?? "")
        .join(" + ")} vs ${pairing.teamB
        .map((id) => namedLookup.get(id) ?? "")
        .join(" + ")}`,
      count: 0,
    }));

    const byKey = new Map<string, (typeof stored)[number]>();
    [...presets, ...stored].forEach((pairing) => {
      const existing = byKey.get(pairing.key);
      if (!existing || pairing.count > existing.count) {
        byKey.set(pairing.key, pairing);
      }
    });

    return Array.from(byKey.values()).sort((a, b) => b.count - a.count);
  }, [playerPreferences.favouritePairings, players, presetPairings, preferredPlayerIds]);

  const handleApplyLastMatch = useCallback(() => {
    if (playerPreferences.lastSelection) {
      applyPlayerSelection(playerPreferences.lastSelection);
    }
  }, [applyPlayerSelection, playerPreferences.lastSelection]);

  const handleApplyPairing = useCallback(() => {
    const pairing = favouritePairingOptions.find(
      (option) => option.key === selectedPairingKey,
    );
    if (!pairing) {
      return;
    }
    applyPlayerSelection({
      a1: pairing.teamA[0] ?? "",
      a2: pairing.teamA[1] ?? "",
      b1: pairing.teamB[0] ?? "",
      b2: pairing.teamB[1] ?? "",
    });
  }, [applyPlayerSelection, favouritePairingOptions, selectedPairingKey]);

  const handleSwapTeams = useCallback(() => {
    setIds((prev) => ({ a1: prev.b1, a2: prev.b2, b1: prev.a1, b2: prev.a2 }));
    setError(null);
    setDuplicatePlayerNames([]);
    setSuccessMessage(null);
  }, []);

  const handleRotatePositions = useCallback(() => {
    setIds((prev) => ({ a1: prev.a2 || prev.a1, a2: prev.a1, b1: prev.b2 || prev.b1, b2: prev.b1 }));
    setError(null);
    setDuplicatePlayerNames([]);
    setSuccessMessage(null);
  }, []);

  const handlePlayerSearchChange = useCallback(
    (key: keyof IdMap, value: string) => {
      setPlayerSearch((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const filteredPlayerOptions = useCallback(
    (slot: keyof IdMap) => {
      const query = playerSearch[slot]?.trim().toLowerCase() ?? "";
      const seen = new Set<string>();
      const matchesQuery = (player: Player | null) => {
        if (!player) return false;
        if (!query) return true;
        return player.name.toLowerCase().includes(query);
      };

      const meOption = mePlayer && matchesQuery(mePlayer)
        ? [{ id: mePlayer.id, name: `Me (${mePlayer.name})` }]
        : [];

      const recents = recentPlayers.filter((player) => matchesQuery(player));
      const recentOptions = recents
        .filter((p) => !seen.has(p.id))
        .map((p) => {
          seen.add(p.id);
          return { id: p.id, name: p.name };
        });

      const remaining = players
        .filter((player) => matchesQuery(player) && !seen.has(player.id))
        .map((player) => {
          seen.add(player.id);
          return { id: player.id, name: player.name };
        });

      return { meOption, recentOptions, remaining };
    },
    [mePlayer, playerSearch, players, recentPlayers],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isAnonymous) {
      rememberLoginRedirect();
      router.push("/login");
      return;
    }
    setHasAttemptedSubmit(true);
    setError(null);
    setDuplicatePlayerNames([]);
    setSuccessMessage(null);

    if (!sport) {
      setError("Select a sport");
      return;
    }

    if (isBowling) {
      if (bowlingEntries.some((entry) => !entry.playerId)) {
        setError("Please select a player for each entry.");
        return;
      }

      if (bowlingEntries.length < 2) {
        setError("Add at least two bowling players.");
        return;
      }

      const playersMap = new Map(players.map((p) => [p.id, p]));

      const summaries: BowlingSummaryResult[] = [];
      const participants = bowlingEntries.map((entry, idx) => {
        const frames = entry.frames.map((frame) => frame.slice());
        const player = playersMap.get(entry.playerId);
        const playerName = player?.name?.trim() || `Player ${idx + 1}`;
        const playerLabel = getBowlingPlayerLabel(entry, idx, players);
        for (let frameIdx = 0; frameIdx < frames.length; frameIdx += 1) {
          const frame = frames[frameIdx];
          if (!frame) {
            continue;
          }
          const validationError = validateBowlingFrameInput(
            frames,
            frameIdx,
            playerLabel,
          );
          if (validationError) {
            setBowlingValidationErrors((prev) => {
              const next = prev.slice();
              if (idx >= next.length) {
                next.length = idx + 1;
              }
              next[idx] = validationError;
              return next;
            });
            setBowlingFieldError(idx, frameIdx, null);
            setError(validationError);
            return null;
          }
        }
        const summary = summarizeBowlingInput(frames, {
          playerLabel,
          normalizeIncompleteFrames: true,
        });
        summaries.push(summary);
        return {
          side: String.fromCharCode(65 + idx) as "A" | "B" | "C" | "D" | "E" | "F",
          playerIds: [entry.playerId],
          playerName,
          playerId: entry.playerId,
        };
      });

      if (participants.some((p) => !p)) {
        return;
      }

      const names = participants.map((p) => p!.playerId);
      const uniqueIds = new Set(names);
      if (uniqueIds.size !== names.length) {
        setError("Please select unique players.");
        return;
      }

      const bowlingTotals = summaries.map((summary) => summary.total);
      const bowlingDetails = {
        players: participants.map((p, idx) => ({
          side: p!.side,
          playerId: p!.playerId,
          playerName: p!.playerName,
          frames: summaries[idx]!.frames,
          frameScores: summaries[idx]!.frameScores,
          total: summaries[idx]!.total,
        })),
      };

      try {
        setSubmitting(true);
        const playedAt = buildPlayedAtISOString(date, time);

        const payload = {
          sport,
          participants: participants.map((p) => ({
            side: p!.side,
            playerIds: p!.playerIds,
          })),
          score: bowlingTotals,
          ...(bowlingDetails ? { details: bowlingDetails } : {}),
          ...(playedAt ? { playedAt } : {}),
          ...(location ? { location } : {}),
          ...(isFriendly ? { isFriendly: true } : {}),
        };
        await apiFetch(`/v0/matches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        try {
          await invalidateMatchesCache();
        } catch (cacheErr) {
          console.error("Failed to invalidate match caches", cacheErr);
        }
        try {
          await invalidateNotificationsCache();
        } catch (notificationErr) {
          console.error("Failed to refresh notifications", notificationErr);
        }
        router.push(`/matches`);
      } catch (err) {
        console.error(err);
        setError("Failed to save. Please review players/scores and try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!ids.a1 || !ids.b1) {
      setError("Please select players for both sides.");
      return;
    }

    const selections = [ids.a1, ids.a2, ids.b1, ids.b2].filter(Boolean);
    const uniqueSelections = new Set(selections);
    if (uniqueSelections.size !== selections.length) {
      setError("Please select unique players.");
      return;
    }

    const byId = new Map(players.map((p) => [p.id, p.name]));
    const teamA = [ids.a1, ids.a2].filter(Boolean).map((id) => byId.get(id) || "");
    const teamB = [ids.b1, ids.b2].filter(Boolean).map((id) => byId.get(id) || "");

    if (!teamA.length || !teamB.length) {
      setError("Please select players for both sides.");
      return;
    }

    let sets: [number, number][] = [];

    if (usesGameSeries && gameSeriesConfig) {
      try {
        const normalized = normalizeGameSeries(gameScores, gameSeriesConfig);
        sets = normalized.sets;
      } catch (seriesErr) {
        const message =
          seriesErr instanceof Error
            ? seriesErr.message
            : "Invalid game scores. Please review and try again.";
        setError(message);
        return;
      }
    } else {
      const parsedA = parseNonNegativeInteger(scoreA);
      const parsedB = parseNonNegativeInteger(scoreB);
      if (parsedA === null || parsedB === null) {
        setError("Enter whole-number scores for both teams.");
        return;
      }

      if (isPadelAmericano) {
        const targetValue = parseNonNegativeInteger(padelAmericanoTarget);
        if (targetValue === null || targetValue <= 0) {
          setError(recordT("padelAmericano.tieTargetRequired"));
          return;
        }
        const total = parsedA + parsedB;
        if (total !== targetValue) {
          const message = `${recordT("padelAmericano.tieTargetMismatchPrefix")} ${targetValue} ${recordT("padelAmericano.tieTargetMismatchSuffix")}`;
          setError(message);
          return;
        }
      } else if (isStandardPadel) {
        if (parsedA === parsedB) {
          setError("Padel matches require a winner. Adjust the set totals.");
          return;
        }
        const winner = Math.max(parsedA, parsedB);
        const loser = Math.min(parsedA, parsedB);
        if (winner !== 2) {
          setError("Padel matches finish when a side wins two sets. Adjust the totals.");
          return;
        }
        if (loser > 1) {
          setError(
            "Padel matches allow at most one set for the losing side. Adjust the totals.",
          );
          return;
        }
      }

      sets = [[parsedA, parsedB]];
    }

    try {
      setSubmitting(true);
      const playedAt = buildPlayedAtISOString(date, time);

      const trimmedClubId = clubId.trim();
      const payload = {
        sport,
        createMissing: true,
        teamA,
        teamB,
        sets,
        ...(playedAt ? { playedAt } : {}),
        ...(location ? { location } : {}),
        ...(isFriendly ? { isFriendly: true } : {}),
        ...(trimmedClubId ? { clubId: trimmedClubId } : {}),
      };

      await apiFetch(`/v0/matches/by-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      persistPlayerPreferences(ids);
      try {
        await invalidateMatchesCache();
      } catch (cacheErr) {
        console.error("Failed to invalidate match caches", cacheErr);
      }
      try {
        await invalidateNotificationsCache();
      } catch (notificationErr) {
        console.error("Failed to refresh notifications", notificationErr);
      }
      if (isPadelAmericano) {
        setIds({ a1: "", a2: "", b1: "", b2: "" });
        setScoreA("0");
        setScoreB("0");
        if (usesGameSeries) {
          setGameScores(createGameScoreRows(maxGames));
        }
        setPlayerSearch({ a1: "", a2: "", b1: "", b2: "" });
        setHasAttemptedSubmit(false);
        setDuplicatePlayerNames([]);
        setSuccessMessage(recordT("messages.padelAmericanoSaved"));
      } else {
        router.push(`/matches`);
      }
    } catch (err) {
      console.error(err);
      const apiError = err instanceof Error ? (err as ApiError) : null;
      if (apiError?.code === DUPLICATE_PLAYERS_ERROR_CODE) {
        const duplicates = parseDuplicatePlayerNames(
          apiError.parsedMessage ?? apiError.message,
        );
        setDuplicatePlayerNames(duplicates);
        setError("Resolve duplicate player names before saving.");
      } else {
        setError("Failed to save. Please review players/scores and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="container">
      {isPadelAmericano && (
        <section
          className="card padel-americano-tips"
          aria-labelledby="padel-americano-tips-heading"
        >
          <h2 id="padel-americano-tips-heading" className="heading">
            Recording a padel Americano tie
          </h2>
          <p className="padel-americano-tips__intro">
            Review the Americano rotation before saving each tie so every player pairing is captured accurately.
          </p>
          <ul className="padel-americano-tips__list">
            <li>
              <strong>Sign in first:</strong> logging in keeps all of your Americano ties together and lets you resume an unfinished session.
            </li>
            <li>
              <strong>Set the pairings:</strong> Americanos are always doubles, so pick the two players on each side exactly as shown on your rotation sheet.
            </li>
            <li>
              <strong>Capture the score:</strong> enter the total points earned by each pair (for example Team A 24 – Team B 20 in a race to 32). Use the target your club prefers if it differs from 32.
            </li>
            <li>
              <strong>Note session details:</strong> record the date, start time and venue so everyone can find the tie later. Mark it as friendly for social hits.
            </li>
          </ul>
          <p className="padel-americano-tips__footer">
            <strong>Need fixtures?</strong> Generate a full Americano schedule before logging
            results here so you can follow the rotation without leaving this page.
          </p>
        </section>
      )}
      <form onSubmit={handleSubmit} className="form-stack">
        {isAnonymous && (
          <div className="login-required-banner" role="note">
            <p>
              You need to be logged in to record matches. Please log in or sign up.
            </p>
            <Link
              href="/login"
              className="button-secondary login-required-banner__action"
              onClick={() => rememberLoginRedirect()}
            >
              Log in
            </Link>
          </div>
        )}
        {supportsSinglesOrDoubles && (
          <fieldset className="form-fieldset" disabled={isAnonymous}>
            <legend className="form-legend">Match type</legend>
            <div className="radio-group">
              <label
                className="radio-group__option"
                htmlFor={`${matchTypeGroupName}-singles`}
              >
                <input
                  id={`${matchTypeGroupName}-singles`}
                  type="radio"
                  name={matchTypeGroupName}
                  value="singles"
                  checked={!doubles}
                  onChange={() => handleToggle(false)}
                />
                <span>Singles</span>
              </label>
              <label
                className="radio-group__option"
                htmlFor={`${matchTypeGroupName}-doubles`}
              >
                <input
                  id={`${matchTypeGroupName}-doubles`}
                  type="radio"
                  name={matchTypeGroupName}
                  value="doubles"
                  checked={doubles}
                  onChange={() => handleToggle(true)}
                />
                <span>Doubles</span>
              </label>
            </div>
          </fieldset>
        )}

        <fieldset className="form-fieldset" disabled={isAnonymous}>
          <legend className="form-legend">Match details</legend>
          {sportCopy.matchDetailsHint && (
            <p className="form-hint">{sportCopy.matchDetailsHint}</p>
          )}
          <div className="form-grid form-grid--two">
            <label className="form-field" htmlFor="record-date">
              <span className="form-label">Date</span>
              <input
                id="record-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                lang={locale}
                placeholder={datePlaceholder}
                aria-describedby={`record-date-format ${dateLocaleHintId}`}
              />
              <span id="record-date-format" className="form-hint">
                Example: {dateExample}
              </span>
              <span id={dateLocaleHintId} className="form-hint">
                Date format follows your profile preferences.
              </span>
            </label>
            <label className="form-field" htmlFor="record-time">
              <span className="form-label">Start time</span>
              <input
                id="record-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                lang={locale}
                aria-describedby={timeHintId}
                step={60}
                inputMode={uses24HourTime ? "numeric" : undefined}
                pattern={
                  uses24HourTime ? "([01][0-9]|2[0-3]):[0-5][0-9]" : undefined
                }
              />
              <span id={timeHintId} className="form-hint">
                {timeHintText}
              </span>
            </label>
          </div>
          {isPadelAmericano && (
            <label className="form-field" htmlFor="padel-americano-target">
              <span className="form-label">
                {recordT("padelAmericano.tieTargetLabel")}
              </span>
              <input
                id="padel-americano-target"
                type="number"
                min={1}
                max={99}
                step="1"
                value={padelAmericanoTarget}
                onChange={(event) =>
                  setPadelAmericanoTarget(event.target.value)
                }
                aria-describedby={padelAmericanoTargetHintId}
                inputMode="numeric"
              />
              <span id={padelAmericanoTargetHintId} className="form-hint">
                {recordT("padelAmericano.tieTargetHint")}
              </span>
            </label>
          )}
          {isPadelAmericano && (
            <div className="form-field">
              <label className="form-label" htmlFor="record-club-select">
                {recordT("fields.club.label")}
              </label>
              <ClubSelect
                value={clubId}
                onChange={setClubId}
                placeholder={recordT("fields.club.placeholder")}
                searchInputId="record-club-search"
                selectId="record-club-select"
                searchLabel={recordT("fields.club.searchLabel")}
                describedById={clubHintId}
              />
              <p id={clubHintId} className="form-hint">
                {recordT("fields.club.hint")}
              </p>
            </div>
          )}
          <label className="form-field" htmlFor="record-location">
            <span className="form-label">{recordT("fields.location.label")}</span>
            <input
              id="record-location"
              type="text"
              placeholder={recordT("fields.location.placeholder")}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
          <label
            className="form-field form-field--checkbox"
            htmlFor="record-friendly"
          >
            <input
              id="record-friendly"
              type="checkbox"
              checked={isFriendly}
              onChange={(e) => setIsFriendly(e.target.checked)}
              aria-describedby={friendlyHintId}
            />
            <span className="form-label">
              {recordT("fields.friendly.label")}
            </span>
          </label>
          <p id={friendlyHintId} className="form-hint">
            {recordT("fields.friendly.hint")}
          </p>
        </fieldset>

        {isBowling ? (
          <fieldset className="form-fieldset" disabled={isAnonymous}>
            <legend className="form-legend bowling-legend">
              <span>Players and scores</span>
              <span
                className="bowling-info-icon"
                role="img"
                aria-label="Bowling scoring input help"
                title="Enter 0-10 for pins. Use X for strikes, / to finish a spare, and - for gutters."
              >
                ⓘ
              </span>
            </legend>
            {sportCopy.playersHint && (
              <p className="form-hint">{sportCopy.playersHint}</p>
            )}
            {sportCopy.scoringHint && (
              <p className="form-hint">{sportCopy.scoringHint}</p>
            )}
            <div className="form-stack">
              {bowlingEntries.map((entry, idx) => {
                const playerLabel = getBowlingPlayerLabel(entry, idx, players);
                const entryError = bowlingValidationErrors[idx] ?? null;
                const entryFieldError = bowlingFieldErrors[idx] ?? null;
                const entryTouched = bowlingTouchedEntries[idx] ?? false;
                const shouldShowEntryErrors = hasAttemptedSubmit || entryTouched;
                const entryErrorMessage = shouldShowEntryErrors ? entryError : null;
                const preview = previewBowlingInput(entry.frames);
                const previewTotal = preview.total;
                return (
                  <section key={idx} className="bowling-entry">
                    <div className="bowling-entry-header">
                      <label
                        className="form-field"
                        htmlFor={`bowling-player-${idx}`}
                      >
                        <span className="form-label">Player {idx + 1}</span>
                        <select
                          id={`bowling-player-${idx}`}
                          value={entry.playerId}
                          onChange={(e) =>
                            handleBowlingPlayerChange(idx, e.target.value)
                          }
                        >
                          <option value="">Select player</option>
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="bowling-entry-meta">
                        <span className="bowling-total-preview">
                          Total: {previewTotal != null ? previewTotal : "—"}
                        </span>
                        {bowlingEntries.length > 1 && (
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => handleRemoveBowlingPlayer(idx)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {entryErrorMessage && (
                      <p className="error" role="alert" aria-live="assertive">
                        {entryErrorMessage}
                      </p>
                    )}
                    <div className="bowling-frames-grid">
                      {entry.frames.map((frame, frameIdx) => {
                        const frameTotal = preview.frameTotals[frameIdx] ?? null;
                        const hasAnyPins = frame.some((value) => value.trim() !== "");
                        const partialPins = getBowlingFramePinSum(frame);
                        const displayTotal =
                          frameTotal ?? (hasAnyPins ? partialPins : null);
                        const isFrameInvalid =
                          shouldShowEntryErrors &&
                          entryFieldError?.frameIndex === frameIdx;
                        return (
                          <div
                            key={frameIdx}
                            className={`bowling-frame-card${
                              isFrameInvalid ? " bowling-frame-card--invalid" : ""
                            }`}
                          >
                            <span className="bowling-frame-label">
                              Frame {frameIdx + 1}
                            </span>
                            <div
                              className={`bowling-rolls bowling-rolls--${frame.length}`}
                            >
                              {frame.map((roll, rollIdx) => {
                                const inputId = `bowling-${idx}-${frameIdx}-${rollIdx}`;
                                const inputKey = getBowlingInputKey(
                                  idx,
                                  frameIdx,
                                  rollIdx,
                                );
                                const isFinalFrame =
                                  frameIdx === BOWLING_FRAME_COUNT - 1;
                                const isRollEnabled = isBowlingRollEnabled(
                                  entry.frames,
                                  frameIdx,
                                  rollIdx,
                                );
                                const firstValue = frame[0]?.trim() ?? "";
                                const secondValue = frame[1]?.trim() ?? "";
                                const canSetStrike =
                                  isRollEnabled &&
                                  (rollIdx === 0 ||
                                    (isFinalFrame && rollIdx === 1 && firstValue === "10") ||
                                    (isFinalFrame &&
                                      rollIdx === 2 &&
                                      (firstValue === "10" ||
                                        (firstValue &&
                                          secondValue &&
                                          Number(firstValue) + Number(secondValue) === 10))));
                                const canSetSpare =
                                  isRollEnabled &&
                                  rollIdx === 1 &&
                                  firstValue !== "" &&
                                  firstValue !== "10";
                                const spareValue = canSetSpare
                                  ? String(10 - Number(firstValue))
                                  : null;
                                const canSetGutter = isRollEnabled;
                                const isRollInvalid =
                                  isFrameInvalid &&
                                  (entryFieldError?.rollIndex === null ||
                                    entryFieldError?.rollIndex === rollIdx);
                                const rollLabelId = `${inputId}-label`;
                                const rollLabel = `${playerLabel} frame ${
                                  frameIdx + 1
                                } roll ${rollIdx + 1}`;
                                return (
                                  <div key={rollIdx} className="bowling-roll-field">
                                    <label
                                      id={rollLabelId}
                                      className="bowling-roll-label"
                                      htmlFor={inputId}
                                    >
                                      Roll {rollIdx + 1}
                                      <span className="sr-only">{` for ${rollLabel}`}</span>
                                    </label>
                                    <input
                                      id={inputId}
                                      ref={registerBowlingInput(inputKey)}
                                      className={`bowling-roll-input${
                                        isRollInvalid ? " bowling-roll-input--invalid" : ""
                                      }`}
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      maxLength={2}
                                      placeholder="0, X, /"
                                      value={roll}
                                      disabled={!isRollEnabled}
                                      onChange={(e) =>
                                        handleBowlingRollChange(
                                          idx,
                                          frameIdx,
                                          rollIdx,
                                          e.target.value,
                                        )
                                      }
                                      onBlur={() => handleBowlingRollBlur(idx)}
                                      onKeyDown={(event) =>
                                        handleBowlingInputKeyDown(
                                          event,
                                          idx,
                                          frameIdx,
                                          rollIdx,
                                        )
                                      }
                                      aria-labelledby={rollLabelId}
                                      aria-label={rollLabel}
                                      aria-invalid={isRollInvalid || undefined}
                                    />
                                    <div
                                      className="bowling-roll-actions"
                                      role="group"
                                      aria-label={`${playerLabel} frame ${
                                        frameIdx + 1
                                      } roll ${rollIdx + 1} shortcuts`}
                                    >
                                      <button
                                        type="button"
                                        className="bowling-roll-action"
                                        disabled={!canSetStrike}
                                        onClick={() =>
                                          canSetStrike &&
                                          handleBowlingRollChange(
                                            idx,
                                            frameIdx,
                                            rollIdx,
                                            "10",
                                          )
                                        }
                                        aria-label="Set to strike (10 pins)"
                                      >
                                        X
                                      </button>
                                      <button
                                        type="button"
                                        className="bowling-roll-action"
                                        disabled={!canSetGutter}
                                        onClick={() =>
                                          canSetGutter &&
                                          handleBowlingRollChange(
                                            idx,
                                            frameIdx,
                                            rollIdx,
                                            "0",
                                          )
                                        }
                                        aria-label="Set to gutter (0 pins)"
                                      >
                                        –
                                      </button>
                                      <button
                                        type="button"
                                        className="bowling-roll-action"
                                        disabled={!canSetSpare || !spareValue}
                                        onClick={() =>
                                          canSetSpare &&
                                          spareValue &&
                                          handleBowlingRollChange(
                                            idx,
                                            frameIdx,
                                            rollIdx,
                                            spareValue,
                                          )
                                        }
                                        aria-label="Set to spare (fill frame to 10 pins)"
                                      >
                                        /
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <span
                              className="bowling-frame-total"
                              role="status"
                              aria-live="polite"
                              aria-label={`${playerLabel} frame ${
                                frameIdx + 1
                              } total`}
                            >
                              Total: {displayTotal != null ? displayTotal : "—"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="form-field">
              <button
                type="button"
                className="button-secondary"
                onClick={handleAddBowlingPlayer}
                disabled={bowlingMaxReached}
                aria-describedby={
                  bowlingMaxReached ? bowlingMaxHintId : undefined
                }
              >
                Add player
              </button>
              {bowlingMaxReached && (
                <p
                  className="form-hint"
                  id={bowlingMaxHintId}
                  role="status"
                  aria-live="polite"
                >
                  Maximum {MAX_BOWLING_PLAYERS} players
                </p>
              )}
            </div>
          </fieldset>
        ) : (
          <>
            <fieldset className="form-fieldset" disabled={isAnonymous}>
              <legend className="form-legend">Players</legend>
              {sportCopy.playersHint && (
                <p className="form-hint">{sportCopy.playersHint}</p>
              )}
              <div className="player-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleApplyLastMatch}
                  disabled={!playerPreferences.lastSelection}
                >
                  Use last match players
                </button>
                <div className="player-actions__favourite">
                  <label className="form-label" htmlFor="record-favourite-pairing">
                    Use favourite pairing
                  </label>
                  <div className="player-actions__row">
                    <select
                      id="record-favourite-pairing"
                      value={selectedPairingKey}
                      onChange={(event) => setSelectedPairingKey(event.target.value)}
                    >
                      <option value="">Choose a pairing</option>
                      {favouritePairingOptions.map((pairing) => (
                        <option key={pairing.key} value={pairing.key}>
                          {pairing.label}
                          {pairing.count > 0 ? ` (${pairing.count}×)` : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={handleApplyPairing}
                      disabled={!selectedPairingKey}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
              <div className="team-actions">
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleSwapTeams}
                >
                  Swap teams
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleRotatePositions}
                >
                  Rotate players
                </button>
              </div>
              <div className="team-grid">
                <div className="team-card">
                  <div className="team-card__header">Team A</div>
                  <div className="team-card__content">
                    <div className="form-field">
                      <label className="form-label" htmlFor="record-player-a1">
                        Team A player 1
                      </label>
                      <input
                        id="record-player-a1-search"
                        type="search"
                        value={playerSearch.a1}
                        onChange={(event) =>
                          handlePlayerSearchChange("a1", event.target.value)
                        }
                        placeholder="Search players"
                        aria-label="Search Team A options"
                      />
                      <select
                        id="record-player-a1"
                        value={ids.a1}
                        onChange={(e) => handleIdChange("a1", e.target.value)}
                        aria-invalid={
                          duplicateHintActive && isDuplicateSelection(ids.a1)
                            ? true
                            : undefined
                        }
                        aria-describedby={duplicateHintId}
                      >
                        <option value="">Select player</option>
                        {filteredPlayerOptions("a1").meOption.map((option) => (
                          <option key={`me-${option.id}`} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                        {filteredPlayerOptions("a1").recentOptions.length > 0 && (
                          <optgroup label="Recent">
                            {filteredPlayerOptions("a1").recentOptions.map((option) => (
                              <option key={`recent-${option.id}`} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="All players">
                          {filteredPlayerOptions("a1").remaining.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    {doubles && (
                      <div className="form-field">
                        <label className="form-label" htmlFor="record-player-a2">
                          Team A player 2
                        </label>
                        <input
                          id="record-player-a2-search"
                          type="search"
                          value={playerSearch.a2}
                          onChange={(event) =>
                            handlePlayerSearchChange("a2", event.target.value)
                          }
                          placeholder="Search players"
                          aria-label="Search Team A bench"
                        />
                        <select
                          id="record-player-a2"
                          value={ids.a2}
                          onChange={(e) => handleIdChange("a2", e.target.value)}
                          aria-invalid={
                            duplicateHintActive && isDuplicateSelection(ids.a2)
                              ? true
                              : undefined
                          }
                          aria-describedby={duplicateHintId}
                        >
                          <option value="">Select player</option>
                          {filteredPlayerOptions("a2").meOption.map((option) => (
                            <option key={`me-${option.id}`} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                          {filteredPlayerOptions("a2").recentOptions.length > 0 && (
                            <optgroup label="Recent">
                              {filteredPlayerOptions("a2").recentOptions.map((option) => (
                                <option key={`recent-${option.id}`} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="All players">
                            {filteredPlayerOptions("a2").remaining.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="team-card">
                  <div className="team-card__header">Team B</div>
                  <div className="team-card__content">
                    <div className="form-field">
                      <label className="form-label" htmlFor="record-player-b1">
                        Team B player 1
                      </label>
                      <input
                        id="record-player-b1-search"
                        type="search"
                        value={playerSearch.b1}
                        onChange={(event) =>
                          handlePlayerSearchChange("b1", event.target.value)
                        }
                        placeholder="Search players"
                        aria-label="Search Team B options"
                      />
                      <select
                        id="record-player-b1"
                        value={ids.b1}
                        onChange={(e) => handleIdChange("b1", e.target.value)}
                        aria-invalid={
                          duplicateHintActive && isDuplicateSelection(ids.b1)
                            ? true
                            : undefined
                        }
                        aria-describedby={duplicateHintId}
                      >
                        <option value="">Select player</option>
                        {filteredPlayerOptions("b1").meOption.map((option) => (
                          <option key={`me-${option.id}`} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                        {filteredPlayerOptions("b1").recentOptions.length > 0 && (
                          <optgroup label="Recent">
                            {filteredPlayerOptions("b1").recentOptions.map((option) => (
                              <option key={`recent-${option.id}`} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="All players">
                          {filteredPlayerOptions("b1").remaining.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    {doubles && (
                      <div className="form-field">
                        <label className="form-label" htmlFor="record-player-b2">
                          Team B player 2
                        </label>
                        <input
                          id="record-player-b2-search"
                          type="search"
                          value={playerSearch.b2}
                          onChange={(event) =>
                            handlePlayerSearchChange("b2", event.target.value)
                          }
                          placeholder="Search players"
                          aria-label="Search Team B bench"
                        />
                        <select
                          id="record-player-b2"
                          value={ids.b2}
                          onChange={(e) => handleIdChange("b2", e.target.value)}
                          aria-invalid={
                            duplicateHintActive && isDuplicateSelection(ids.b2)
                              ? true
                              : undefined
                          }
                          aria-describedby={duplicateHintId}
                        >
                          <option value="">Select player</option>
                          {filteredPlayerOptions("b2").meOption.map((option) => (
                            <option key={`me-${option.id}`} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                          {filteredPlayerOptions("b2").recentOptions.length > 0 && (
                            <optgroup label="Recent">
                              {filteredPlayerOptions("b2").recentOptions.map((option) => (
                                <option key={`recent-${option.id}`} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="All players">
                            {filteredPlayerOptions("b2").remaining.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {duplicatePlayerNames.length > 0 && (
                <p
                  className="form-hint error"
                  role="alert"
                  aria-live="assertive"
                  id={duplicatePlayersHintId}
                >
                  Duplicate player names returned: {duplicatePlayerNames.join(", ")}. Each
                  player name must be unique before saving.
                </p>
              )}
            </fieldset>

            <fieldset className="form-fieldset" disabled={isAnonymous}>
              <legend className="form-legend">Match score</legend>
              {sportCopy.scoringHint && (
                <p
                  className="form-hint"
                  id={usesGameSeries ? gameSeriesHintId : undefined}
                >
                  {sportCopy.scoringHint}
                </p>
              )}
              {usesGameSeries ? (
                <>
                  <p
                    className="form-hint"
                    id={gameSeriesStatusId}
                    role="status"
                    aria-live="polite"
                  >
                    Games won so far: Team A {gameSeriesSummary.winsA} – Team B {gameSeriesSummary.winsB}.
                  </p>
                  <div className="form-stack">
                    {gameScores.map((row, index) => {
                      const gameNumber = index + 1;
                      return (
                        <div key={gameNumber} className="form-grid form-grid--two">
                          <label
                            className="form-field"
                            htmlFor={`record-game-${gameNumber}-score-a`}
                          >
                            <span className="form-label">
                              Game {gameNumber} – Team A points
                            </span>
                            <input
                              id={`record-game-${gameNumber}-score-a`}
                              type="number"
                              min={0}
                              max={gameScoreMax}
                              step="1"
                              placeholder={gameScorePlaceholder}
                              value={row.a}
                              onChange={(event) =>
                                handleGameScoreChange(
                                  index,
                                  "A",
                                  event.target.value,
                                )
                              }
                              inputMode="numeric"
                            />
                          </label>
                          <label
                            className="form-field"
                            htmlFor={`record-game-${gameNumber}-score-b`}
                          >
                            <span className="form-label">
                              Game {gameNumber} – Team B points
                            </span>
                            <input
                              id={`record-game-${gameNumber}-score-b`}
                              type="number"
                              min={0}
                              max={gameScoreMax}
                              step="1"
                              placeholder={gameScorePlaceholder}
                              value={row.b}
                              onChange={(event) =>
                                handleGameScoreChange(
                                  index,
                                  "B",
                                  event.target.value,
                                )
                              }
                              inputMode="numeric"
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="form-grid form-grid--two">
                  <label className="form-field" htmlFor="record-score-a">
                    <span className="form-label">Team A score</span>
                    <input
                      id="record-score-a"
                      type="number"
                      min="0"
                      step="1"
                      placeholder={scorePlaceholderA}
                      value={scoreA}
                      onChange={(e) => handleScoreAChange(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <label className="form-field" htmlFor="record-score-b">
                    <span className="form-label">Team B score</span>
                    <input
                      id="record-score-b"
                      type="number"
                      min="0"
                      step="1"
                      placeholder={scorePlaceholderB}
                      value={scoreB}
                      onChange={(e) => handleScoreBChange(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                </div>
              )}
            </fieldset>
          </>
        )}

        {error && (
          <p role="alert" className="error" aria-live="assertive">
            {error}
          </p>
        )}

        {successMessage && (
          <p role="status" className="success" aria-live="polite">
            {successMessage}
          </p>
        )}

        <button type="submit" disabled={isAnonymous || submitting}>
          {submitting
            ? commonT("status.saving")
            : commonT("actions.save")}
        </button>
      </form>
    </main>
  );
}

