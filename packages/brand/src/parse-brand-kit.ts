import { findBrandIdProblem } from "./brand-id.ts";
import {
  CORNERS,
  TONES,
  type BrandColors,
  type BrandKit,
  type Corners,
  type Tone,
} from "./brand-kit.ts";
import { TYPOGRAPHY_IDS, type TypographyId } from "./font-pairings.ts";
import { parseHexColor, type Rgb } from "./srgb.ts";

export type BrandKitErrorCode =
  | "not-an-object"
  | "unreadable"
  | "unknown-key"
  | "missing"
  | "wrong-type"
  | "too-short"
  | "too-long"
  | "invalid-id"
  | "reserved-id"
  | "invalid-text"
  | "invalid-color"
  | "not-allowed"
  | "too-many-errors";

/** Located: `path` names the field (`colors.primary`), and `message` never repeats the value. */
export interface BrandKitError {
  readonly path: string;
  readonly code: BrandKitErrorCode;
  readonly message: string;
}

export type BrandKitResult =
  | { readonly ok: true; readonly kit: BrandKit }
  | { readonly ok: false; readonly errors: readonly BrandKitError[] };

/** Lengths are counted in code points. */
export const NAME_MAX_LENGTH = 60;
export const TAGLINE_MAX_LENGTH = 120;
const HEX_MAX_LENGTH = 7;
/** Reporting stops here, with one final error saying so, so hostile input cannot flood a response. */
export const MAX_REPORTED_ERRORS = 50;

