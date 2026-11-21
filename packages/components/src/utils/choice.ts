/**
 * Props arrive from HTML attributes, so a value outside the declared union is possible at runtime.
 * Falling back keeps a typo from rendering unstyled or throwing.
 */
export function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}
