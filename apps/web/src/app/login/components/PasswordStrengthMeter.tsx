import { type PasswordStrengthResult } from "../services/passwordStrength";

interface PasswordStrengthMeterProps {
  strength: PasswordStrengthResult;
  labelId: string;
  helperId: string;
  descriptionId: string;
}

export function PasswordStrengthMeter({
  strength,
  labelId,
  helperId,
  descriptionId,
}: PasswordStrengthMeterProps) {
  return (
    <div className="password-strength" aria-live="polite">
      <div
        className="password-strength__meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.score}
        aria-describedby={descriptionId}
      >
        {Array.from({ length: 4 }, (_, index) => {
          const isActive = strength.activeSegments > index;
          const variantClass = isActive
            ? ` password-strength__segment--${strength.variant}`
            : "";
          const activeClass = isActive ? " password-strength__segment--active" : "";
          return (
            <span
              key={`password-strength-segment-${index}`}
              className={`password-strength__segment${activeClass}${variantClass}`}
              aria-hidden="true"
            />
          );
        })}
      </div>
      <div id={labelId} className="password-strength__label">
        Password strength: {strength.label}
      </div>
      {strength.showTips && (
        <p id={helperId} className="password-strength__helper">
          {strength.helper}
        </p>
      )}
    </div>
  );
}
