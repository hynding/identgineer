import { ownValue } from "../../utils/own-value";
import { isOwnColour } from "../brand-swatches/brand-swatches-model";

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

/** The most entries listed of either kind: a guide is read, not scrolled through a log. */
export const MAX_LISTED = 50;
// The most entries read at all, so a hostile array of millions costs nothing.
const MAX_READ = 500;

const SCHEMES = ["light", "dark"] as const;
const NOTE_KINDS = ["status-near-accent", "accent-blends-with-page"] as const;
const ORIGINS = ["primary", "secondary", "generated"] as const;
const ROLE = /^color\.([a-z][a-z0-9-]{0,31})$/;
// The largest distance two colours can have in OKLab is a little over one; 2 is a safe ceiling.
const MAX_DISTANCE = 2;
const MIN_CONTRAST = 1;
const MAX_CONTRAST = 21;

function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return list.find((candidate) => candidate === value);
}

function roleOf(value: unknown): string | undefined {
  return typeof value === "string" ? ROLE.exec(value)?.[1] : undefined;
}

function between(value: unknown, low: number, high: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high
    ? value
    : undefined;
}

function parseNote(entry: unknown): GuideNote | undefined {
  const kind = oneOf(NOTE_KINDS, ownValue(entry, "kind"));
  const scheme = oneOf(SCHEMES, ownValue(entry, "scheme"));
  const role = roleOf(ownValue(entry, "token"));
  const against = roleOf(ownValue(entry, "against"));
  if (kind === undefined || scheme === undefined) return undefined;
  if (role === undefined || against === undefined) return undefined;
  const figure =
    kind === "status-near-accent"
      ? between(ownValue(entry, "distance"), 0, MAX_DISTANCE)
      : between(ownValue(entry, "contrast"), MIN_CONTRAST, MAX_CONTRAST);
  return figure === undefined ? undefined : { kind, scheme, role, against, figure };
}

function parseAdjustment(entry: unknown): GuideAdjustment | undefined {
  const scheme = oneOf(SCHEMES, ownValue(entry, "scheme"));
  const origin = oneOf(ORIGINS, ownValue(entry, "origin"));
  const role = roleOf(ownValue(entry, "token"));
  const against = roleOf(ownValue(entry, "against"));
  const requested = ownValue(entry, "requested");
  const used = ownValue(entry, "used");
  const minimum = between(ownValue(entry, "minimum"), MIN_CONTRAST, MAX_CONTRAST);
  const before = between(ownValue(entry, "contrastBefore"), MIN_CONTRAST, MAX_CONTRAST);
  const after = between(ownValue(entry, "contrastAfter"), MIN_CONTRAST, MAX_CONTRAST);
  if (scheme === undefined || origin === undefined) return undefined;
  if (role === undefined || against === undefined) return undefined;
  if (!isOwnColour(requested) || !isOwnColour(used)) return undefined;
  if (minimum === undefined || before === undefined || after === undefined) return undefined;
  return { scheme, role, origin, requested, used, against, minimum, before, after };
}

function readList<Item>(
  theme: unknown,
  key: string,
  parse: (entry: unknown) => Item | undefined,
): GuideList<Item> | undefined {
  try {
    const entries = ownValue(theme, key);
    if (!Array.isArray(entries)) return undefined;
    // A proxy can claim any length, and a length that is no whole number of entries is not counted.
    const length = Number.isSafeInteger(entries.length) ? entries.length : 0;
    const read = Math.min(length, MAX_READ);
    const valid: Item[] = [];
    for (let index = 0; index < read; index += 1) {
      const item = parse((entries as unknown[])[index]);
      if (item !== undefined) valid.push(item);
    }
    const items = valid.slice(0, MAX_LISTED);
    return { items, omitted: valid.length - items.length + (length - read) };
  } catch {
    return undefined;
  }
}

/**
 * What the generator left alone but a guide should say, each note kept only when its scheme, kind,
 * roles and figure are exactly what the brand package writes; `undefined` when the theme carries no
 * notes at all (a bare document), an empty list when it carries none to report.
 */
export function readNotes(theme: unknown): GuideList<GuideNote> | undefined {
  return readList(theme, "notes", parseNote);
}

/** The colours the generator moved to meet a contrast level, under the same rule. */
export function readAdjustments(theme: unknown): GuideList<GuideAdjustment> | undefined {
  return readList(theme, "adjustments", parseAdjustment);
}
