/** `none`, then every step of the space scale (`--idg-space-<step>`), smallest first. */
export const GAP_STEPS = ["none", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl"] as const;

/** Every step of the size scale (`--idg-size-<step>`) that is a width or height, smallest first. */
export const SIZE_STEPS = ["xs", "s", "m", "l", "xl", "2xl", "3xl"] as const;

export type GapStep = (typeof GAP_STEPS)[number];
export type SizeStep = (typeof SIZE_STEPS)[number];

/**
 * A step from an attribute, or `undefined` when there is none or it is not one of `steps`. The
 * primitive then keeps the value the layout gives it, so a typo never reaches a stylesheet.
 */
export function stepOf<T extends string>(steps: readonly T[], value: unknown): T | undefined {
  return steps.find((candidate) => candidate === value);
}
