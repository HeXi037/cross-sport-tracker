import { type FormEventHandler } from "react";

interface LoginFormProps {
  username: string;
  password: string;
  errors: string[];
  onSubmit: FormEventHandler<HTMLFormElement>;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

export function LoginForm({
  username,
  password,
  errors,
  onSubmit,
  onUsernameChange,
  onPasswordChange,
}: LoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="auth-form">
      {errors.length > 0 && (
        <div className="auth-form__error" aria-live="polite">
          {errors[0]}
        </div>
      )}
      <div className="form-field">
        <label htmlFor="login-username" className="form-label">
          Username
        </label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={(e) => onUsernameChange(e.target.value)}
          autoComplete="username"
          required
        />
      </div>
      <div className="form-field">
        <label htmlFor="login-password" className="form-label">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <button type="submit">Login</button>
    </form>
  );
}
