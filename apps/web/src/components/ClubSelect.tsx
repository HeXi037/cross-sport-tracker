"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FocusEvent,
} from "react";

import { fetchClubs, type ClubSummary } from "../lib/api";

interface ClubSelectProps {
  value: string;
  onChange: (clubId: string) => void;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

type LoadStatus = "idle" | "loading" | "loaded" | "error";

export default function ClubSelect({
  value,
  onChange,
  placeholder = "Select a club",
  name,
  disabled = false,
  className,
  ariaLabel,
}: ClubSelectProps) {
  const [options, setOptions] = useState<ClubSummary[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [searchTerm, setSearchTerm] = useState("");
  const [dirtySearch, setDirtySearch] = useState(false);

  const loadOptions = useCallback(async () => {
    if (status === "loading" || status === "loaded") {
      return;
    }
    setStatus("loading");
    try {
      const clubs = await fetchClubs();
      const sorted = [...clubs].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
      setOptions(sorted);
      setStatus("loaded");
    } catch (err) {
      console.error("Failed to load clubs", err);
      setStatus("error");
    }
  }, [status]);

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (disabled) {
        return;
      }
      void loadOptions();
      if (!dirtySearch && value && event.currentTarget instanceof HTMLInputElement) {
        const selected = options.find((club) => club.id === value);
        if (selected) {
          setSearchTerm(selected.name);
        }
      }
    },
    [disabled, dirtySearch, loadOptions, options, value]
  );

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setDirtySearch(true);
      setSearchTerm(event.target.value);
    },
    []
  );

  const optionList = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    let filtered = options;
    if (query) {
      filtered = options.filter((club) => {
        const name = club.name.toLowerCase();
        const id = club.id.toLowerCase();
        return name.includes(query) || id.includes(query);
      });
    }
    if (value) {
      const selected = options.find((club) => club.id === value);
      if (selected) {
        filtered = [selected, ...filtered];
      } else if (!filtered.some((club) => club.id === value)) {
        filtered = [{ id: value, name: value }, ...filtered];
      }
    }
    const seen = new Set<string>();
    return filtered.filter((club) => {
      if (seen.has(club.id)) return false;
      seen.add(club.id);
      return true;
    });
  }, [options, searchTerm, value]);

  useEffect(() => {
    if (dirtySearch) {
      return;
    }
    if (!value) {
      setSearchTerm((prev) => (prev ? "" : prev));
      return;
    }
    const selected = options.find((club) => club.id === value);
    const next = selected ? selected.name : value;
    setSearchTerm((prev) => (prev === next ? prev : next));
  }, [dirtySearch, options, value]);

  const handleSelectChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextValue = event.target.value.trim();
      setDirtySearch(false);
      onChange(nextValue);
    },
    [onChange]
  );

  const clearSelection = useCallback(() => {
    if (disabled) return;
    setDirtySearch(false);
    onChange("");
  }, [disabled, onChange]);

  return (
    <div className={className} style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          aria-label={ariaLabel ?? "Club search"}
          disabled={disabled}
          autoComplete="off"
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={clearSelection}
          disabled={disabled || (!value && !searchTerm)}
        >
          Clear
        </button>
      </div>
      <select
        value={value}
        onChange={handleSelectChange}
        onFocus={handleFocus}
        disabled={disabled}
        style={{ width: "100%" }}
        aria-label={ariaLabel ?? "Select club"}
      >
        <option value="">No club selected</option>
        {optionList.length ? (
          optionList.map((club) => (
            <option key={club.id} value={club.id}>
              {club.name}
            </option>
          ))
        ) : (
          <option value="" disabled>
            {status === "loading" ? "Loading clubs…" : "No clubs found"}
          </option>
        )}
      </select>
      {status === "loading" ? (
        <span style={{ fontSize: "0.85rem", color: "#555" }}>
          Loading clubs…
        </span>
      ) : null}
      {status === "error" ? (
        <span style={{ fontSize: "0.85rem", color: "#b91c1c" }}>
          Failed to load clubs. Focus the field to try again.
        </span>
      ) : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
