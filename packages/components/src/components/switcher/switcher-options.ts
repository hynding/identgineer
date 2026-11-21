export const SWITCHER_LIMITS = [2, 3, 4, 5, 6] as const;

export type SwitcherLimit = (typeof SWITCHER_LIMITS)[number];

/** The limit from an attribute, or `undefined` when it is not a whole number from 2 to 6. */
export function limitOf(value: unknown): SwitcherLimit | undefined {
  return SWITCHER_LIMITS.find((candidate) => candidate === value);
}
