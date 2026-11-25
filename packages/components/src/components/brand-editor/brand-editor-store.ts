import type { BrandKit, BrandKitStoreErrorCode } from "@identgineer/brand";
import { ownValue } from "../../utils/own-value";
import type { DraftField } from "./brand-editor-draft";

/**
 * What a write answers: the stored record, or a record the store could not read back. The
 * `BrandKitRecordResult` of the brand package fits it.
 */
export interface BrandEditorSaveResult {
  readonly ok: boolean;
  readonly record?: { readonly documentId: string; readonly kit: { readonly id: string } };
}

/**
 * The two methods the editor calls. Declared here, so the component names only what it uses; the
 * object `createBrandKitStore` returns fits it, and a type test holds it to that.
 */
export interface BrandEditorStore {
  readonly create: (kit: BrandKit) => Promise<BrandEditorSaveResult>;
  readonly update: (documentId: string, kit: BrandKit) => Promise<BrandEditorSaveResult>;
}

/** Whether a value given as `store` has both methods, read without letting a getter throw. */
export function isBrandEditorStore(value: unknown): value is BrandEditorStore {
  try {
    const store = value as Partial<Record<"create" | "update", unknown>> | null | undefined;
    return typeof store?.create === "function" && typeof store.update === "function";
  } catch {
    return false;
  }
}

// The store's own rule for document ids: safe in a URL path as it is.
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

const documentIdOf = (value: unknown): string | undefined =>
  typeof value === "string" && DOCUMENT_ID.test(value) ? value : undefined;

export interface SavedKit {
  /** The CMS's id of the stored kit, which an update names. */
  readonly documentId: string;
  /** The kit's own id, its `data-theme` value. */
  readonly id: string;
}

/** The ids of the kit a write stored, or nothing when the answer is not a stored record. */
export function readSaved(result: unknown): SavedKit | undefined {
  if (ownValue(result, "ok") !== true) return undefined;
  const record = ownValue(result, "record");
  const documentId = documentIdOf(ownValue(record, "documentId"));
  const id = ownValue(ownValue(record, "kit"), "id");
  return documentId === undefined || typeof id !== "string" ? undefined : { documentId, id };
}

const STORE_CODES: readonly BrandKitStoreErrorCode[] = [
  "unauthorized",
  "forbidden",
  "not-found",
  "validation",
  "not-applied",
  "rate-limited",
  "network",
  "request-refused",
  "malformed-response",
  "unexpected-status",
];

// The CMS names a kit's fields its own way (`cms/camis.json`, BrandKit); the form names them by
// what they hold.
const FIELD_OF_CMS: Readonly<Record<string, DraftField>> = {
  brandId: "id",
  name: "name",
  tagline: "tagline",
  primaryColor: "primary",
  secondaryColor: "secondary",
  neutralTint: "neutralTint",
  typography: "typography",
  corners: "corners",
  tone: "tone",
  logo: "logo",
  mark: "mark",
};

export interface StoreFailure {
  readonly code: BrandKitStoreErrorCode | "unknown";
  /** The form's fields the store named, for `validation` and `not-applied`. */
  readonly fields: readonly DraftField[];
  /** The kit a write that was not applied did store, to update rather than create again. */
  readonly documentId?: string;
}

function fieldsOf(value: unknown): DraftField[] {
  if (!Array.isArray(value)) return [];
  const fields: DraftField[] = [];
  const names: unknown[] = [];
  try {
    names.push(...(value as unknown[]));
  } catch {
    return [];
  }
  for (const name of names) {
    const field =
      typeof name === "string" && Object.hasOwn(FIELD_OF_CMS, name)
        ? FIELD_OF_CMS[name]
        : undefined;
    if (field !== undefined && !fields.includes(field)) fields.push(field);
  }
  return fields;
}

/**
 * What a rejected write means for the form: the store's code (`unknown` for anything else thrown),
 * the fields it named and the document it stored. The error's message is never read: the form
 * shows its own fixed words for the code, so nothing the server said reaches the page.
 */
export function readStoreFailure(error: unknown): StoreFailure {
  const code = ownValue(error, "code");
  const known = STORE_CODES.find((candidate) => candidate === code);
  if (known === undefined) return { code: "unknown", fields: [] };
  const fields = fieldsOf(ownValue(error, "fields"));
  const documentId = documentIdOf(ownValue(error, "documentId"));
  return { code: known, fields, ...(documentId === undefined ? {} : { documentId }) };
}
