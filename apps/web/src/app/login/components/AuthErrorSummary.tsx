interface AuthErrorSummaryProps {
  loginErrors: string[];
  signupErrors: string[];
  errorSummaryTitleId: string;
  loginErrorTitleId: string;
  signupErrorTitleId: string;
}

export function AuthErrorSummary({
  loginErrors,
  signupErrors,
  errorSummaryTitleId,
  loginErrorTitleId,
  signupErrorTitleId,
}: AuthErrorSummaryProps) {
  if (loginErrors.length === 0 && signupErrors.length === 0) {
    return null;
  }

  return (
    <section
      className="auth-error-summary"
      role="alert"
      aria-labelledby={errorSummaryTitleId}
      aria-live="assertive"
    >
      <h2 id={errorSummaryTitleId}>There was a problem signing in</h2>
      {loginErrors.length > 0 && (
        <div className="auth-error-summary__group" aria-labelledby={loginErrorTitleId}>
          <h3 id={loginErrorTitleId}>Login</h3>
          <ul>
            {loginErrors.map((message, index) => (
              <li key={`login-error-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      )}
      {signupErrors.length > 0 && (
        <div className="auth-error-summary__group" aria-labelledby={signupErrorTitleId}>
          <h3 id={signupErrorTitleId}>Sign Up</h3>
          <ul>
            {signupErrors.map((message, index) => (
              <li key={`signup-error-${index}`}>{message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
