import { describe, expect, it } from "vitest";
import { loadIr, type Field } from "./model";

// Mirrors the names camis refuses as field names on a Strapi API (a `reservedFieldName` error gap
// that aborts generation): STRAPI_KEYS and STRAPI_PREFIXES in camis'
// packages/strapi-schema/src/reserved-names.ts. Restated, not imported, because camis is not an
// npm package and CI must run without it. Keys are the names as camis compares them, snake_cased.
const RESERVED_NAMES = new Set([
  "id",
  "document_id",
  "created_at",
  "updated_at",
  "published_at",
  "created_by",
  "updated_by",
  "created_by_id",
  "updated_by_id",
  "locale",
  "localizations",
  "__component",
  "__content_type",
]);
const RESERVED_PREFIXES = ["strapi", "_strapi", "__strapi"];

const snakeCase = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

const isReserved = (name: string): boolean => {
  const mapped = snakeCase(name);
  return (
    RESERVED_NAMES.has(mapped) ||
    RESERVED_NAMES.has(name) ||
    RESERVED_PREFIXES.some((prefix) => mapped.startsWith(prefix))
  );
};

const ir = loadIr();

const declared = (): { holder: string; field: Field }[] => [
  ...ir.contentTypes
    .filter((ct) => ct.builtin === undefined)
    .flatMap((ct) => ct.fields.map((field) => ({ holder: ct.name, field }))),
  ...ir.components.flatMap((c) => c.fields.map((field) => ({ holder: c.name, field }))),
];

describe("camis.json field names", () => {
  it("recognises the names camis reserves", () => {
    expect(["locale", "createdAt", "documentId", "strapiStage"].filter(isReserved)).toHaveLength(4);
    expect(["language", "displayName", "timezone"].filter(isReserved)).toEqual([]);
  });

  it("uses none that camis reserves", () => {
    const clashes = declared()
      .filter(({ field }) => isReserved(field.name))
      .map(({ holder, field }) => `${holder}.${field.name}`);
    expect(clashes).toEqual([]);
  });
});
