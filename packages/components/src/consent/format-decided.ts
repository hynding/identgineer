const OPTIONS = { dateStyle: "medium", timeStyle: "short" } as const;

function format(date: Date, language: string | undefined, timeZone: string | undefined): string {
  const options = timeZone === undefined ? OPTIONS : { ...OPTIONS, timeZone };
  return new Intl.DateTimeFormat(language, options).format(date);
}

/**
 * The time a choice was made, in the page's language, for people to read; nothing for a time that
 * is missing or cannot be a date. A language tag the browser refuses falls back to its own.
 */
export function formatDecidedAt(
  time: unknown,
  language: string | undefined,
  timeZone?: string,
): string | undefined {
  if (typeof time !== "number" || !Number.isFinite(time)) return undefined;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return undefined;
  try {
    return format(date, language === "" ? undefined : language, timeZone);
  } catch {
    try {
      return format(date, undefined, timeZone);
    } catch {
      return undefined;
    }
  }
}
