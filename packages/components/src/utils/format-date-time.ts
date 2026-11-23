// The long time style names the zone (and cannot be combined with `timeZoneName`). It is always named, so a time is never taken for the reader's own, and a zone the browser
// refuses (which falls back to the reader's) shows by its name that it did.
const OPTIONS = { dateStyle: "medium", timeStyle: "long" } as const;

function format(
  date: Date,
  language: string | undefined,
  timeZone: string | undefined,
): string | undefined {
  try {
    const zone = timeZone === undefined || timeZone === "" ? {} : { timeZone };
    return new Intl.DateTimeFormat(language === "" ? undefined : language, {
      ...OPTIONS,
      ...zone,
    }).format(date);
  } catch {
    return undefined;
  }
}

/**
 * An ISO 8601 time as people read it, with `Intl.DateTimeFormat` in the page's language and, unless
 * a zone is given, the reader's own zone. A language or a zone the browser refuses falls back to
 * its own; text that is not a time gives nothing.
 */
export function formatDateTime(
  iso: string,
  language: string | undefined,
  timeZone?: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return (
    format(date, language, timeZone) ??
    format(date, language, undefined) ??
    format(date, undefined, undefined) ??
    ""
  );
}
