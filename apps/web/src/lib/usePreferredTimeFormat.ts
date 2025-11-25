"use client";

import { useEffect, useState } from "react";
import {
  loadUserSettings,
  USER_SETTINGS_CHANGED_EVENT,
} from "../app/user-settings";
import { type TimeFormatPreference } from "./i18n";

function normalizeTimeFormatPreference(
  value: unknown,
): TimeFormatPreference {
  if (value === "am-pm") return "am-pm";
  if (value === "24-hour") return "24-hour";
  return "";
}

export function usePreferredTimeFormat(): TimeFormatPreference {
  const [preference, setPreference] = useState<TimeFormatPreference>(() => {
    return normalizeTimeFormatPreference(loadUserSettings().preferredTimeFormat);
  });

  useEffect(() => {
    const handleChange = () => {
      setPreference(
        normalizeTimeFormatPreference(loadUserSettings().preferredTimeFormat),
      );
    };
    window.addEventListener("storage", handleChange);
    window.addEventListener(USER_SETTINGS_CHANGED_EVENT, handleChange);
    return () => {
      window.removeEventListener("storage", handleChange);
      window.removeEventListener(USER_SETTINGS_CHANGED_EVENT, handleChange);
    };
  }, []);

  return preference;
}
