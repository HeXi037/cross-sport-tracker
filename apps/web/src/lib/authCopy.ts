export interface AuthCopy {
  usernameCharacterRule: string;
  usernameEmailOption: string;
}

const AUTH_COPY: Record<string, AuthCopy> = {
  default: {
    usernameCharacterRule:
      "Usernames can include letters, numbers, underscores, hyphens, and periods.",
    usernameEmailOption: "You can also use a valid email address.",
  },
  "en-au": {
    usernameCharacterRule:
      "Usernames can include letters, numbers, underscores, hyphens, and full stops.",
    usernameEmailOption: "You can also use a valid email address.",
  },
};

function getLocaleChain(locale: string): string[] {
  const lower = (locale ?? "").toLowerCase();
  const parts = lower.split("-").filter(Boolean);
  const chain = ["default"];
  if (parts[0]) {
    chain.push(parts[0]);
  }
  if (parts.length > 1) {
    chain.push(lower);
  }
  return chain;
}

export function getAuthCopy(locale: string): AuthCopy {
  const chain = getLocaleChain(locale);
  const result: AuthCopy = { ...AUTH_COPY.default };

  for (const key of chain) {
    const copy = AUTH_COPY[key];
    if (copy) {
      Object.assign(result, copy);
    }
  }

  return result;
}
