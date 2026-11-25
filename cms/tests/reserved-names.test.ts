import { describe, expect, it } from "vitest";
import { loadIr, type Field, type IrDocument } from "./model";

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

const ir = loadIr();

const isReserved = (name: string): boolean => {
  const mapped = snakeCase(name);
  return (
    RESERVED_NAMES.has(mapped) || RESERVED_PREFIXES.some((prefix) => mapped.startsWith(prefix))
  );
};

interface Declared {
  /** The type the name lands on, which is where camis locates it. */
  where: string;
  name: string;
}

// What camis checks (ownGaps and builtinGaps in ir-core's reserved-names.ts): a field's API name
// (its `names.api`, else its name) and a relation's inverse API name (`inverseNames.api`, else
// `inverse`), which lands on the target type, a built-in one included. A built-in type's own
// fields are not checked, only the inverses of its relations.
const declared = (doc: IrDocument): Declared[] => {
  const inverseOf = (field: Field): Declared[] => {
    const inverse = field.inverseNames?.api ?? field.inverse;
    return field.type === "relation" && inverse !== undefined && field.target !== undefined
      ? [{ where: field.target, name: inverse }]
      : [];
  };
  const ownOf = (holder: string, field: Field): Declared[] => [
    { where: holder, name: field.names?.api ?? field.name },
    ...inverseOf(field),
  ];
  return [
    ...doc.contentTypes.flatMap((ct) =>
      ct.fields.flatMap((field) =>
        ct.builtin === undefined ? ownOf(ct.name, field) : inverseOf(field),
      ),
    ),
    ...doc.components.flatMap((c) => c.fields.flatMap((field) => ownOf(c.name, field))),
  ];
};

const clashes = (doc: IrDocument): string[] =>
  declared(doc)
    .filter(({ name }) => isReserved(name))
    .map(({ where, name }) => `${where}.${name}`);

const fixture = (overrides: {
  fields?: Field[];
  userFields?: Field[];
  componentFields?: Field[];
}): IrDocument => ({
  version: 1,
  contentTypes: [
    { name: "Note", kind: "collection", fields: overrides.fields ?? [] },
    { name: "User", kind: "collection", builtin: "user", fields: overrides.userFields ?? [] },
  ],
  components: [{ name: "Part", fields: overrides.componentFields ?? [] }],
});

const relation = (extra: Partial<Field>): Field => ({
  type: "relation",
  name: "owner",
  relationKind: "manyToOne",
  target: "User",
  ...extra,
});

describe("the reserved names", () => {
  it("are recognised as camis maps a name", () => {
    expect(["locale", "createdAt", "documentId", "strapiStage"].filter(isReserved)).toHaveLength(4);
    expect(["language", "displayName", "timezone"].filter(isReserved)).toEqual([]);
  });

  it("catch a field's own name", () => {
    expect(clashes(fixture({ fields: [{ type: "string", name: "locale" }] }))).toEqual([
      "Note.locale",
    ]);
  });

  it("catch a field of a component", () => {
    expect(clashes(fixture({ componentFields: [{ type: "string", name: "id" }] }))).toEqual([
      "Part.id",
    ]);
  });

  it("catch an API name override, not the name it replaces", () => {
    const doc = fixture({
      fields: [
        { type: "string", name: "locale", names: { api: "language" } },
        { type: "string", name: "title", names: { api: "publishedAt" } },
      ],
    });
    expect(clashes(doc)).toEqual(["Note.publishedAt"]);
  });

  it("catch a relation's inverse, on the type it lands on", () => {
    const doc = fixture({ fields: [relation({ inverse: "localizations" })] });
    expect(clashes(doc)).toEqual(["User.localizations"]);
  });

  it("catch an inverse's API name override", () => {
    const doc = fixture({
      fields: [relation({ inverse: "notes", inverseNames: { api: "createdBy" } })],
    });
    expect(clashes(doc)).toEqual(["User.createdBy"]);
  });

  it("catch the inverse of a built-in type's own relation, but not its own fields", () => {
    const doc = fixture({
      userFields: [
        { type: "string", name: "locale" },
        relation({ name: "friend", relationKind: "manyToMany", target: "Note", inverse: "id" }),
      ],
    });
    expect(clashes(doc)).toEqual(["Note.id"]);
  });
});

describe("camis.json field names", () => {
  it("uses none that camis reserves", () => {
    expect(clashes(ir)).toEqual([]);
  });
});
