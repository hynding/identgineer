/* eslint-disable @typescript-eslint/no-unused-vars -- a stub the next commit replaces */
export interface GuideFace {
  /** The family names of the stack, in order, as text. */
  readonly families: readonly string[];
  /** The stack as a `font-family` value, built from names that passed the check. */
  readonly stack: string;
  readonly weight: number | undefined;
  readonly letterSpacing: string | undefined;
  readonly lineHeight: number | undefined;
}

export interface GuideTypography {
  readonly label: string;
  readonly heading: GuideFace;
  readonly body: GuideFace;
}

export function readTypography(_kit: unknown): GuideTypography | undefined {
  return undefined;
}
