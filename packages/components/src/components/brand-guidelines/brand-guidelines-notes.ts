/* eslint-disable @typescript-eslint/no-unused-vars -- a stub the next commit replaces */
export interface GuideNote {
  readonly kind: "status-near-accent" | "accent-blends-with-page";
  readonly scheme: "light" | "dark";
  /** The colour role, without the `color.` prefix. */
  readonly role: string;
  readonly against: string;
  /** The OKLab distance of a status colour, or the contrast of an accent with the page. */
  readonly figure: number;
}

export interface GuideAdjustment {
  readonly scheme: "light" | "dark";
  readonly role: string;
  readonly origin: "primary" | "secondary" | "generated";
  readonly requested: string;
  readonly used: string;
  readonly against: string;
  readonly minimum: number;
  readonly before: number;
  readonly after: number;
}

export interface GuideList<Item> {
  readonly items: readonly Item[];
  /** How many more the theme holds than are listed. */
  readonly omitted: number;
}

export function readNotes(_theme: unknown): GuideList<GuideNote> | undefined {
  return undefined;
}

export function readAdjustments(_theme: unknown): GuideList<GuideAdjustment> | undefined {
  return undefined;
}
