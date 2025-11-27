"use client";

import { useId, useState } from "react";

import { currentUsername, logout } from "../../lib/api";
import { AuthErrorSummary } from "./components/AuthErrorSummary";
import { LoginForm } from "./components/LoginForm";
import { SignupForm } from "./components/SignupForm";
import { useLoginForm } from "./hooks/useLoginForm";
import { useSignupForm } from "./hooks/useSignupForm";

export default function LoginPage() {
  const loginErrorTitleId = useId();
  const [user, setUser] = useState(currentUsername());

  const {
    username,
    setUsername,
    password,
    setPassword,
    errors: loginErrors,
    handleLogin,
  } = useLoginForm({
    onSuccess: () => setUser(currentUsername()),
  });

  const {
    showSignup,
    setShowSignup,
    newUser,
    newPass,
    setNewPass,
    confirmPass,
    setConfirmPass,
    signupErrors,
    handleSignup,
    usernameGuidelines,
    usernameAvailability,
    handleSignupUsernameChange,
    handleSignupUsernameBlur,
    passwordStrength,
    passwordStrengthLabelId,
    passwordStrengthHelperId,
    passwordStrengthDescription,
    signupFormId,
    errorSummaryTitleId,
    signupErrorTitleId,
    setSignupErrors,
  } = useSignupForm({
    onSuccess: () => setUser(currentUsername()),
  });

  if (user) {
    return (
      <main className="container">
        <h1 className="heading">Logged in as {user}</h1>
        <button
          onClick={() => {
            logout();
            setUser(null);
          }}
        >
          Logout
        </button>
      </main>
    );
  }

  return (
    <main className="container">
      <h1 className="heading">Login</h1>
      <AuthErrorSummary
        loginErrors={loginErrors}
        signupErrors={signupErrors}
        errorSummaryTitleId={errorSummaryTitleId}
        loginErrorTitleId={loginErrorTitleId}
        signupErrorTitleId={signupErrorTitleId}
      />
      <LoginForm
        username={username}
        password={password}
        errors={loginErrors}
        onSubmit={handleLogin}
        onUsernameChange={(value) => {
          setSignupErrors([]);
          setUsername(value);
        }}
        onPasswordChange={(value) => {
          setSignupErrors([]);
          setPassword(value);
        }}
      />
      <SignupForm
        showSignup={showSignup}
        onToggleSignup={() => setShowSignup((prev) => !prev)}
        signupFormId={signupFormId}
        newUser={newUser}
        newPass={newPass}
        confirmPass={confirmPass}
        usernameGuidelines={usernameGuidelines}
        usernameAvailability={usernameAvailability}
        passwordStrength={passwordStrength}
        passwordStrengthDescription={passwordStrengthDescription}
        passwordStrengthHelperId={passwordStrengthHelperId}
        passwordStrengthLabelId={passwordStrengthLabelId}
        signupErrors={signupErrors}
        onSubmit={handleSignup}
        onUsernameChange={(value) => {
          setSignupErrors([]);
          handleSignupUsernameChange(value);
        }}
        onUsernameBlur={handleSignupUsernameBlur}
        onPasswordChange={(value) => {
          setSignupErrors([]);
          setNewPass(value);
        }}
        onConfirmPasswordChange={(value) => {
          setSignupErrors([]);
          setConfirmPass(value);
        }}
      />
    </main>
  );
}
