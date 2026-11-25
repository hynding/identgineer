import type { BrandKit, BrandKitErrorCode, BrandTheme } from "@identgineer/brand";
import { generateBrandTheme, parseBrandKit } from "@identgineer/brand/edit";
import { CORNERS, TONES, TYPOGRAPHY_IDS } from "@identgineer/brand/presets";
import { ownValue } from "../../utils/own-value";
import { brandLogoSource } from "../brand-logo/brand-logo-source";

/** The editor's fields, in the order the form shows them. */
export const DRAFT_FIELDS = [
  "id",
  "name",
  "tagline",
  "primary",
  "secondary",
  "neutralTint",
  "typography",
  "corners",
  "tone",
  "logo",
  "mark",
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

export type ColourField = "primary" | "secondary" | "neutralTint";
export const COLOUR_FIELDS: readonly ColourField[] = ["primary", "secondary", "neutralTint"];

export type ImageField = "logo" | "mark";

/**
 * What the form holds: every text as typed, and the logo and mark only ever as the sanitiser
 * returned them (an upload is sanitised before it gets here, and a kit's own is checked).
 */
export interface BrandDraft {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly primary: string;
  readonly secondary: string;
  readonly neutralTint: string;
  readonly typography: string;
  readonly corners: string;
  readonly tone: string;
  readonly logo?: string;
  readonly mark?: string;
}

export const EMPTY_DRAFT: BrandDraft = Object.freeze({
  id: "",
  name: "",
  tagline: "",
  primary: "",
  secondary: "",
  neutralTint: "",
  typography: TYPOGRAPHY_IDS[0],
  corners: "soft",
  tone: "balanced",
});

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function channel(value: unknown): string | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255
    ? value.toString(16).padStart(2, "0")
    : undefined;
}

/**
 * A kit's colour as the form's hex text: three whole channels (as `parseBrandKit` keeps them) as
 * `#rrggbb`, a hex string in lower case, and anything else as nothing.
 */
export function hexOf(value: unknown): string {
  if (typeof value === "string") return HEX.test(value) ? value.toLowerCase() : "";
  try {
    if (!Array.isArray(value) || value.length !== 3) return "";
    const channels = [0, 1, 2].map((index) => channel(ownValue(value, String(index))));
    return channels.every((part) => part !== undefined) ? `#${channels.join("")}` : "";
  } catch {
    return "";
  }
}

