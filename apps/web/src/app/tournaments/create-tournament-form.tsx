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
  type StageScheduleMatch,
  type TournamentSummary,
} from "../../lib/api";
import type { PlayerInfo } from "../../components/PlayerName";
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

export default function CreateTournamentForm({
  onCreated,
}: CreateTournamentFormProps) {
  const [admin, setAdmin] = useState(() => isAdmin());
  const [sports, setSports] = useState<SportOption[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [rulesets, setRulesets] = useState<RulesetOption[]>([]);
  const [sportId, setSportId] = useState("");
  const [rulesetId, setRulesetId] = useState("");
  const [name, setName] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [loadingSports, setLoadingSports] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [loadingRulesets, setLoadingRulesets] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scheduledMatches, setScheduledMatches] = useState<StageScheduleMatch[]>([]);

  useEffect(() => {
    const update = () => setAdmin(isAdmin());
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);

  const loadSports = useCallback(async () => {
    setLoadingSports(true);
    try {
      const res = await apiFetch("/v0/sports", { cache: "no-store" });
      const data = (await res.json()) as SportOption[];
      setSports(data);
      if (!sportId && data.length) {
        setSportId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load sports", err);
      setSports([]);
    } finally {
      setLoadingSports(false);
    }
  }, [sportId]);

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
    if (!admin) return;
    loadSports();
    loadPlayers();
  }, [admin, loadSports, loadPlayers]);

  useEffect(() => {
    if (!admin) return;
    loadRulesets(sportId);
  }, [admin, sportId, loadRulesets]);

  const playerLookup = useMemo(() => {
    const map = new Map<string, PlayerInfo>();
    players.forEach((player) => {
      map.set(player.id, { id: player.id, name: player.name });
    });
    return map;
  }, [players]);

  const handlePlayerToggle = (playerId: string) => {
    setError(null);
    setSuccess(null);
    setScheduledMatches([]);
    setSelectedPlayers((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      return [...prev, playerId];
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;

    const trimmedName = name.trim();
    if (!trimmedName || !sportId) {
      setError("Enter a name and select a sport.");
      return;
    }

    if (
      selectedPlayers.length < MIN_AMERICANO_PLAYERS ||
      selectedPlayers.length % 2 !== 0
    ) {
      setError("Americano tournaments require an even number of at least four players.");
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
    } catch (err) {
      console.error("Failed to create tournament", err);
      setError("Unable to create tournament. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  if (!admin) {
    return null;
  }

  const selectedCount = selectedPlayers.length;
  const playerValidationMessage = selectedCount
    ? `${selectedCount} player${selectedCount === 1 ? "" : "s"} selected`
    : "Select players to include in the Americano schedule.";

  return (
    <section className="card" style={{ padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
        Admin: Create Americano tournament
      </h2>
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
              disabled={loadingSports}
            >
              {sports.map((sport) => (
                <option key={sport.id} value={sport.id}>
                  {sport.name}
                </option>
              ))}
            </select>
            {loadingSports && <p className="form-hint">Loading sports…</p>}
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
          <fieldset className="form-fieldset">
            <legend className="form-legend">Players</legend>
            {loadingPlayers ? (
              <p className="form-hint">Loading players…</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                }}
              >
                {players.map((player) => {
                  const checkboxId = `player-${player.id}`;
                  const checked = selectedPlayers.includes(player.id);
                  return (
                    <label
                      key={player.id}
                      className="form-field"
                      htmlFor={checkboxId}
                      style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={checked}
                        onChange={() => handlePlayerToggle(player.id)}
                      />
                      <span className="form-label" style={{ margin: 0 }}>
                        {player.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
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
