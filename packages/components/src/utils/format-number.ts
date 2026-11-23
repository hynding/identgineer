function create(
  language: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat | undefined {
  try {
    return new Intl.NumberFormat(language, options);
  } catch {
    return undefined;
  }
}

// Beyond these, two decimals say nothing true: a tiny number would read as 0 and a huge one would
// spell out hundreds of digits.
const SMALLEST_PLAIN = 0.01;
const LARGEST_PLAIN = 1e15;

/**
 * Formats numbers with `Intl.NumberFormat` in the page's language, to at most two decimals; a
 * number too small or too large for that is written in scientific notation, and minus zero as
 * zero. A language tag the browser refuses, or none, falls back to the browser's own.
 */
export function numberFormatter(language: string | undefined): (value: number) => string {
  const tag = language === "" ? undefined : language;
  const plain =
    create(tag, { maximumFractionDigits: 2 }) ?? create(undefined, { maximumFractionDigits: 2 });
  const scientific =
    create(tag, { notation: "scientific", maximumFractionDigits: 2 }) ??
    create(undefined, { notation: "scientific", maximumFractionDigits: 2 });
  return (value) => {
    const size = Math.abs(value);
    if (size === 0) return plain ? plain.format(0) : "0";
    const formatter = size < SMALLEST_PLAIN || size >= LARGEST_PLAIN ? scientific : plain;
    return formatter ? formatter.format(value) : String(value);
  };
}