/** The value a native colour input takes for the hex text, `#rrggbb` in lower case, or none. */
export function colourPickerValue(text: string): string | undefined {
  const hex = text.trim().toLowerCase();
  if (!HEX.test(hex)) return undefined;
  if (hex.length === 7) return hex;
  const [red, green, blue] = [hex.slice(1, 2), hex.slice(2, 3), hex.slice(3, 4)];
  return `#${red}${red}${green}${green}${blue}${blue}`;
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function choiceOf(value: unknown, choices: readonly string[], fallback: string): string {
  return typeof value === "string" && choices.includes(value) ? value : fallback;
}

export interface DraftReading {
  readonly draft: BrandDraft;
  /** A logo or mark the kit held that is not the sanitiser's output, and so was left out. */
  readonly refusedLogos: readonly ImageField[];
}

/**
 * The form's values for a kit given as a property, which may be anything: each field is read once,
 * as an own property, and a value of the wrong type, a getter that throws or a proxy reads as
 * nothing. A logo or mark is kept only when the sanitiser gives it back unchanged.
 */
export function draftFromKit(kit: unknown): DraftReading {
  if (typeof kit !== "object" || kit === null) return { draft: EMPTY_DRAFT, refusedLogos: [] };
  const colors = ownValue(kit, "colors");
  const refusedLogos: ImageField[] = [];
  const image = (field: ImageField): string | undefined => {
    const value = ownValue(kit, field);
    if (value === undefined) return undefined;
    if (typeof value === "string" && brandLogoSource(value) !== undefined) return value;
    refusedLogos.push(field);
    return undefined;
  };
  const logo = image("logo");
  const mark = image("mark");
  const draft: BrandDraft = {
    id: textOf(ownValue(kit, "id")),
    name: textOf(ownValue(kit, "name")),
    tagline: textOf(ownValue(kit, "tagline")),
    primary: hexOf(ownValue(colors, "primary")),
    secondary: hexOf(ownValue(colors, "secondary")),
    neutralTint: hexOf(ownValue(colors, "neutralTint")),
    typography: choiceOf(ownValue(kit, "typography"), TYPOGRAPHY_IDS, EMPTY_DRAFT.typography),
    corners: choiceOf(ownValue(kit, "corners"), CORNERS, EMPTY_DRAFT.corners),
    tone: choiceOf(ownValue(kit, "tone"), TONES, EMPTY_DRAFT.tone),
    ...(logo === undefined ? {} : { logo }),
    ...(mark === undefined ? {} : { mark }),
  };
  return { draft, refusedLogos };
}

/** The draft as `parseBrandKit`'s input: trimmed, an empty optional field left out. */
function kitInput(draft: BrandDraft, withImages: boolean): Record<string, unknown> {
  const optional = (value: string) => (value.trim() === "" ? undefined : value.trim());
  const colors: Record<string, string> = { primary: draft.primary.trim() };
  for (const field of ["secondary", "neutralTint"] as const) {
    const value = optional(draft[field]);
    if (value !== undefined) colors[field] = value;
  }
  const tagline = optional(draft.tagline);
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    ...(tagline === undefined ? {} : { tagline }),
    colors,
    typography: draft.typography,
    corners: draft.corners,
    tone: draft.tone,
    ...(withImages && draft.logo !== undefined ? { logo: draft.logo } : {}),
    ...(withImages && draft.mark !== undefined ? { mark: draft.mark } : {}),
  };
}

// `parseBrandKit` names each error by its path in the kit; the form names it by its field.
const FIELD_OF_PATH: Readonly<Record<string, DraftField>> = {
  id: "id",
  name: "name",
  tagline: "tagline",
  "colors.primary": "primary",
  "colors.secondary": "secondary",
  "colors.neutralTint": "neutralTint",
  typography: "typography",
  corners: "corners",
  tone: "tone",
  logo: "logo",
  mark: "mark",
};

export type DraftValidation =
  | { readonly ok: true; readonly kit: BrandKit }
  | { readonly ok: false; readonly errors: Partial<Record<DraftField, BrandKitErrorCode>> };

/**
 * The draft read by `parseBrandKit`, the one validator: the kit it returns, or the code of the
 * first error of each field. The logo and mark are read too, so this costs a sanitiser read of
 * each: it runs when the form is sent, not as it is typed in.
 */
export function validateDraft(draft: BrandDraft): DraftValidation {
  const result = parseBrandKit(kitInput(draft, true));
  if (result.ok) return { ok: true, kit: result.kit };
  const errors: Partial<Record<DraftField, BrandKitErrorCode>> = {};
  for (const error of result.errors) {
    // Every path the form's own input can give is a field; `colors` alone would be a missing
    // primary, which the form always sends.
    const field = Object.hasOwn(FIELD_OF_PATH, error.path) ? FIELD_OF_PATH[error.path] : undefined;
    if (field !== undefined) errors[field] ??= error.code;
  }
  return { ok: false, errors };
}

export interface DraftPreview {
  /** The kit without its logo and mark, which the preview takes from the draft as they are. */
  readonly kit: BrandKit;
  readonly theme: BrandTheme;
}

/**
 * The kit and theme the preview shows, or nothing while the draft is not a kit. The logo and mark
 * are left out, so neither validation nor the generator (which validates its kit again) reads them:
 * they only change on an upload, and the preview's logo component checks each text once.
 */
export function previewOf(draft: BrandDraft): DraftPreview | undefined {
  const result = parseBrandKit(kitInput(draft, false));
  if (!result.ok) return undefined;
  try {
    return { kit: result.kit, theme: generateBrandTheme(result.kit) };
  } catch {
    return undefined;
  }
}
