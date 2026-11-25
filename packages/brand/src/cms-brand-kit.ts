import type { BrandKit } from "./brand-kit.ts";
import { parseBrandKit, type BrandKitError } from "./parse-brand-kit.ts";
import { formatHexColor } from "./srgb.ts";

/** A brand kit as the CMS stores it (`cms/camis.json`, BrandKit): every field, null when absent. */
export interface CmsBrandKitData {
  readonly brandId: unknown;
  readonly name: unknown;
  readonly tagline: unknown;
  readonly primaryColor: unknown;
  readonly secondaryColor: unknown;
  readonly neutralTint: unknown;
  readonly typography: unknown;
  readonly corners: unknown;
  readonly tone: unknown;
  readonly logo: unknown;
  readonly mark: unknown;
}

/** A kit read back from the CMS: its document id, whether it is public, and the checked kit. */
export interface StoredBrandKit {
  readonly documentId: string;
  readonly isPublic: boolean;
  readonly kit: BrandKit;
}

/**
 * One record read from the CMS: the kit, or every problem with it, located by the CMS field
 * (`primaryColor`) and never repeating the value. `index` places a record in a list, and
 * `documentId` names it when it could be read.
 */
export type BrandKitRecordResult =
  | { readonly ok: true; readonly record: StoredBrandKit }
  | {
      readonly ok: false;
      readonly index?: number;
      readonly documentId?: string;
      readonly errors: readonly BrandKitError[];
    };

type CmsField = keyof CmsBrandKitData;

/** The kit's fields in the CMS, in the order the content type declares them. */
export const CMS_FIELDS: readonly CmsField[] = [
  "brandId",
  "name",
  "tagline",
  "primaryColor",
  "secondaryColor",
  "neutralTint",
  "typography",
  "corners",
  "tone",
  "logo",
  "mark",
];

/** The kit's field paths as `parseBrandKit` names them, by CMS field. */
const KIT_PATHS: Readonly<Record<CmsField, string>> = {
  brandId: "id",
  name: "name",
  tagline: "tagline",
  primaryColor: "colors.primary",
  secondaryColor: "colors.secondary",
  neutralTint: "colors.neutralTint",
  typography: "typography",
  corners: "corners",
  tone: "tone",
  logo: "logo",
  mark: "mark",
};

/** Keys the CMS adds to every record, and an owner it answers only when populated: never read. */
const CMS_OWN_KEYS = new Set(["id", "createdAt", "updatedAt", "publishedAt", "locale", "owner"]);

// The same rule as the identity SDK's document ids: safe in a URL path as it is.
export const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SHOWABLE_KEY = /^[A-Za-z0-9_$-]{1,40}$/;

const isCmsField = (key: string): key is CmsField => CMS_FIELDS.some((field) => field === key);

const isRgb = (value: unknown): value is readonly [number, number, number] =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255);

const ownValue = (value: object, key: string): unknown =>
  Object.getOwnPropertyDescriptor(value, key)?.value;

const colorText = (value: unknown): unknown => (isRgb(value) ? formatHexColor(value) : value);

/**
 * The CMS shape of a kit: its fields only, so nothing a JavaScript caller added (an owner, a
 * theme) is ever sent. Reads the kit through own data properties alone, so a getter cannot answer
 * one value here and another later. A value that is not what a kit holds is passed on as it is,
 * for the check that follows to refuse.
 */
export function brandKitToCms(kit: BrandKit): CmsBrandKitData {
  const colors: unknown = ownValue(kit, "colors");
  const color = (key: string): unknown =>
    typeof colors === "object" && colors !== null ? colorText(ownValue(colors, key)) : undefined;
  const optional = (value: unknown): unknown => value ?? null;
  return {
    brandId: ownValue(kit, "id"),
    name: ownValue(kit, "name"),
    tagline: optional(ownValue(kit, "tagline")),
    primaryColor: color("primary"),
    secondaryColor: optional(color("secondary")),
    neutralTint: optional(color("neutralTint")),
    typography: ownValue(kit, "typography"),
    corners: ownValue(kit, "corners"),
    tone: ownValue(kit, "tone"),
    logo: optional(ownValue(kit, "logo")),
    mark: optional(ownValue(kit, "mark")),
  };
}

function error(path: string, code: BrandKitError["code"], message: string): BrandKitError {
  return { path, code, message: path === "" ? message : `${path}: ${message}` };
}

function showKey(key: string): string {
  return SHOWABLE_KEY.test(key) ? key : "(a key that cannot be shown)";
}

