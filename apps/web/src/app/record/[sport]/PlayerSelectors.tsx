import React from "react";

import type { SportCopy } from "./types";

interface IdMap {
  a1: string;
  a2: string;
  b1: string;
  b2: string;
}

interface PlayerPreferences {
  lastSelection: IdMap | null;
}

interface PlayerOption {
  id: string;
  name: string;
}

interface FilteredOptions {
  meOption: PlayerOption[];
  recentOptions: PlayerOption[];
  remaining: PlayerOption[];
}

interface FavouritePairingOption {
  key: string;
  label: string;
  count: number;
}

interface PlayerSelectorsProps {
  sportCopy: SportCopy;
  isAnonymous: boolean;
  playerPreferences: PlayerPreferences;
  handleApplyLastMatch: () => void;
  selectedPairingKey: string;
  setSelectedPairingKey: (value: string) => void;
  favouritePairingOptions: FavouritePairingOption[];
  handleApplyPairing: () => void;
  handleSwapTeams: () => void;
  handleRotatePositions: () => void;
  playerSearch: IdMap;
  handlePlayerSearchChange: (key: keyof IdMap, value: string) => void;
  ids: IdMap;
  handleIdChange: (key: keyof IdMap, value: string) => void;
  duplicateHintActive: boolean;
  duplicateHintId: string | undefined;
  isDuplicateSelection: (playerId: string) => boolean;
  filteredPlayerOptions: (slot: keyof IdMap) => FilteredOptions;
  doubles: boolean;
  duplicatePlayerNames: string[];
  duplicatePlayersHintId: string;
}

export function PlayerSelectors({
  sportCopy,
  isAnonymous,
  playerPreferences,
  handleApplyLastMatch,
  selectedPairingKey,
  setSelectedPairingKey,
  favouritePairingOptions,
  handleApplyPairing,
  handleSwapTeams,
  handleRotatePositions,
  playerSearch,
  handlePlayerSearchChange,
  ids,
  handleIdChange,
  duplicateHintActive,
  duplicateHintId,
  isDuplicateSelection,
  filteredPlayerOptions,
  doubles,
  duplicatePlayerNames,
  duplicatePlayersHintId,
}: PlayerSelectorsProps) {
  return (
    <fieldset className="form-fieldset" disabled={isAnonymous}>
      <legend className="form-legend">Players</legend>
      {sportCopy.playersHint && <p className="form-hint">{sportCopy.playersHint}</p>}
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
        <button type="button" className="button-secondary" onClick={handleSwapTeams}>
          Swap teams
        </button>
        <button type="button" className="button-secondary" onClick={handleRotatePositions}>
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
                onChange={(event) => handlePlayerSearchChange("a1", event.target.value)}
                placeholder="Search players"
                aria-label="Search Team A options"
              />
              <select
                id="record-player-a1"
                value={ids.a1}
                onChange={(e) => handleIdChange("a1", e.target.value)}
                aria-invalid={
                  duplicateHintActive && isDuplicateSelection(ids.a1) ? true : undefined
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
                  onChange={(event) => handlePlayerSearchChange("a2", event.target.value)}
                  placeholder="Search players"
                  aria-label="Search Team A bench"
                />
                <select
                  id="record-player-a2"
                  value={ids.a2}
                  onChange={(e) => handleIdChange("a2", e.target.value)}
                  aria-invalid={
                    duplicateHintActive && isDuplicateSelection(ids.a2) ? true : undefined
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
                onChange={(event) => handlePlayerSearchChange("b1", event.target.value)}
                placeholder="Search players"
                aria-label="Search Team B options"
              />
              <select
                id="record-player-b1"
                value={ids.b1}
                onChange={(e) => handleIdChange("b1", e.target.value)}
                aria-invalid={
                  duplicateHintActive && isDuplicateSelection(ids.b1) ? true : undefined
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
                  onChange={(event) => handlePlayerSearchChange("b2", event.target.value)}
                  placeholder="Search players"
                  aria-label="Search Team B bench"
                />
                <select
                  id="record-player-b2"
                  value={ids.b2}
                  onChange={(e) => handleIdChange("b2", e.target.value)}
                  aria-invalid={
                    duplicateHintActive && isDuplicateSelection(ids.b2) ? true : undefined
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
          Duplicate player names returned: {duplicatePlayerNames.join(", ")}. Each player name
          must be unique before saving.
        </p>
      )}
    </fieldset>
  );
}
