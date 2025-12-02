export function buildPlayedAtISOString(
  date?: string,
  time?: string,
): string | undefined {
  if (!date) {
    return undefined;
  }

  const trimmedTime = time?.trim();
  const isoInput = trimmedTime ? `${date}T${trimmedTime}` : `${date}T00:00`;

  return new Date(isoInput).toISOString();
}

export function hasTimeComponent(value?: string | null): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }

  const match = trimmed.match(
    /T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?$/
  );
  if (!match) {
    return true;
  }

  const [, hours, minutes, seconds = "0", fraction = ""] = match;
  const numericFraction = fraction ? Number(fraction.replace(".", "")) : 0;

  return !(
    Number(hours) === 0 &&
    Number(minutes) === 0 &&
    Number(seconds) === 0 &&
    numericFraction === 0
  );
}

function padTimeUnit(value: number): string {
  return value.toString().padStart(2, "0");
}

export function getTodayDateInputValue(now = new Date()): string {
  const year = now.getFullYear();
  const month = padTimeUnit(now.getMonth() + 1);
  const day = padTimeUnit(now.getDate());
  return `${year}-${month}-${day}`;
}

export function getCurrentRoundedTimeSlot(
  now = new Date(),
  intervalMinutes = 15,
): string {
  const clampedInterval = Math.max(1, intervalMinutes);
  const totalMinutes = now.getHours() * 60 + now.getMinutes();
  const roundedMinutes =
    Math.round(totalMinutes / clampedInterval) * clampedInterval;
  const safeMinutes = Math.min(roundedMinutes, 23 * 60 + 59);
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${padTimeUnit(hours)}:${padTimeUnit(minutes)}`;
}