// Letters, marks and digits of any script, single spaces and a little punctuation. Name and tagline
// never reach CSS, but they do reach the brand guide and the token JSON, so anything that is
// markup, CSS or an escape anywhere (< > { } ; : \ " / ( ) @ and every control or format
// character) is refused rather than escaped.
const TEXT = /^[\p{L}\p{M}\p{N} .,'’&!?-]+$/u;
// Scripts need a few combining marks on one letter; a long stack only smears over the text around it.
// Spacing marks (Burmese and Indic vowel signs) take their own room, so only marks drawn over or
// around the letter count.
const MARK_STACK = /[\p{Mn}\p{Me}]{5}/u;
const SHOWABLE_KEY = /^[A-Za-z0-9_$-]{1,40}$/;

const KIT_KEYS = ["id", "name", "tagline", "colors", "typography", "corners", "tone"] as const;
const COLOR_KEYS = ["primary", "secondary", "neutralTint"] as const;

type Fields<Key extends string> = Partial<Record<Key, unknown>>;

/** Stands for a field whose getter threw: already reported, so it is neither missing nor wrong. */
const UNREADABLE: unique symbol = Symbol("unreadable");

class Errors {
  readonly list: BrandKitError[] = [];
  add(path: string, code: BrandKitErrorCode, message: string): void {
    if (this.list.length > MAX_REPORTED_ERRORS) return;
    if (this.list.length === MAX_REPORTED_ERRORS) {
      this.list.push({ path: "", code: "too-many-errors", message: "too many errors to list" });
      return;
    }
    this.list.push({ path, code, message: path === "" ? message : `${path}: ${message}` });
  }
}

function join(prefix: string, key: string): string {
  return prefix === "" ? key : `${prefix}.${key}`;
}

function showKey(key: string | symbol): string {
  if (typeof key === "symbol") return "(a symbol key)";
  return SHOWABLE_KEY.test(key) ? key : "(a key that cannot be shown)";
}

// Only a plain object (or one without a prototype) is a kit: a Map, a Date or a class instance
// would otherwise read as an object with every field missing.
function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Reads only the allowed own keys; any other key is an error. Throws only through a hostile proxy. */
function readFields<Key extends string>(
  value: unknown,
  prefix: string,
  allowed: readonly Key[],
  errors: Errors,
): Fields<Key> | undefined {
  if (!isPlainObject(value)) {
    errors.add(prefix, "not-an-object", "must be an object");
    return undefined;
  }
  const fields: Fields<Key> = {};
  for (const key of Reflect.ownKeys(value)) {
    const known = allowed.find((candidate) => candidate === key);
    if (known === undefined) {
      errors.add(join(prefix, showKey(key)), "unknown-key", "is not a brand kit field");
      continue;
    }
    try {
      fields[known] = (value as Record<string, unknown>)[known];
    } catch {
      errors.add(join(prefix, known), "unreadable", "could not be read");
      fields[known] = UNREADABLE;
    }
  }
  return fields;
}

function readString(value: unknown, path: string, errors: Errors): string | undefined {
  if (value === UNREADABLE) return undefined;
  if (value === undefined) {
    errors.add(path, "missing", "is required");
    return undefined;
  }
  if (typeof value !== "string") {
    errors.add(path, "wrong-type", "must be a string");
    return undefined;
  }
  return value;
}

function readId(value: unknown, errors: Errors): string | undefined {
  const id = readString(value, "id", errors);
  if (id === undefined) return undefined;
  const problem = findBrandIdProblem(id);
  if (!problem) return id;
  errors.add("id", problem.code, problem.message);
  return undefined;
}

function readText(value: unknown, path: string, max: number, errors: Errors): string | undefined {
  const text = readString(value, path, errors);
  if (text === undefined) return undefined;
  if (text.length === 0) {
    errors.add(path, "too-short", "must not be empty");
    return undefined;
  }
  // Code points, not UTF-16 units: a letter outside the BMP counts once. The first test keeps a
  // huge string from being split at all.
  if (text.length > max * 2 || Array.from(text).length > max) {
    errors.add(path, "too-long", `takes at most ${String(max)} characters`);
    return undefined;
  }
  if (!TEXT.test(text) || MARK_STACK.test(text) || text.trim() !== text || text.includes("  ")) {
    errors.add(
      path,
      "invalid-text",
      "takes letters, digits, at most four stacked combining marks in a row, single inner spaces and . , ' ’ & ! ? - only",
    );
    return undefined;
  }
  return text;
}

function readColor(value: unknown, path: string, errors: Errors): Rgb | undefined {
  const text = readString(value, path, errors);
  if (text === undefined) return undefined;
  const rgb = text.length <= HEX_MAX_LENGTH ? parseHexColor(text) : undefined;
  if (!rgb) errors.add(path, "invalid-color", "must be a #rgb or #rrggbb hex colour");
  return rgb;
}

function readChoice<Choice extends string>(
  value: unknown,
  path: string,
  choices: readonly Choice[],
  errors: Errors,
): Choice | undefined {
  const text = readString(value, path, errors);
  if (text === undefined) return undefined;
  const choice = choices.find((candidate) => candidate === text);
  if (choice === undefined) errors.add(path, "not-allowed", `must be one of ${choices.join(", ")}`);
  return choice;
}

function readColors(value: unknown, errors: Errors): BrandColors | undefined {
  if (value === UNREADABLE) return undefined;
  if (value === undefined) {
    errors.add("colors", "missing", "is required");
    return undefined;
  }
  const fields = readFields(value, "colors", COLOR_KEYS, errors);
  if (!fields) return undefined;
  const before = errors.list.length;
  const primary = readColor(fields.primary, "colors.primary", errors);
  const secondary =
    fields.secondary === undefined
      ? undefined
      : readColor(fields.secondary, "colors.secondary", errors);
  const neutralTint =
    fields.neutralTint === undefined
      ? undefined
      : readColor(fields.neutralTint, "colors.neutralTint", errors);
  if (!primary || errors.list.length > before) return undefined;
  return Object.freeze({
    primary,
    ...(secondary && { secondary }),
    ...(neutralTint && { neutralTint }),
  });
}

interface KitParts {
  readonly id: string | undefined;
  readonly name: string | undefined;
  readonly tagline: string | undefined;
  readonly colors: BrandColors | undefined;
  readonly typography: TypographyId | undefined;
  readonly corners: Corners | undefined;
  readonly tone: Tone | undefined;
}

function readKit(input: unknown, errors: Errors): KitParts | undefined {
  const fields = readFields(input, "", KIT_KEYS, errors);
  if (!fields) return undefined;
  return {
    id: readId(fields.id, errors),
    name: readText(fields.name, "name", NAME_MAX_LENGTH, errors),
    tagline:
      fields.tagline === undefined
        ? undefined
        : readText(fields.tagline, "tagline", TAGLINE_MAX_LENGTH, errors),
    colors: readColors(fields.colors, errors),
    typography: readChoice(fields.typography, "typography", TYPOGRAPHY_IDS, errors),
    corners: readChoice(fields.corners, "corners", CORNERS, errors),
    tone: readChoice(fields.tone, "tone", TONES, errors),
  };
}

/**
 * Reads untrusted input (parsed JSON, form data) into a typed brand kit, or returns every problem
 * with the field it belongs to. It never throws, keeps no input string except the id, name and
 * tagline it has checked, and shares nothing with the input.
 */
export function parseBrandKit(input: unknown): BrandKitResult {
  const errors = new Errors();
  let parts: KitParts | undefined;
  try {
    parts = readKit(input, errors);
  } catch {
    // Only a hostile proxy (a throwing trap, or one revoked) gets here.
    return { ok: false, errors: [{ path: "", code: "unreadable", message: "could not be read" }] };
  }
  const { id, name, tagline, colors, typography, corners, tone } = parts ?? {};
  if (
    errors.list.length > 0 ||
    id === undefined ||
    name === undefined ||
    colors === undefined ||
    typography === undefined ||
    corners === undefined ||
    tone === undefined
  ) {
    return { ok: false, errors: errors.list };
  }
  return {
    ok: true,
    kit: Object.freeze({
      id,
      name,
      ...(tagline !== undefined && { tagline }),
      colors,
      typography,
      corners,
      tone,
    }),
  };
}
