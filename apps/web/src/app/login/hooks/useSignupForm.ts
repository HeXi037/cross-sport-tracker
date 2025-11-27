import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useRouter } from "next/navigation";

import { useToast } from "../../../components/ToastProvider";
import { useLocale } from "../../../lib/LocaleContext";
import { getAuthCopy } from "../../../lib/authCopy";
import {
  consumeLoginRedirect,
  peekLoginRedirect,
  rememberLoginRedirect,
  rememberLoginReferrer,
} from "../../../lib/loginRedirect";
import { MIN_PASSWORD_LENGTH, PASSWORD_GUIDELINES } from "../../../lib/passwordGuidelines";
import {
  EMAIL_REGEX,
  USERNAME_REGEX,
  SignupError,
  checkUsernameAvailability,
  normalizeErrorMessage,
  signupUser,
} from "../services/authService";
import { getPasswordStrength } from "../services/passwordStrength";

export type UsernameAvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

interface UseSignupFormOptions {
  onSuccess?: () => void;
}

export function useSignupForm({ onSuccess }: UseSignupFormOptions = {}) {
  const router = useRouter();
  const locale = useLocale();
  const { showToast } = useToast();

  const [showSignup, setShowSignup] = useState(false);
  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [signupErrors, setSignupErrors] = useState<string[]>([]);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailabilityState>({
    status: "idle",
  });

  const usernameCheckAbortRef = useRef<AbortController | null>(null);
  const lastUsernameCheckRef = useRef<string | null>(null);

  const passwordStrengthLabelId = useId();
  const passwordStrengthHelperId = useId();
  const errorSummaryTitleId = useId();
  const signupErrorTitleId = useId();
  const signupFormId = useId();

  const { usernameCharacterRule, usernameEmailOption } = useMemo(
    () => getAuthCopy(locale),
    [locale]
  );
  const usernameGuidelines = useMemo(
    () => [usernameCharacterRule, usernameEmailOption],
    [usernameCharacterRule, usernameEmailOption]
  );

  const passwordStrength = useMemo(
    () => getPasswordStrength(newPass),
    [newPass]
  );
  const passwordStrengthDescription = passwordStrength.showTips
    ? `${passwordStrengthLabelId} ${passwordStrengthHelperId}`
    : passwordStrengthLabelId;

  const cancelPendingUsernameCheck = () => {
    if (usernameCheckAbortRef.current) {
      usernameCheckAbortRef.current.abort();
      usernameCheckAbortRef.current = null;
    }
  };

  const resetUsernameAvailability = () => {
    cancelPendingUsernameCheck();
    setUsernameAvailability((prev) =>
      prev.status === "idle" ? prev : { status: "idle" }
    );
    lastUsernameCheckRef.current = null;
  };

  const handleSignupUsernameChange = (value: string) => {
    setNewUser(value);
    cancelPendingUsernameCheck();
    setUsernameAvailability((prev) =>
      prev.status === "idle" ? prev : { status: "idle" }
    );
    if (value.trim() !== lastUsernameCheckRef.current) {
      lastUsernameCheckRef.current = null;
    }
  };

  const handleSignupUsernameBlur = async () => {
    const trimmed = newUser.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      if (lastUsernameCheckRef.current !== null) {
        resetUsernameAvailability();
      }
      return;
    }

    if (!EMAIL_REGEX.test(trimmed) && !USERNAME_REGEX.test(trimmed)) {
      if (lastUsernameCheckRef.current !== null) {
        resetUsernameAvailability();
      }
      return;
    }

    if (
      trimmed === lastUsernameCheckRef.current &&
      usernameAvailability.status !== "checking"
    ) {
      return;
    }

    cancelPendingUsernameCheck();
    const controller = new AbortController();
    usernameCheckAbortRef.current = controller;
    setUsernameAvailability({ status: "checking" });
    try {
      const available = await checkUsernameAvailability(trimmed, controller.signal);
      lastUsernameCheckRef.current = trimmed;
      if (available) {
        setUsernameAvailability({ status: "available" });
      } else {
        setUsernameAvailability({
          status: "unavailable",
          message: "Username already taken.",
        });
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        return;
      }
      lastUsernameCheckRef.current = null;
      setUsernameAvailability({
        status: "error",
        message: normalizeErrorMessage(err, "We couldn't check username availability."),
      });
    } finally {
      if (usernameCheckAbortRef.current === controller) {
        usernameCheckAbortRef.current = null;
      }
    }
  };

  useEffect(() => () => cancelPendingUsernameCheck(), []);

  useEffect(() => {
    if (!showSignup) {
      resetUsernameAvailability();
    }
  }, [showSignup]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const redirectParam = params.get("redirect");
    if (redirectParam) {
      rememberLoginRedirect(redirectParam);
      return;
    }
    if (!peekLoginRedirect()) {
      rememberLoginReferrer();
    }
  }, []);

  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    setSignupErrors([]);
    const trimmedUser = newUser.trim();
    const validationErrors: string[] = [];

    if (trimmedUser.length < 3) {
      validationErrors.push("Username must be at least 3 characters long.");
    }
    if (trimmedUser.length > 50) {
      validationErrors.push("Username must be 50 characters or fewer.");
    }
    if (
      trimmedUser.length >= 3 &&
      trimmedUser.length <= 50 &&
      !EMAIL_REGEX.test(trimmedUser) &&
      !USERNAME_REGEX.test(trimmedUser)
    ) {
      validationErrors.push(usernameCharacterRule, usernameEmailOption);
    }
    if (newPass.length < MIN_PASSWORD_LENGTH) {
      validationErrors.push(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
    }
    if (newPass !== confirmPass) {
      validationErrors.push("Password and confirmation must match.");
    }

    if (
      trimmedUser.length >= 3 &&
      trimmedUser.length <= 50 &&
      usernameAvailability.status === "unavailable" &&
      lastUsernameCheckRef.current === trimmedUser
    ) {
      validationErrors.push(usernameAvailability.message);
    }

    if (validationErrors.length > 0) {
      setSignupErrors(validationErrors);
      return;
    }

    setNewUser(trimmedUser);
    try {
      await signupUser(trimmedUser, newPass);
      showToast({
        message: "Account created successfully!",
        variant: "success",
      });
      setSignupErrors([]);
      setNewUser("");
      setNewPass("");
      setConfirmPass("");
      resetUsernameAvailability();
      onSuccess?.();
      consumeLoginRedirect();
      router.push("/profile");
    } catch (err) {
      if (err instanceof SignupError) {
        setSignupErrors(err.messages);
        if (
          trimmedUser.length >= 3 &&
          trimmedUser.length <= 50 &&
          err.messages.some((message) =>
            message.toLowerCase().includes("username already taken")
          )
        ) {
          setUsernameAvailability({
            status: "unavailable",
            message: "Username already taken.",
          });
          lastUsernameCheckRef.current = trimmedUser;
        }
        return;
      }
      setSignupErrors([
        normalizeErrorMessage(
          err,
          "We couldn't create your account. Please try again."
        ),
      ]);
    }
  };

  return {
    showSignup,
    setShowSignup,
    newUser,
    setNewUser,
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
  };
}

export const signupGuidelines = PASSWORD_GUIDELINES;
