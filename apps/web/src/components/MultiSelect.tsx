"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from "react";

interface MultiSelectOption {
  id: string;
  name: string;
}

interface MultiSelectProps {
  ariaLabel?: string;
  id?: string;
  loading?: boolean;
  noOptionsMessage?: string;
  noResultsMessage?: (query: string) => string;
  onSearchChange?: (value: string) => void;
  onSelectionChange: (ids: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchLabel?: string;
  searchValue?: string;
  selectedIds: string[];
  selectedSummaryLabel?: string;
}

const ITEM_HEIGHT = 40;
const VISIBLE_ITEM_COUNT = 7;
const OVERSCAN = 4;

function ensureOptionVisible(
  containerRef: MutableRefObject<HTMLDivElement | null>,
  index: number | null
) {
  const container = containerRef.current;
  if (!container || index === null) {
    return;
  }
  const optionTop = index * ITEM_HEIGHT;
  const optionBottom = optionTop + ITEM_HEIGHT;
  const scrollTop = container.scrollTop;
  const viewBottom = scrollTop + container.clientHeight;

  if (optionTop < scrollTop) {
    container.scrollTop = optionTop;
  } else if (optionBottom > viewBottom) {
    container.scrollTop = optionBottom - container.clientHeight;
  }
}

export default function MultiSelect({
  ariaLabel,
  id,
  loading = false,
  noOptionsMessage = "No options available.",
  noResultsMessage = (query) => `No results for "${query}".`,
  onSearchChange,
  onSelectionChange,
  options,
  placeholder = "Start typing…",
  searchLabel = "Search",
  searchValue,
  selectedIds,
  selectedSummaryLabel,
}: MultiSelectProps) {
  const generatedId = useId();
  const listboxId = id ? `${id}-listbox` : `multi-select-${generatedId}-listbox`;
  const searchInputId = id ? `${id}-search` : `multi-select-${generatedId}-search`;
  const summaryId = `${listboxId}-summary`;
  const searchDescriptionId = selectedSummaryLabel ? summaryId : undefined;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [internalSearch, setInternalSearch] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [activeOptionIndex, setActiveOptionIndex] = useState<number | null>(null);

  const effectiveSearch = searchValue ?? internalSearch;
  const trimmedSearch = effectiveSearch.trim();
  const trimmedQuery = trimmedSearch.toLowerCase();

  const optionLookup = useMemo(() => {
    const map = new Map<string, MultiSelectOption>();
    options.forEach((option) => {
      map.set(option.id, option);
    });
    return map;
  }, [options]);

  const selectedOptions = useMemo(() => {
    return selectedIds
      .map((selectedId) => optionLookup.get(selectedId))
      .filter((option): option is MultiSelectOption => Boolean(option));
  }, [optionLookup, selectedIds]);

  const filteredOptions = useMemo(() => {
    if (!trimmedQuery) {
      return options;
    }
    const words = trimmedQuery.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return options;
    }
    return options.filter((option) => {
      const lower = option.name.toLowerCase();
      return words.every((word) => lower.includes(word));
    });
  }, [options, trimmedQuery]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [trimmedQuery, options.length]);

  useEffect(() => {
    if (filteredOptions.length === 0) {
      setActiveOptionIndex(null);
      return;
    }
    setActiveOptionIndex((previous) => {
      if (previous === null || previous >= filteredOptions.length) {
        return 0;
      }
      return previous;
    });
  }, [filteredOptions]);

