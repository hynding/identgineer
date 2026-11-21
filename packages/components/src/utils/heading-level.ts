const MIN_LEVEL = 1;
const MAX_LEVEL = 6;

/**
 * A heading level, 1 to 6, from a prop that may arrive as an attribute string. A value that is not
 * a level gives the fallback rather than an element that does not exist.
 */
export function headingLevel(level: unknown, fallback: number): number {
  const number = typeof level === "string" && level.trim() !== "" ? Number(level) : level;
  if (typeof number !== "number" || !Number.isFinite(number)) return fallback;
  const whole = Math.trunc(number);
  return whole >= MIN_LEVEL && whole <= MAX_LEVEL ? whole : fallback;
}
