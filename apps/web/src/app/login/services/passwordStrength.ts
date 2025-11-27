import { zxcvbn } from "@zxcvbn-ts/core";
import { MIN_PASSWORD_LENGTH } from "../../../lib/passwordGuidelines";

export interface PasswordStrengthResult {
  score: number;
  label: string;
  helper: string;
  variant: "empty" | "weak" | "fair" | "strong" | "very-strong";
  activeSegments: number;
  showTips: boolean;
}

export function getPasswordStrength(password: string): PasswordStrengthResult {
  const trimmed = password.trim();
  const length = trimmed.length;
  if (!trimmed) {
    return {
      score: 0,
      label: "Start typing a password",
      helper: `Use at least ${MIN_PASSWORD_LENGTH} characters. Longer passphrases are even stronger.`,
      variant: "empty",
      activeSegments: 0,
      showTips: true,
    };
  }

  const zxcvbnResult = zxcvbn(trimmed);
  const score = Math.min(Math.max(zxcvbnResult.score, 0), 4);
  const scoreDetails: Record<
    number,
    {
      label: string;
      helper: string;
      variant: PasswordStrengthResult["variant"];
      activeSegments: number;
    }
  > = {
    0: {
      label: "Too weak",
      helper: "Keep going – add more characters to strengthen your password.",
      variant: "weak",
      activeSegments: 1,
    },
    1: {
      label: "Weak",
      helper: "Add more unique characters and mix letters with numbers or symbols.",
      variant: "weak",
      activeSegments: 2,
    },
    2: {
      label: "Fair",
      helper: "Add a symbol or mix uppercase and lowercase letters for extra strength.",
      variant: "fair",
      activeSegments: 3,
    },
    3: {
      label: "Strong",
      helper: "Great! This password meets the recommended requirements.",
      variant: "strong",
      activeSegments: 4,
    },
    4: {
      label: "Very strong",
      helper: "Excellent! This password is very strong.",
      variant: "very-strong",
      activeSegments: 4,
    },
  };

  const detail = scoreDetails[score];
  const feedback =
    zxcvbnResult.feedback.warning || zxcvbnResult.feedback.suggestions?.[0] || "";
  const helper = feedback ? `${detail.helper} ${feedback}`.trim() : detail.helper;
  const showTips = score <= 1 || length < 12;

  return {
    score,
    label: detail.label,
    helper,
    variant: detail.variant,
    activeSegments: detail.activeSegments,
    showTips,
  };
}
