"use client";

import { type ChangeEvent, type SelectHTMLAttributes } from "react";

import { COUNTRY_OPTIONS } from "../lib/countries";

export type CountrySelectProps = {
  value: string;
  onChange: (countryCode: string) => void;
  placeholder?: string;
  includeEmptyOption?: boolean;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">;

export default function CountrySelect({
  value,
  onChange,
  placeholder = "Select a country",
  includeEmptyOption = true,
  ...rest
}: CountrySelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value.trim().toUpperCase();
    onChange(nextValue);
  };

  return (
    <select value={value} onChange={handleChange} {...rest}>
      {includeEmptyOption ? <option value="">{placeholder}</option> : null}
      {COUNTRY_OPTIONS.map((option) => (
        <option key={option.code} value={option.code}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
