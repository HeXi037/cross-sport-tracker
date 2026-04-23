"use client";

import {
  type InputHTMLAttributes,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { COUNTRY_OPTIONS, type CountryOption } from "../../lib/countries";

export type CountrySelectProps = {
  value: string;
  onChange: (countryCode: string) => void;
  options?: readonly CountryOption[];
  placeholder?: string;
  includeEmptyOption?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

export default function CountrySelect({
  value,
  onChange,
  options = COUNTRY_OPTIONS,
  placeholder = "Select a country",
  includeEmptyOption = true,
  ...rest
}: CountrySelectProps) {
  const reactId = useId();
  const listboxId = `${reactId}-country-listbox`;
  const selectedOption = useMemo(
    () => options.find((option) => option.code === value) ?? null,
    [options, value],
  );

  const [inputValue, setInputValue] = useState(selectedOption?.name ?? "");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const shouldKeepOpenOnBlurRef = useRef(false);

  useEffect(() => {
    setInputValue(selectedOption?.name ?? "");
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    const search = inputValue.trim().toLowerCase();
    const countryMatches = options.filter((option) => {
      if (!search) {
        return true;
      }
      return (
        option.name.toLowerCase().includes(search) ||
        option.code.toLowerCase().includes(search)
      );
    });

    if (includeEmptyOption) {
      return [{ code: "", name: placeholder }, ...countryMatches];
    }
    return countryMatches;
  }, [includeEmptyOption, inputValue, options, placeholder]);

  const activeOption =
    activeIndex >= 0 && activeIndex < filteredOptions.length
      ? filteredOptions[activeIndex]
      : null;

  const commitSelection = (countryCode: string) => {
    const normalizedValue = countryCode.trim().toUpperCase();
    const option = options.find((entry) => entry.code === normalizedValue);
    onChange(normalizedValue);
    setInputValue(option?.name ?? "");
    setIsOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div style={{ position: "relative" }}>
      <input
        {...rest}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeOption ? `${listboxId}-${activeOption.code || "empty"}` : undefined}
        autoComplete="off"
        value={inputValue}
        placeholder={placeholder}
        onFocus={() => {
          setIsOpen(true);
        }}
        onBlur={() => {
          if (shouldKeepOpenOnBlurRef.current) {
            shouldKeepOpenOnBlurRef.current = false;
            return;
          }
          setIsOpen(false);
          setActiveIndex(-1);
          setInputValue(selectedOption?.name ?? "");
        }}
        onChange={(event) => {
          setInputValue(event.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              setActiveIndex(filteredOptions.length ? 0 : -1);
              return;
            }
            if (!filteredOptions.length) {
              return;
            }
            setActiveIndex((previous) =>
              previous < filteredOptions.length - 1 ? previous + 1 : 0,
            );
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              setActiveIndex(filteredOptions.length ? filteredOptions.length - 1 : -1);
              return;
            }
            if (!filteredOptions.length) {
              return;
            }
            setActiveIndex((previous) =>
              previous > 0 ? previous - 1 : filteredOptions.length - 1,
            );
            return;
          }
          if (event.key === "Enter") {
            if (!isOpen) {
              return;
            }
            event.preventDefault();
            if (activeOption) {
              commitSelection(activeOption.code);
              return;
            }
            if (filteredOptions.length === 1) {
              commitSelection(filteredOptions[0].code);
            }
            return;
          }
          if (event.key === "Escape") {
            if (!isOpen) {
              return;
            }
            event.preventDefault();
            setIsOpen(false);
            setActiveIndex(-1);
            setInputValue(selectedOption?.name ?? "");
          }
        }}
      />

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            listStyle: "none",
            margin: "0.25rem 0 0",
            padding: "0.25rem",
            position: "absolute",
            zIndex: 20,
            width: "100%",
            maxHeight: "14rem",
            overflowY: "auto",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "6px",
            background: "var(--color-surface)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => {
              const optionId = `${listboxId}-${option.code || "empty"}`;
              const isActive = index === activeIndex;
              return (
                <li
                  key={option.code || "__empty"}
                  id={optionId}
                  role="option"
                  aria-selected={value === option.code}
                  onMouseDown={() => {
                    shouldKeepOpenOnBlurRef.current = true;
                  }}
                  onClick={() => {
                    commitSelection(option.code);
                  }}
                  style={{
                    cursor: "pointer",
                    padding: "0.35rem 0.5rem",
                    borderRadius: "4px",
                    background: isActive
                      ? "var(--color-surface-elevated, #f4f4f4)"
                      : "transparent",
                  }}
                >
                  {option.name}
                  {option.code ? ` (${option.code})` : ""}
                </li>
              );
            })
          ) : (
            <li
              role="option"
              aria-disabled
              style={{ padding: "0.35rem 0.5rem", color: "var(--color-text-muted)" }}
            >
              No matching countries
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
