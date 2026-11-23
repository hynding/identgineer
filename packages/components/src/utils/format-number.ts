function create(language: string | undefined): Intl.NumberFormat | undefined {
  try {
    return new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  } catch {
    return undefined;
  }
}

/**
 * Formats numbers with `Intl.NumberFormat` in the page's language, to at most two decimals. A
 * language tag the browser refuses, or none, falls back to the browser's own.
 */
export function numberFormatter(language: string | undefined): (value: number) => string {
  const format = create(language === "" ? undefined : language) ?? create(undefined);
  return (value) => (format ? format.format(value) : String(value));
}
