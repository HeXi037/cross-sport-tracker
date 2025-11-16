"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FocusEvent,
} from "react";

import { fetchClubs, type ClubSummary } from "../lib/api";

function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\p{P}_]+/gu, "");
}

interface ClubSelectProps {
  value: string;
  onChange: (clubId: string) => void;
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  searchInputId?: string;
  selectId?: string;
  searchLabel?: string;
  describedById?: string;
  invalid?: boolean;
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
  searchInputId: searchInputIdProp,
  selectId: selectIdProp,
  searchLabel,
  describedById,
  invalid = false,
}: ClubSelectProps) {
  const reactId = useId();
  const [options, setOptions] = useState<ClubSummary[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [searchTerm, setSearchTerm] = useState("");
  const [dirtySearch, setDirtySearch] = useState(false);

  const searchInputId = searchInputIdProp ?? `${reactId}-club-search`;
  const selectId = selectIdProp ?? `${reactId}-club-select`;
  const loadingMessageId = `${reactId}-club-loading`;
  const errorMessageId = `${reactId}-club-error`;
  const describedByIds = [
    status === "loading" ? loadingMessageId : null,
    status === "error" ? errorMessageId : null,
    describedById ?? null,
  ].filter(Boolean);
  const ariaDescribedBy = describedByIds.length ? describedByIds.join(" ") : undefined;

  const invalidAttributes = invalid ? { "aria-invalid": true } : {};

  const searchLabelText =
    searchLabel ?? (ariaLabel ? `${ariaLabel} search` : "Search clubs");
  const selectAriaLabel =
    ariaLabel ?? (selectIdProp ? undefined : "Select club");

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

  const { matchingOptions, selectOptions } = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const normalizedQuery = normalizeSearchText(query);
    let filtered = options;
    if (query) {
      filtered = options.filter((club) => {
        const name = club.name.toLowerCase();
        const id = club.id.toLowerCase();
        if (name.includes(query) || id.includes(query)) {
          return true;
        }
        if (!normalizedQuery) {
          return false;
        }
        const normalizedName = normalizeSearchText(name);
        const normalizedId = normalizeSearchText(id);
        return (
          normalizedName.includes(normalizedQuery) ||
          normalizedId.includes(normalizedQuery)
        );
      });
    }
    const matching = [...filtered];
    if (value) {
      const selected = options.find((club) => club.id === value);
      if (selected) {
        filtered = [selected, ...filtered];
      } else if (!filtered.some((club) => club.id === value)) {
        filtered = [{ id: value, name: value }, ...filtered];
      }
    }
    const seen = new Set<string>();
    const selectList = filtered.filter((club) => {
      if (seen.has(club.id)) return false;
      seen.add(club.id);
      return true;
    });
    return { matchingOptions: matching, selectOptions: selectList };
  }, [options, searchTerm, value]);

  useEffect(() => {
    if (disabled) {
      return;
    }
    if (status === "idle") {
      void loadOptions();
    }
  }, [disabled, loadOptions, status]);

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

  const clearButtonAriaLabel = useMemo(
    () =>
      ariaLabel ? `Clear ${ariaLabel} selection` : "Clear club selection",
    [ariaLabel]
  );

  const suggestionListId = `${reactId}-club-suggestions`;

  const handleSuggestionSelect = useCallback(
    (club: ClubSummary) => {
      if (disabled) return;
      setDirtySearch(false);
      setSearchTerm(club.name);
      onChange(club.id);
    },
    [disabled, onChange]
  );

  return (
    <div className={className} style={{ display: "grid", gap: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <label htmlFor={searchInputId} className="sr-only">
          {searchLabelText}
        </label>
        <input
          id={searchInputId}
          type="text"
          value={searchTerm}
          onChange={handleSearchChange}
          onFocus={handleFocus}
          placeholder={placeholder}
          aria-describedby={ariaDescribedBy}
          aria-controls={searchTerm.trim() ? suggestionListId : undefined}
          disabled={disabled}
          autoComplete="off"
          style={{ flex: 1 }}
          {...invalidAttributes}
        />
        <button
          type="button"
          onClick={clearSelection}
          disabled={disabled || (!value && !searchTerm)}
          aria-label={clearButtonAriaLabel}
          aria-describedby={ariaDescribedBy}
        >
          Clear
        </button>
      </div>
      {searchTerm.trim() && matchingOptions.length ? (
        <ul
          id={suggestionListId}
          role="listbox"
          aria-label="Club suggestions"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "0.5rem",
            maxHeight: "12rem",
            overflowY: "auto",
          }}
        >
          {matchingOptions.slice(0, 5).map((club) => (
            <li key={club.id}>
              <button
                type="button"
                onClick={() => handleSuggestionSelect(club)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.5rem 0.75rem",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                aria-label={`Select ${club.name}`}
              >
                {club.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <select
        id={selectId}
        value={value}
        onChange={handleSelectChange}
        onFocus={handleFocus}
        disabled={disabled}
        style={{ width: "100%" }}
        aria-label={selectAriaLabel}
        aria-describedby={ariaDescribedBy}
        {...invalidAttributes}
      >
        <option value="">No club selected</option>
        {selectOptions.length ? (
          selectOptions.map((club) => (
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
        <span
          id={loadingMessageId}
          style={{ fontSize: "0.85rem", color: "#555" }}
          role="status"
          aria-live="polite"
        >
          Loading clubs…
        </span>
      ) : null}
      {status === "error" ? (
        <span
          id={errorMessageId}
          style={{ fontSize: "0.85rem", color: "#b91c1c" }}
          role="alert"
        >
          Failed to load clubs. Focus the field to try again.
        </span>
      ) : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
