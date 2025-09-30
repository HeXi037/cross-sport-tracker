"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  apiFetch,
  createStage,
  createTournament,
  scheduleAmericanoStage,
  type ApiError,
  type StageScheduleMatch,
  type TournamentSummary,
} from "../../lib/api";
import type { PlayerInfo } from "../../components/PlayerName";
import MultiSelect from "../../components/MultiSelect";
import StageScheduleTable from "./stage-schedule";
import { useSessionSnapshot } from "../../lib/useSessionSnapshot";

interface SportOption {
  id: string;
  name: string;
}

interface PlayerOption {
  id: string;
  name: string;
}

interface RulesetOption {
  id: string;
  name: string;
}

interface CreateTournamentFormProps {
  onCreated?: (tournament: TournamentSummary) => void;
}

const MIN_AMERICANO_PLAYERS = 4;
const COURT_OPTIONS = [1, 2, 3, 4, 5, 6];

type LoadStatus = "idle" | "loading" | "success" | "error";

export default function CreateTournamentForm({
  onCreated,
}: CreateTournamentFormProps) {
  const session = useSessionSnapshot();
  const admin = session.isAdmin;
  const loggedIn = session.isLoggedIn;

  const [sports, setSports] = useState<SportOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [rulesets, setRulesets] = useState<RulesetOption[]>([]);
  const [sportId, setSportId] = useState("");
  const [rulesetId, setRulesetId] = useState("");
  const [name, setName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [courtCount, setCourtCount] = useState(1);
  const [sportsStatus, setSportsStatus] = useState<LoadStatus>("idle");
  const [sportsError, setSportsError] = useState<string | null>(null);
  const [playersStatus, setPlayersStatus] = useState<LoadStatus>("idle");
  const [playersError, setPlayersError] = useState<string | null>(null);
  const [rulesetsStatus, setRulesetsStatus] = useState<LoadStatus>("idle");
  const [rulesetsError, setRulesetsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scheduledMatches, setScheduledMatches] = useState<StageScheduleMatch[]>([]);

  const resetFeedback = useCallback(() => {
    setError(null);
    setSuccess(null);
    setScheduledMatches([]);
  }, []);

  const loadSports = useCallback(async () => {
    if (!loggedIn) return;
    setSportsStatus("loading");
    setSportsError(null);
    try {
      const res = await apiFetch("/v0/sports", { cache: "no-store" });
      const data = (await res.json()) as SportOption[];
      setSports(data);
      setSportsStatus("success");
      if (data.length === 0) {
        setSportId("");
        return;
      }
      if (!admin) {
        const padel = data.find((sport) => sport.id === "padel");
        setSportId(padel?.id ?? data[0].id);
      } else if (!sportId || !data.some((sport) => sport.id === sportId)) {
        setSportId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load sports", err);
      setSports([]);
      setSportsStatus("error");
      setSportsError("Unable to load sports. Try again.");
    }
  }, [admin, loggedIn, sportId]);

  const loadPlayers = useCallback(async () => {
    if (!loggedIn) return;
    setPlayersStatus("loading");
    setPlayersError(null);
    try {
      const res = await apiFetch("/v0/players", { cache: "no-store" });
      const data = (await res.json()) as { players: PlayerOption[] };
      setPlayers(data.players || []);
      setPlayersStatus("success");
    } catch (err) {
      console.error("Failed to load players", err);
      setPlayers([]);
      setPlayersStatus("error");
      setPlayersError("Unable to load players. Retry when you have a connection.");
    }
  }, [loggedIn]);

  const loadRulesets = useCallback(
    async (sport: string) => {
      if (!loggedIn || !sport) {
        setRulesets([]);
        setRulesetId("");
        return;
      }
      setRulesetsStatus("loading");
      setRulesetsError(null);
      try {
        const res = await apiFetch(
          `/v0/rulesets?sport=${encodeURIComponent(sport)}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as RulesetOption[];
        setRulesets(data);
        setRulesetsStatus("success");
        if (data.length) {
          setRulesetId((current) => (current && data.some((r) => r.id === current) ? current : data[0].id));
        } else {
          setRulesetId("");
        }
      } catch (err) {
        console.error("Failed to load rulesets", err);
        setRulesets([]);
        setRulesetsStatus("error");
        setRulesetsError("Unable to load rulesets. Try again or continue with defaults.");
        setRulesetId("");
      }
    },
    [loggedIn]
  );

  useEffect(() => {
    if (!loggedIn) return;
    loadSports();
    loadPlayers();
  }, [loadPlayers, loadSports, loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    loadRulesets(sportId);
  }, [loadRulesets, loggedIn, sportId]);

  const playerLookup = useMemo(() => {
    const map = new Map<string, PlayerInfo>();
    players.forEach((player) => {
      map.set(player.id, { id: player.id, name: player.name });
    });
    return map;
  }, [players]);

  const handlePlayerSelectionChange = useCallback(
    (playerIds: string[]) => {
      resetFeedback();
      setSelectedPlayers(playerIds);
    },
    [resetFeedback]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;

    const trimmedName = name.trim();
    if (!trimmedName || !sportId) {
      setError("Enter a name and select a sport.");
      return;
    }

    if (selectedPlayers.length < MIN_AMERICANO_PLAYERS) {
      setError("Americano tournaments require at least four players.");
      return;
    }

    setCreating(true);
    resetFeedback();

    try {
      const tournament = await createTournament({ sport: sportId, name: trimmedName });
      const stage = await createStage(tournament.id, {
        type: "americano",
        config: { format: "americano" },
      });
      const schedule = await scheduleAmericanoStage(tournament.id, stage.id, {
        playerIds: selectedPlayers,
        rulesetId: rulesetId || undefined,
        courtCount,
      });
      setScheduledMatches(schedule.matches);
      setSuccess(
        `Created ${tournament.name} with ${schedule.matches.length} scheduled match${
          schedule.matches.length === 1 ? "" : "es"
        }.`
      );
      onCreated?.(tournament);
      setName("");
      setSelectedPlayers([]);
      setPlayerSearch("");
      setCourtCount(1);
    } catch (err) {
      console.error("Failed to create tournament", err);
      const apiError = err as ApiError | undefined;
      if (apiError?.status === 403) {
        setError("Only padel Americano tournaments can be created without an admin account.");
      } else {
        setError("Unable to create tournament. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  };

  const selectedCount = selectedPlayers.length;
  const filteredPlayers = useMemo(() => {
    const trimmedSearch = playerSearch.trim().toLowerCase();
    if (!trimmedSearch) {
      return players;
    }
    const words = trimmedSearch.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return players;
    }
    return players.filter((player) => {
      const lower = player.name.toLowerCase();
      return words.every((word) => lower.includes(word));
    });
  }, [playerSearch, players]);
  const filteredPlayerIds = useMemo(
    () => filteredPlayers.map((player) => player.id),
    [filteredPlayers]
  );
  const selectedPlayerSet = useMemo(
    () => new Set(selectedPlayers),
    [selectedPlayers]
  );
  const hasFilteredPlayers = filteredPlayerIds.length > 0;
  const allFilteredSelected =
    hasFilteredPlayers && filteredPlayerIds.every((id) => selectedPlayerSet.has(id));
  const hasSelectedInFiltered = filteredPlayerIds.some((id) => selectedPlayerSet.has(id));

  const handleSelectFilteredPlayers = useCallback(() => {
    if (!filteredPlayerIds.length) {
      return;
    }
    const additions = filteredPlayerIds.filter((id) => !selectedPlayerSet.has(id));
    if (additions.length === 0) {
      return;
    }
    setSelectedPlayers([...selectedPlayers, ...additions]);
    resetFeedback();
  }, [filteredPlayerIds, selectedPlayerSet, selectedPlayers, resetFeedback]);

  const handleClearFilteredPlayers = useCallback(() => {
    if (!filteredPlayerIds.length) {
      return;
    }
    const removalSet = new Set(filteredPlayerIds);
    const nextSelected = selectedPlayers.filter((id) => !removalSet.has(id));
    if (nextSelected.length === selectedPlayers.length) {
      return;
    }
    setSelectedPlayers(nextSelected);
    resetFeedback();
  }, [filteredPlayerIds, selectedPlayers, resetFeedback]);

  const playerValidationMessage =
    selectedCount >= MIN_AMERICANO_PLAYERS
      ? `Ready to schedule with ${selectedCount} player${selectedCount === 1 ? "" : "s"}. Use the search box to adjust the roster.`
      : `Use the search box to add at least ${MIN_AMERICANO_PLAYERS} players before generating the Americano schedule.`;

  const title = admin
    ? "Admin: Create Americano tournament"
    : "Create an Americano tournament";

  if (!loggedIn) {
    return (
      <section className="card" style={{ padding: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
          Sign in to create an Americano tournament
        </h2>
        <p className="form-hint">
          Log in to create padel Americano tournaments, schedule matches, and share them
          with your club.
        </p>
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{title}</h2>
      {!admin && (
        <p className="form-hint" style={{ marginBottom: 12 }}>
          Padel is currently the only sport supported for self-service Americano tournaments.
        </p>
      )}
      <form onSubmit={handleSubmit} aria-label="Create tournament">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-field">
            <label className="form-label" htmlFor="tournament-name">
              Tournament name
            </label>
            <input
              id="tournament-name"
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                resetFeedback();
              }}
              placeholder="Autumn Americano"
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="tournament-sport">
              Sport
            </label>
            <select
              id="tournament-sport"
              value={sportId}
              onChange={(event) => {
                setSportId(event.target.value);
                resetFeedback();
              }}
              disabled={sportsStatus === "loading" || !admin}
            >
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.name}
                </option>
              ))}
            </select>
            {sportsStatus === "loading" && <p className="form-hint">Loading sports…</p>}
            {sportsStatus === "error" && (
              <p className="error" role="alert">
                {sportsError}
                <button
                  type="button"
                  className="link-button"
                  style={{ marginLeft: 8 }}
                  onClick={loadSports}
                >
                  Retry
                </button>
              </p>
            )}
            {!admin && sportId !== "padel" && (
              <p className="error" role="alert">
                Padel must be selected for Americano tournaments.
              </p>
            )}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="tournament-ruleset">
              Preferred ruleset (optional)
            </label>
            <select
              id="tournament-ruleset"
              value={rulesetId}
              onChange={(event) => setRulesetId(event.target.value)}
              disabled={rulesetsStatus === "loading" || rulesets.length === 0}
            >
              <option value="">Use sport default</option>
              {rulesets.map((ruleset) => (
                <option key={ruleset.id} value={ruleset.id}>
                  {ruleset.name}
                </option>
              ))}
            </select>
            {rulesetsStatus === "loading" && <p className="form-hint">Loading rulesets…</p>}
            {rulesetsStatus === "error" && rulesetsError && (
              <p className="error" role="alert">
                {rulesetsError}
                <button
                  type="button"
                  className="link-button"
                  style={{ marginLeft: 8 }}
                  onClick={() => loadRulesets(sportId)}
                >
                  Retry
                </button>
              </p>
            )}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="tournament-courts">
              Courts in play
            </label>
            <select
              id="tournament-courts"
              value={courtCount}
              onChange={(event) => {
                const value = Number(event.target.value);
                setCourtCount(Number.isNaN(value) ? 1 : value);
                resetFeedback();
              }}
            >
              {COURT_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {`${count} court${count === 1 ? "" : "s"}`}
                </option>
              ))}
            </select>
            <p className="form-hint">
              Choose how many matches should run at the same time (1–6 courts).
            </p>
          </div>
          <fieldset className="form-fieldset">
            <legend className="form-legend">Players</legend>
            <p className="form-hint" style={{ marginBottom: 12 }}>
              Search or arrow through the list to add players. Selected entries are displayed as
              removable chips above the search field.
            </p>
            <MultiSelect
              ariaLabel="Available players"
              id="player"
              loading={playersStatus === "loading"}
              noOptionsMessage="No players are available yet."
              noResultsMessage={(query) => `No players match "${query}".`}
              onSearchChange={(value) => {
                setPlayerSearch(value);
                setSuccess(null);
              }}
              onSelectionChange={handlePlayerSelectionChange}
              options={players}
              placeholder={playersStatus === "loading" ? "Loading players…" : "Start typing a name…"}
              searchLabel="Search players"
              searchValue={playerSearch}
              selectedIds={selectedPlayers}
              selectedSummaryLabel={`${selectedCount} player${selectedCount === 1 ? "" : "s"} selected`}
            />
            {playersStatus === "error" && playersError && (
              <p className="error" role="alert">
                {playersError}
                <button
                  type="button"
                  className="link-button"
                  style={{ marginLeft: 8 }}
                  onClick={loadPlayers}
                >
                  Retry
                </button>
              </p>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button
                type="button"
                onClick={handleSelectFilteredPlayers}
                disabled={!hasFilteredPlayers || allFilteredSelected}
              >
                Select all shown
              </button>
              <button
                type="button"
                onClick={handleClearFilteredPlayers}
                disabled={!hasSelectedInFiltered}
              >
                Clear selection
              </button>
            </div>
            <p className="form-hint" style={{ marginTop: 8 }}>
              {playerValidationMessage}
            </p>
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="form-hint" role="status">
              {success}
            </p>
          )}
          <button type="submit" disabled={creating}>
            {creating ? "Creating tournament…" : "Create and schedule"}
          </button>
        </div>
      </form>
      {scheduledMatches.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <StageScheduleTable
            matches={scheduledMatches}
            playerLookup={playerLookup}
            title="Generated schedule"
          />
        </div>
      )}
    </section>
  );
}

