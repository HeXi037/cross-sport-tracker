import React from "react";

interface PadelAmericanoTargetFieldProps {
  value: string;
  onChange: (next: string) => void;
  label: string;
  hint: string;
  targetHintId: string;
}

export function PadelAmericanoTargetField({
  value,
  onChange,
  label,
  hint,
  targetHintId,
}: PadelAmericanoTargetFieldProps) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor="record-padel-americano-target">
        {label}
      </label>
      <input
        id="record-padel-americano-target"
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={targetHintId}
      />
      <p id={targetHintId} className="form-hint">
        {hint}
      </p>
    </div>
  );
}
