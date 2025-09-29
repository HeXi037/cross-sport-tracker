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
  isAdmin,
  isLoggedIn,
  type ApiError,
  type StageScheduleMatch,
  type TournamentSummary,
} from "../../lib/api";
import type { PlayerInfo } from "../../components/PlayerName";
import MultiSelect from "../../components/MultiSelect";
import StageScheduleTable from "./stage-schedule";

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

export default function CreateTournamentForm({
  onCreated,
}: CreateTournamentFormProps) {
  const [admin, setAdmin] = useState(() => isAdmin());
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [sports, setSports] = useState<SportOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [rulesets, setRulesets] = useState<RulesetOption[]>([]);
  const [sportId, setSportId] = useState("");
  const [rulesetId, setRulesetId] = useState("");
  const [name, setName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [courtCount, setCourtCount] = useState(1);
  const [loadingSports, setLoadingSports] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingRulesets, setLoadingRulesets] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scheduledMatches, setScheduledMatches] = useState<StageScheduleMatch[]>([]);

  useEffect(() => {
    const update = () => {
      setAdmin(isAdmin());
      setLoggedIn(isLoggedIn());
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  const loadSports = useCallback(async () => {
    setLoadingSports(true);
    try {
      const res = await apiFetch("/v0/sports", { cache: "no-store" });
      const data = (await res.json()) as SportOption[];
      setSports(data);
      if (data.length === 0) {
        setSportId("");
      } else if (!admin) {
        const padel = data.find((sport) => sport.id === "padel");
        setSportId(padel?.id ?? data[0].id);
      } else if (!sportId) {
        setSportId(data[0].id);
      } else if (!data.some((sport) => sport.id === sportId)) {
        setSportId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load sports", err);
      setSports([]);
    } finally {
      setLoadingSports(false);
    }
  }, [admin, sportId]);

  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true);
    try {
      const res = await apiFetch("/v0/players", { cache: "no-store" });
      const data = (await res.json()) as { players: PlayerOption[] };
      setPlayers(data.players || []);
    } catch (err) {
      console.error("Failed to load players", err);
      setPlayers([]);
    } finally {
      setLoadingPlayers(false);
    }
  }, []);

  const loadRulesets = useCallback(async (sport: string) => {
    if (!sport) {
      setRulesets([]);
      setRulesetId("");
      return;
    }
    setLoadingRulesets(true);
    try {
      const res = await apiFetch(
        `/v0/rulesets?sport=${encodeURIComponent(sport)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as RulesetOption[];
      setRulesets(data);
      if (data.length) {
        setRulesetId(data[0].id);
      } else {
        setRulesetId("");
      }
    } catch (err) {
      console.error("Failed to load rulesets", err);
      setRulesets([]);
      setRulesetId("");
    } finally {
      setLoadingRulesets(false);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    loadSports();
    loadPlayers();
  }, [loggedIn, loadSports, loadPlayers]);

  useEffect(() => {
    if (!loggedIn) return;
    loadRulesets(sportId);
  }, [loggedIn, sportId, loadRulesets]);

  const playerLookup = useMemo(() => {
    const map = new Map<string, PlayerInfo>();
    players.forEach((player) => {
      map.set(player.id, { id: player.id, name: player.name });
    });
    return map;
  }, [players]);

  const handlePlayerSelectionChange = useCallback(
    (playerIds: string[]) => {
      setError(null);
      setSuccess(null);
      setScheduledMatches([]);
      setSelectedPlayers(playerIds);
    },
    []
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
    setError(null);
    setSuccess(null);
    setScheduledMatches([]);

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
        setError(
          "Only padel Americano tournaments can be created without an admin account."
        );
      } else {
        setError("Unable to create tournament. Please try again.");
      }
    } finally {
      setCreating(false);
    }
  };

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
    let changed = false;
    setSelectedPlayers((previous) => {
      const additions = filteredPlayerIds.filter((id) => !previous.includes(id));
      if (additions.length === 0) {
        return previous;
      }
      changed = true;
      return [...previous, ...additions];
    });
    if (changed) {
      setError(null);
      setSuccess(null);
      setScheduledMatches([]);
    }
  }, [filteredPlayerIds]);

  const handleClearFilteredPlayers = useCallback(() => {
    if (!filteredPlayerIds.length) {
      return;
    }
    const removalSet = new Set(filteredPlayerIds);
    let changed = false;
    setSelectedPlayers((previous) => {
      if (!previous.some((id) => removalSet.has(id))) {
        return previous;
      }
      changed = true;
      return previous.filter((id) => !removalSet.has(id));
    });
    if (changed) {
      setError(null);
      setSuccess(null);
      setScheduledMatches([]);
    }
  }, [filteredPlayerIds]);

  const playerValidationMessage =
    selectedCount >= MIN_AMERICANO_PLAYERS
      ? `Ready to schedule with ${selectedCount} player${selectedCount === 1 ? "" : "s"}. Use the search box to adjust the roster.`
      : `Use the search box to add at least ${MIN_AMERICANO_PLAYERS} players before generating the Americano schedule.`;

  const title = admin
    ? "Admin: Create Americano tournament"
    : "Create an Americano tournament";

  return (
    <section className="card" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{title}</h2>
      {!admin && (
        <p className="form-hint" style={{ marginBottom: 12 }}>
          Padel is currently the only sport supported for self-service Americano
          tournaments.
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
                setError(null);
                setSuccess(null);
                setScheduledMatches([]);
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
                setError(null);
                setSuccess(null);
                setScheduledMatches([]);
              }}
              disabled={loadingSports || !admin}
            >
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.name}
                </option>
              ))}
            </select>
            {loadingSports && <p className="form-hint">Loading sports…</p>}
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
              disabled={loadingRulesets || rulesets.length === 0}
            >
              <option value="">Use sport default</option>
              {rulesets.map((ruleset) => (
                <option key={ruleset.id} value={ruleset.id}>
                  {ruleset.name}
                </option>
              ))}
            </select>
            {loadingRulesets && <p className="form-hint">Loading rulesets…</p>}
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
                setError(null);
                setSuccess(null);
                setScheduledMatches([]);
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
              loading={loadingPlayers}
              noOptionsMessage="No players are available yet."
              noResultsMessage={(query) => `No players match "${query}".`}
              onSearchChange={(value) => {
                setPlayerSearch(value);
                setSuccess(null);
              }}
              onSelectionChange={handlePlayerSelectionChange}
              options={players}
              placeholder="Start typing a name…"
              searchLabel="Search players"
              searchValue={playerSearch}
              selectedIds={selectedPlayers}
              selectedSummaryLabel={`${selectedCount} player${selectedCount === 1 ? "" : "s"} selected`}
            />
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
