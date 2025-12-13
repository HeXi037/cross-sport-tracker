import type React from "react";
import type { Dispatch, SetStateAction } from "react";

import type { BowlingEntry, BowlingSummaryPreview } from "../../../lib/bowlingSummary";
import { MAX_BOWLING_PLAYERS, BOWLING_FRAME_COUNT } from "./bowlingConfig";

type BowlingFieldError = null | { frameIndex: number; rollIndex: number | null };

export type BowlingEntriesProps = {
  bowlingEntries: BowlingEntry[];
  bowlingValidationErrors: (string | null)[];
  bowlingFieldErrors: BowlingFieldError[];
  bowlingTouchedEntries: boolean[];
  hasAttemptedSubmit: boolean;
  players: { id: string; name: string }[];
  sportCopy: { playersHint?: string; scoringHint?: string };
  bowlingRollPlaceholder: string;
  bowlingMaxReached: boolean;
  bowlingMaxHintId: string;
  disabled: boolean;
  registerBowlingInput: (key: string) => (element: HTMLInputElement | null) => void;
  previewBowlingInput: (frames: BowlingEntry["frames"]) => BowlingSummaryPreview;
  getBowlingPlayerLabel: (
    entry: BowlingEntry,
    entryIndex: number,
    players: { id: string; name: string }[],
  ) => string;
  getBowlingFramePinSum: (frame: string[]) => number;
  getBowlingInputKey: (entryIndex: number, frameIndex: number, rollIndex: number) => string;
  isBowlingRollEnabled: (
    frames: BowlingEntry["frames"],
    frameIndex: number,
    rollIndex: number,
  ) => boolean;
  handleBowlingPlayerChange: (entryIndex: number, playerId: string) => void;
  handleRemoveBowlingPlayer: (entryIndex: number) => void;
  handleBowlingRollChange: (
    entryIndex: number,
    frameIndex: number,
    rollIndex: number,
    value: string,
  ) => void;
  handleBowlingRollBlur: (entryIndex: number) => void;
  handleBowlingInputKeyDown: (
    event: React.KeyboardEvent<HTMLInputElement>,
    entryIndex: number,
    frameIndex: number,
    rollIndex: number,
  ) => void;
  handleAddBowlingPlayer: () => void;
};

export function BowlingEntriesSection({
  bowlingEntries,
  bowlingValidationErrors,
  bowlingFieldErrors,
  bowlingTouchedEntries,
  hasAttemptedSubmit,
  players,
  sportCopy,
  bowlingRollPlaceholder,
  bowlingMaxReached,
  bowlingMaxHintId,
  disabled,
  registerBowlingInput,
  previewBowlingInput,
  getBowlingPlayerLabel,
  getBowlingFramePinSum,
  getBowlingInputKey,
  isBowlingRollEnabled,
  handleBowlingPlayerChange,
  handleRemoveBowlingPlayer,
  handleBowlingRollChange,
  handleBowlingRollBlur,
  handleBowlingInputKeyDown,
  handleAddBowlingPlayer,
}: BowlingEntriesProps) {
  return (
    <fieldset className="form-fieldset" disabled={disabled}>
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
      {sportCopy.playersHint && <p className="form-hint">{sportCopy.playersHint}</p>}
      {sportCopy.scoringHint && <p className="form-hint">{sportCopy.scoringHint}</p>}
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
                <label className="form-field" htmlFor={`bowling-player-${idx}`}>
                  <span className="form-label">Player {idx + 1}</span>
                  <select
                    id={`bowling-player-${idx}`}
                    value={entry.playerId}
                    onChange={(e) => handleBowlingPlayerChange(idx, e.target.value)}
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
                  const displayTotal = frameTotal ?? (hasAnyPins ? partialPins : null);
                  const isFrameInvalid =
                    shouldShowEntryErrors && entryFieldError?.frameIndex === frameIdx;
                  return (
                    <div
                      key={frameIdx}
                      className={`bowling-frame-card${
                        isFrameInvalid ? " bowling-frame-card--invalid" : ""
                      }`}
                    >
                      <span className="bowling-frame-label">Frame {frameIdx + 1}</span>
                      <div className={`bowling-rolls bowling-rolls--${frame.length}`}>
                        {frame.map((roll, rollIdx) => {
                          const inputId = `bowling-${idx}-${frameIdx}-${rollIdx}`;
                          const inputKey = getBowlingInputKey(idx, frameIdx, rollIdx);
                          const isFinalFrame = frameIdx === BOWLING_FRAME_COUNT - 1;
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
                            isRollEnabled && rollIdx === 1 && firstValue !== "" && firstValue !== "10";
                          const spareValue = canSetSpare ? String(10 - Number(firstValue)) : null;
                          const canSetGutter = isRollEnabled;
                          const isRollInvalid =
                            isFrameInvalid &&
                            (entryFieldError?.rollIndex === null || entryFieldError?.rollIndex === rollIdx);
                          const rollLabelId = `${inputId}-label`;
                          const rollLabel = `${playerLabel} frame ${frameIdx + 1} roll ${rollIdx + 1}`;
                          return (
                            <div key={rollIdx} className="bowling-roll-field">
                              <label id={rollLabelId} className="bowling-roll-label" htmlFor={inputId}>
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
                                placeholder={bowlingRollPlaceholder}
                                value={roll}
                                disabled={!isRollEnabled}
                                onChange={(e) =>
                                  handleBowlingRollChange(idx, frameIdx, rollIdx, e.target.value)
                                }
                                onBlur={() => handleBowlingRollBlur(idx)}
                                onKeyDown={(event) =>
                                  handleBowlingInputKeyDown(event, idx, frameIdx, rollIdx)
                                }
                                aria-labelledby={rollLabelId}
                                aria-label={rollLabel}
                                aria-invalid={isRollInvalid || undefined}
                              />
                              <div
                                className="bowling-roll-actions"
                                role="group"
                                aria-label={`${playerLabel} frame ${frameIdx + 1} roll ${rollIdx + 1} shortcuts`}
                              >
                                <button
                                  type="button"
                                  className="bowling-roll-action"
                                  disabled={!canSetStrike}
                                  onClick={() =>
                                    canSetStrike &&
                                    handleBowlingRollChange(idx, frameIdx, rollIdx, "10")
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
                                    handleBowlingRollChange(idx, frameIdx, rollIdx, "0")
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
                                    handleBowlingRollChange(idx, frameIdx, rollIdx, spareValue)
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
                        aria-label={`${playerLabel} frame ${frameIdx + 1} total`}
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
          aria-describedby={bowlingMaxReached ? bowlingMaxHintId : undefined}
        >
          Add player
        </button>
        {bowlingMaxReached && (
          <p className="form-hint" id={bowlingMaxHintId} role="status" aria-live="polite">
            Maximum {MAX_BOWLING_PLAYERS} players
          </p>
        )}
      </div>
    </fieldset>
  );
}

export type BowlingEntriesState = {
  bowlingValidationErrors: (string | null)[];
  bowlingFieldErrors: BowlingFieldError[];
  bowlingTouchedEntries: boolean[];
};

export type BowlingEntriesStateSetter = Dispatch<SetStateAction<BowlingEntriesState>>;