  useEffect(() => {
    ensureOptionVisible(listRef, activeOptionIndex);
  }, [activeOptionIndex]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    setScrollTop(listRef.current.scrollTop);
  }, []);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      if (onSearchChange) {
        onSearchChange(value);
      } else {
        setInternalSearch(value);
      }
    },
    [onSearchChange]
  );

  const toggleOption = useCallback(
    (optionId: string) => {
      const alreadySelected = selectedIds.includes(optionId);
      if (alreadySelected) {
        onSelectionChange(selectedIds.filter((id) => id !== optionId));
      } else {
        onSelectionChange([...selectedIds, optionId]);
      }
    },
    [onSelectionChange, selectedIds]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (filteredOptions.length === 0) {
          return;
        }
        setActiveOptionIndex((previous) => {
          if (previous === null) {
            return 0;
          }
          const nextIndex = Math.min(previous + 1, filteredOptions.length - 1);
          ensureOptionVisible(listRef, nextIndex);
          return nextIndex;
        });
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (filteredOptions.length === 0) {
          return;
        }
        setActiveOptionIndex((previous) => {
          if (previous === null) {
            return filteredOptions.length - 1;
          }
          const nextIndex = Math.max(previous - 1, 0);
          ensureOptionVisible(listRef, nextIndex);
          return nextIndex;
        });
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        if (filteredOptions.length > 0) {
          setActiveOptionIndex(0);
          ensureOptionVisible(listRef, 0);
        }
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        if (filteredOptions.length > 0) {
          const lastIndex = filteredOptions.length - 1;
          setActiveOptionIndex(lastIndex);
          ensureOptionVisible(listRef, lastIndex);
        }
        return;
      }
      if (event.key === "Enter" && activeOptionIndex !== null) {
        event.preventDefault();
        const option = filteredOptions[activeOptionIndex];
        if (option) {
          toggleOption(option.id);
        }
        return;
      }
      if (event.key === "Backspace" && !effectiveSearch) {
        if (selectedIds.length > 0) {
          event.preventDefault();
          const nextSelection = selectedIds.slice(0, -1);
          onSelectionChange(nextSelection);
        }
        return;
      }
    },
    [
      activeOptionIndex,
      effectiveSearch,
      filteredOptions,
      onSelectionChange,
      selectedIds,
      toggleOption,
    ]
  );

  const handleChipKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, optionId: string) => {
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        toggleOption(optionId);
      }
    },
    [toggleOption]
  );

  const handleOptionMouseEnter = useCallback((absoluteIndex: number) => {
    setActiveOptionIndex(absoluteIndex);
  }, []);

  const handleOptionClick = useCallback(
    (optionId: string, absoluteIndex: number) => {
      toggleOption(optionId);
      setActiveOptionIndex(absoluteIndex);
    },
    [toggleOption]
  );

  const totalHeight = filteredOptions.length * ITEM_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    filteredOptions.length,
    Math.ceil((scrollTop + ITEM_HEIGHT * VISIBLE_ITEM_COUNT) / ITEM_HEIGHT) + OVERSCAN
  );
  const visibleOptions = filteredOptions.slice(startIndex, endIndex);
  const topSpacer = startIndex * ITEM_HEIGHT;
  const bottomSpacer = Math.max(totalHeight - endIndex * ITEM_HEIGHT, 0);

  const hasQuery = trimmedQuery.length > 0;
  const emptyMessage = options.length === 0
    ? noOptionsMessage
    : hasQuery
    ? noResultsMessage(trimmedSearch)
    : noOptionsMessage;

  const activeDescendantId =
    activeOptionIndex !== null && filteredOptions[activeOptionIndex]
      ? `${listboxId}-option-${filteredOptions[activeOptionIndex].id}`
      : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span className="form-label" id={`${listboxId}-selected-label`}>
            Selected players
          </span>
          {selectedSummaryLabel ? (
            <span
              className="form-hint"
              id={summaryId}
              aria-live="polite"
              style={{ marginLeft: "auto" }}
            >
              {selectedSummaryLabel}
            </span>
          ) : null}
        </div>
        {selectedOptions.length > 0 ? (
          <ul
            aria-labelledby={`${listboxId}-selected-label`}
            style={{
              listStyle: "none",
              margin: "8px 0 0",
              padding: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {selectedOptions.map((option) => (
              <li
                key={option.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  borderRadius: 9999,
                  backgroundColor: "var(--multiselect-chip-bg)",
                  border: "1px solid var(--multiselect-chip-border)",
                  color: "var(--multiselect-chip-text)",
                }}
              >
                <span>{option.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${option.name}`}
                  onClick={() => toggleOption(option.id)}
                  onKeyDown={(event) => handleChipKeyDown(event, option.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--multiselect-chip-remove)",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="form-hint" style={{ marginTop: 8 }}>
            No players selected yet.
          </p>
        )}
      </div>
      <div className="form-field">
        <label className="form-label" htmlFor={searchInputId}>
          {searchLabel}
        </label>
        <input
          id={searchInputId}
          type="search"
          value={effectiveSearch}
          onChange={(event) => handleSearchInputChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-autocomplete="list"
          aria-describedby={searchDescriptionId}
          autoComplete="off"
        />
      </div>
      <div
        id={listboxId}
        role="listbox"
        aria-multiselectable
        aria-label={ariaLabel}
        aria-describedby={selectedSummaryLabel ? summaryId : undefined}
        aria-busy={loading}
        ref={listRef}
        onScroll={handleScroll}
        style={{
          border: "1px solid var(--multiselect-border)",
          borderRadius: 8,
          padding: 4,
          backgroundColor: "var(--multiselect-surface)",
          maxHeight: ITEM_HEIGHT * VISIBLE_ITEM_COUNT,
          overflowY: "auto",
        }}
      >
        {loading ? (
          <p className="form-hint" role="status" style={{ padding: 8 }}>
            Loading…
          </p>
        ) : filteredOptions.length > 0 ? (
          <div style={{ position: "relative", height: totalHeight || ITEM_HEIGHT }}>
            <div style={{ height: topSpacer }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {visibleOptions.map((option, index) => {
                const absoluteIndex = startIndex + index;
                const isSelected = selectedIds.includes(option.id);
                const isActive = activeOptionIndex === absoluteIndex;
                const optionId = `${listboxId}-option-${option.id}`;
                const optionBackgroundColor = isActive
                  ? "var(--multiselect-option-bg-active)"
                  : isSelected
                  ? "var(--multiselect-option-bg-selected)"
                  : "var(--multiselect-option-bg)";
                const optionBorderColor = isActive
                  ? "var(--multiselect-option-border-active)"
                  : "var(--multiselect-option-border)";
                return (
                  <div
                    id={optionId}
                    key={option.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => handleOptionMouseEnter(absoluteIndex)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleOptionClick(option.id, absoluteIndex)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid",
                      borderColor: optionBorderColor,
                      backgroundColor: optionBackgroundColor,
                      cursor: "pointer",
                    }}
                  >
                    <span>{option.name}</span>
                    {isSelected ? <span aria-hidden="true">✓</span> : null}
                  </div>
                );
              })}
            </div>
            <div style={{ height: bottomSpacer }} />
          </div>
        ) : (
          <p className="form-hint" role="status" style={{ padding: 8 }}>
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
