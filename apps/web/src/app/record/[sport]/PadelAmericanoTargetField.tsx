type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  hint: string;
  targetHintId: string;
};

export function PadelAmericanoTargetField({ value, onChange, label, hint, targetHintId }: Props) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor="padel-americano-target">
        {label}
      </label>
      <input
        id="padel-americano-target"
        type="number"
        min={1}
        max={99}
        step="1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={targetHintId}
        inputMode="numeric"
      />
      <span id={targetHintId} className="form-hint">
        {hint}
      </span>
    </div>
  );
}
