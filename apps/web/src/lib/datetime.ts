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
