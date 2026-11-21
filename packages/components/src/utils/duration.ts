const DURATION = /^(\d*\.?\d+)(ms|s)$/;

/**
 * Reads a CSS time such as a `--idg-*` duration token taken from a computed style, in
 * milliseconds. Anything else is `undefined`, so a caller falls back rather than waiting forever.
 */
export function parseDuration(value: string): number | undefined {
  const match = DURATION.exec(value.trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2] === "s" ? amount * 1000 : amount;
}