/** `parseBrandKit`'s error, located by the CMS field instead of the kit's path. */
function toCmsError(kitError: BrandKitError): BrandKitError {
  const field = CMS_FIELDS.find((candidate) => KIT_PATHS[candidate] === kitError.path);
  if (field === undefined || field === kitError.path) return kitError;
  const prefix = `${kitError.path}: `;
  const message = kitError.message.startsWith(prefix)
    ? kitError.message.slice(prefix.length)
    : kitError.message;
  return error(field, kitError.code, message);
}

function isPlainObject(value: unknown): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** The kit's input for `parseBrandKit`, an absent or null field left out. */
function kitInput(fields: Partial<Record<CmsField, unknown>>): Record<string, unknown> {
  const present = (field: CmsField): unknown => fields[field] ?? undefined;
  const input: Record<string, unknown> = {};
  const colors: Record<string, unknown> = {};
  const put = (target: Record<string, unknown>, key: string, value: unknown): void => {
    if (value !== undefined) target[key] = value;
  };
  put(input, "id", present("brandId"));
  put(input, "name", present("name"));
  put(input, "tagline", present("tagline"));
  put(colors, "primary", present("primaryColor"));
  put(colors, "secondary", present("secondaryColor"));
  put(colors, "neutralTint", present("neutralTint"));
  input.colors = colors;
  put(input, "typography", present("typography"));
  put(input, "corners", present("corners"));
  put(input, "tone", present("tone"));
  put(input, "logo", present("logo"));
  put(input, "mark", present("mark"));
  return input;
}

/**
 * Checks a kit in the CMS shape with `parseBrandKit`: the kit, or its errors located by CMS
 * field. A colour reaches the parser as the CMS holds it, so `#rrggbb` text only.
 */
export function parseCmsBrandKit(
  fields: Partial<Record<CmsField, unknown>>,
):
  | { readonly ok: true; readonly kit: BrandKit }
  | { readonly ok: false; readonly errors: readonly BrandKitError[] } {
  const result = parseBrandKit(kitInput(fields));
  return result.ok ? result : { ok: false, errors: result.errors.map(toCmsError) };
}

function readDocumentId(value: unknown, errors: BrandKitError[]): string | undefined {
  if (value === undefined) {
    errors.push(error("documentId", "missing", "is required"));
    return undefined;
  }
  if (typeof value !== "string") {
    errors.push(error("documentId", "wrong-type", "must be a string"));
    return undefined;
  }
  if (!DOCUMENT_ID.test(value)) {
    errors.push(
      error("documentId", "invalid-id", "takes 1 to 128 letters, digits, hyphens and underscores"),
    );
    return undefined;
  }
  return value;
}

function readIsPublic(value: unknown, errors: BrandKitError[]): boolean | undefined {
  if (value === undefined) {
    errors.push(error("isPublic", "missing", "is required"));
    return undefined;
  }
  if (typeof value !== "boolean") {
    errors.push(error("isPublic", "wrong-type", "must be a boolean"));
    return undefined;
  }
  return value;
}

/**
 * Reads one record of a CMS answer (already parsed JSON, untrusted) into a checked kit. Only the
 * kit's fields, `documentId` and `isPublic` are read; the CMS's own ids and timestamps are
 * ignored, and any other key is an error. Reads own properties only, so a `__proto__` or
 * `constructor` key is an unknown key like any other. Never throws.
 */
export function readCmsBrandKit(value: unknown): BrandKitRecordResult {
  if (!isPlainObject(value)) {
    return { ok: false, errors: [error("", "not-an-object", "must be an object")] };
  }
  const errors: BrandKitError[] = [];
  const fields: Partial<Record<CmsField, unknown>> = {};
  let documentIdValue: unknown;
  let isPublicValue: unknown;
  for (const key of Object.keys(value)) {
    const item = ownValue(value, key);
    if (isCmsField(key)) fields[key] = item;
    else if (key === "documentId") documentIdValue = item;
    else if (key === "isPublic") isPublicValue = item;
    else if (!CMS_OWN_KEYS.has(key)) {
      errors.push(error(showKey(key), "unknown-key", "is not a brand kit field"));
    }
  }
  const documentId = readDocumentId(documentIdValue, errors);
  const isPublic = readIsPublic(isPublicValue, errors);
  const parsed = parseCmsBrandKit(fields);
  if (!parsed.ok) errors.push(...parsed.errors);
  if (!parsed.ok || errors.length > 0 || documentId === undefined || isPublic === undefined) {
    return { ok: false, ...(documentId !== undefined && { documentId }), errors };
  }
  return { ok: true, record: Object.freeze({ documentId, isPublic, kit: parsed.kit }) };
}
