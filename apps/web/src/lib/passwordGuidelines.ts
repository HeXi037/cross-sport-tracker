export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_GUIDELINES = [
  `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  "Longer passphrases with multiple words are encouraged.",
  "Avoid common phrases or personal information.",
] as const;
