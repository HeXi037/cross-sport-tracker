import { type FormEventHandler } from "react";

import { signupGuidelines, type UsernameAvailabilityState } from "../hooks/useSignupForm";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter";

interface SignupFormProps {
  showSignup: boolean;
  onToggleSignup: () => void;
  signupFormId: string;
  newUser: string;
  newPass: string;
  confirmPass: string;
  usernameGuidelines: string[];
  usernameAvailability: UsernameAvailabilityState;
  passwordStrength: Parameters<typeof PasswordStrengthMeter>[0]["strength"];
  passwordStrengthLabelId: string;
  passwordStrengthHelperId: string;
  passwordStrengthDescription: string;
  signupErrors: string[];
  onSubmit: FormEventHandler<HTMLFormElement>;
  onUsernameChange: (value: string) => void;
  onUsernameBlur: () => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
}

export function SignupForm({
  showSignup,
  onToggleSignup,
  signupFormId,
  newUser,
  newPass,
  confirmPass,
  usernameGuidelines,
  usernameAvailability,
  passwordStrength,
  passwordStrengthDescription,
  passwordStrengthHelperId,
  passwordStrengthLabelId,
  signupErrors,
  onSubmit,
  onUsernameChange,
  onUsernameBlur,
  onPasswordChange,
  onConfirmPasswordChange,
}: SignupFormProps) {
  return (
    <section className="auth-signup">
      <div className="auth-signup__header">
        <h2 className="heading">Need an account?</h2>
        <button
          type="button"
          className="auth-signup__toggle"
          onClick={onToggleSignup}
          aria-expanded={showSignup}
          aria-controls={signupFormId}
        >
          {showSignup ? "Hide sign up form" : "Create an account"}
        </button>
      </div>
      <p
        className="auth-signup__description"
        style={{ margin: "0.5rem 0 0", color: "#4b5563", fontSize: "0.95rem" }}
      >
        After creating your account, we’ll take you to your profile so you can customize
        preferences like language and time zone.
      </p>
      {showSignup && (
        <form
          id={signupFormId}
          onSubmit={onSubmit}
          className="auth-form auth-signup__form"
          data-testid="signup-form"
        >
          <div className="form-field">
            <label htmlFor="signup-username" className="form-label">
              Username
            </label>
            <input
              id="signup-username"
              type="text"
              value={newUser}
              onChange={(e) => onUsernameChange(e.target.value)}
              onBlur={onUsernameBlur}
              autoComplete="username"
              required
            />
            <ul className="password-guidelines">
              {usernameGuidelines.map((guideline) => (
                <li key={guideline} className="password-guidelines__item">
                  <span className="password-guidelines__status" aria-hidden="true">
                    •
                  </span>
                  {guideline}
                </li>
              ))}
            </ul>
            {usernameAvailability.status === "checking" && (
              <p className="auth-form__hint" role="status" aria-live="polite">
                Checking username availability…
              </p>
            )}
            {usernameAvailability.status === "available" && (
              <p
                className="auth-form__hint auth-form__hint--success"
                role="status"
                aria-live="polite"
              >
                Username is available.
              </p>
            )}
            {(usernameAvailability.status === "unavailable" ||
              usernameAvailability.status === "error") && (
              <p
                className="auth-form__hint auth-form__hint--error"
                role="status"
                aria-live="polite"
              >
                {usernameAvailability.message}
              </p>
            )}
          </div>
          <div className="form-field">
            <label htmlFor="signup-password" className="form-label">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              value={newPass}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoComplete="new-password"
              required
            />
            <ul className="password-guidelines" aria-live="polite">
              {signupGuidelines.map((guideline) => (
                <li key={guideline} className="password-guidelines__item">
                  <span className="password-guidelines__status" aria-hidden="true">
                    •
                  </span>
                  {guideline}
                </li>
              ))}
            </ul>
            <PasswordStrengthMeter
              strength={passwordStrength}
              labelId={passwordStrengthLabelId}
              helperId={passwordStrengthHelperId}
              descriptionId={passwordStrengthDescription}
            />
          </div>
          <div className="form-field">
            <label htmlFor="signup-confirm-password" className="form-label">
              Confirm Password
            </label>
            <input
              id="signup-confirm-password"
              type="password"
              value={confirmPass}
              onChange={(e) => onConfirmPasswordChange(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {signupErrors.length > 0 && (
            <div className="auth-form__error" aria-live="polite">
              Please review the issues listed above before continuing.
            </div>
          )}
          <button type="submit">Sign Up</button>
        </form>
      )}
    </section>
  );
}
