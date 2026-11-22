import { THEME_IDS } from "@identgineer/tokens";
import { describe, expect, it } from "vitest";
import { BRAND_ID_MAX_LENGTH, RESERVED_BRAND_IDS } from "./brand-id.ts";
import { parseBrandKit, type BrandKitError } from "./parse-brand-kit.ts";
import { seeded } from "./seeded-random.ts";

const VALID = {
  id: "acme",
  name: "Acme",
  colors: { primary: "#4F46E5" },
  typography: "system",
  corners: "soft",
  tone: "balanced",
} as const;

function errorsOf(input: unknown): readonly BrandKitError[] {
  const result = parseBrandKit(input);
  return result.ok ? [] : result.errors;
}

function pathsOf(input: unknown): string[] {
  return errorsOf(input).map((error) => error.path);
}

describe("parseBrandKit, valid kits", () => {
  it("reads a minimal kit, keeping colours as numbers", () => {
    expect(parseBrandKit(VALID)).toEqual({
      ok: true,
      kit: {
        id: "acme",
        name: "Acme",
        colors: { primary: [79, 70, 229] },
        typography: "system",
        corners: "soft",
        tone: "balanced",
      },
    });
  });

  it("reads every optional field", () => {
    const result = parseBrandKit({
      ...VALID,
      tagline: "Rockets, anvils & more!",
      colors: { primary: "#4f46e5", secondary: "#0d9", neutralTint: "#776655" },
    });
    expect(result.ok && result.kit).toEqual({
      id: "acme",
      name: "Acme",
      tagline: "Rockets, anvils & more!",
      colors: { primary: [79, 70, 229], secondary: [0, 221, 153], neutralTint: [119, 102, 85] },
      typography: "system",
      corners: "soft",
      tone: "balanced",
    });
  });

  it("treats an undefined optional field as absent", () => {
    const result = parseBrandKit({ ...VALID, tagline: undefined });
    expect(result.ok && "tagline" in result.kit).toBe(false);
  });

  it("returns a frozen kit that shares nothing with the input", () => {
    const input = { ...VALID, colors: { ...VALID.colors } };
    const result = parseBrandKit(input);
    if (!result.ok) throw new Error("expected a kit");
    expect(Object.isFrozen(result.kit)).toBe(true);
    expect(Object.isFrozen(result.kit.colors)).toBe(true);
    expect(result.kit.colors).not.toBe(input.colors);
  });

  it.each(["Ben & Jerry's", "Café Ünïcode", "Yahoo!", "Toys R Us", "Señor Pérez, Ltd.", "Ünü 42"])(
    "accepts the name %j",
    (name) => {
      expect(errorsOf({ ...VALID, name })).toEqual([]);
    },
  );
});

describe("parseBrandKit, the id", () => {
  it.each(["ab", "acme", "acme-co", "a1", "brand-2026", "x".repeat(BRAND_ID_MAX_LENGTH)])(
    "accepts %j",
    (id) => {
      expect(errorsOf({ ...VALID, id })).toEqual([]);
    },
  );

  it.each([
    ["upper case", "Acme"],
    ["an underscore", "acme_co"],
    ["a leading hyphen", "-acme"],
    ["a trailing hyphen", "acme-"],
    ["a double hyphen", "acme--co"],
    ["a leading digit", "1acme"],
    ["a space", "acme co"],
    ["one character", "a"],
    ["the empty string", ""],
    ["too many characters", "x".repeat(BRAND_ID_MAX_LENGTH + 1)],
    ["a quote", 'acme"]'],
    ["a non-ASCII letter", "acmé"],
  ])("refuses %s", (_name, id) => {
    expect(pathsOf({ ...VALID, id })).toEqual(["id"]);
  });

  it.each([...THEME_IDS])("refuses the built-in theme id %s", (id) => {
    expect(errorsOf({ ...VALID, id })).toEqual([
      expect.objectContaining({ path: "id", code: "reserved-id" }),
    ]);
  });

  it.each([...RESERVED_BRAND_IDS])("refuses the reserved id %s", (id) => {
    expect(errorsOf({ ...VALID, id })).toEqual([
      expect.objectContaining({ path: "id", code: "reserved-id" }),
    ]);
  });

  it("reserves the CSS-wide keywords and the scheme words", () => {
    for (const word of [
      "inherit",
      "initial",
      "unset",
      "revert",
      "default",
      "system",
      "light",
      "dark",
    ]) {
      expect(RESERVED_BRAND_IDS).toContain(word);
    }
  });
});

describe("parseBrandKit, refusals", () => {
  it.each([[null], [undefined], ["acme"], [42], [true], [["acme"]], [() => VALID]])(
    "refuses the non-object %s at the root",
    (input) => {
      expect(errorsOf(input)).toEqual([
        expect.objectContaining({ path: "", code: "not-an-object" }),
      ]);
    },
  );

  it("names every missing required field", () => {
    expect(pathsOf({})).toEqual(["id", "name", "colors", "typography", "corners", "tone"]);
    expect(pathsOf({ ...VALID, colors: {} })).toEqual(["colors.primary"]);
  });

  it("refuses unknown keys at every level", () => {
    expect(errorsOf({ ...VALID, logo: "<svg/>" })).toEqual([
      expect.objectContaining({ path: "logo", code: "unknown-key" }),
    ]);
    expect(pathsOf({ ...VALID, colors: { primary: "#000", accent: "#fff" } })).toEqual([
      "colors.accent",
    ]);
  });

  it.each(["__proto__", "constructor", "prototype"])(
    "refuses the prototype key %s at the root and in colours",
    (key) => {
      const root: unknown = JSON.parse(`{"${key}": {"id": "x"}, ${JSON.stringify(VALID).slice(1)}`);
      expect(pathsOf(root)).toEqual([key]);
      const nested: unknown = JSON.parse(
        JSON.stringify(VALID).replace('"colors":{', `"colors":{"${key}":{"primary":"#fff"},`),
      );
      expect(pathsOf(nested)).toEqual([`colors.${key}`]);
      expect(({} as Record<string, unknown>).id).toBeUndefined();
    },
  );

  it("bounds the length of an unknown key it reports", () => {
    const [error] = errorsOf({ ...VALID, ["k".repeat(10_000)]: 1 });
    expect(error?.path.length).toBeLessThan(80);
    expect(error?.message.length).toBeLessThan(200);
  });

  it("refuses wrong types at every field", () => {
    expect(
      pathsOf({
        id: 1,
        name: ["Acme"],
        tagline: 2,
        colors: "#fff",
        typography: { id: "system" },
        corners: null,
        tone: true,
      }),
    ).toEqual(["id", "name", "tagline", "colors", "typography", "corners", "tone"]);
    expect(pathsOf({ ...VALID, colors: { primary: 0xffffff } })).toEqual(["colors.primary"]);
  });

  it("refuses values outside the allowlists", () => {
    expect(
      pathsOf({ ...VALID, typography: "Comic Sans MS", corners: "pointy", tone: "loud" }),
    ).toEqual(["typography", "corners", "tone"]);
  });

  it.each(["rgb(0, 0, 0)", "hsl(0 0% 0%)", "oklch(0.5 0.1 20)", "red", "#12345", "transparent"])(
    "refuses the colour %j: only hex is accepted",
    (color) => {
      expect(pathsOf({ ...VALID, colors: { primary: color } })).toEqual(["colors.primary"]);
    },
  );

  it("never throws on a hostile object", () => {
    const throwing = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("boom");
        },
      },
    );
    expect(errorsOf(throwing)).toEqual([expect.objectContaining({ path: "", code: "unreadable" })]);
    const getter = Object.defineProperty({ ...VALID }, "name", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    expect(() => parseBrandKit(getter)).not.toThrow();
    expect(parseBrandKit(getter).ok).toBe(false);
    const revocable = Proxy.revocable({}, {});
    revocable.revoke();
    expect(() => parseBrandKit(revocable.proxy)).not.toThrow();
  });

  it("refuses a symbol key", () => {
    expect(pathsOf({ ...VALID, [Symbol("x")]: 1 })).toHaveLength(1);
  });

  it("never echoes the refused value in a message", () => {
    const hostile = "</style><script>alert(1)</script>";
    for (const error of errorsOf({ ...VALID, name: hostile, colors: { primary: hostile } })) {
      expect(error.message).not.toContain("<");
    }
  });
});

const HOSTILE_STRINGS = [
  "red;} body{display:none}",
  "</style><script>alert(1)</script>",
  "url(javascript:alert(1))",
  "expression(alert(1))",
  "@import url(//evil.example/x.css)",
  "\\66 oo",
  "\\0000",
  "\\7b url",
  "a\nb",
  "a\rb",
  `a${String.fromCodePoint(0x2028)}b`,
  "a\0b",
  "x".repeat(100_000),
  "#fff;color:red",
  "#ffffff}",
  `${String.fromCodePoint(0x202e)}acme`,
  `acme${String.fromCodePoint(0x200b)}`,
  String.fromCharCode(0xd800),
];

const STRING_FIELDS: readonly { path: string; with: (value: string) => unknown }[] = [
  { path: "id", with: (value) => ({ ...VALID, id: value }) },
  { path: "name", with: (value) => ({ ...VALID, name: value }) },
  { path: "tagline", with: (value) => ({ ...VALID, tagline: value }) },
  { path: "colors.primary", with: (value) => ({ ...VALID, colors: { primary: value } }) },
  {
    path: "colors.secondary",
    with: (value) => ({ ...VALID, colors: { primary: "#000", secondary: value } }),
  },
  {
    path: "colors.neutralTint",
    with: (value) => ({ ...VALID, colors: { primary: "#000", neutralTint: value } }),
  },
  { path: "typography", with: (value) => ({ ...VALID, typography: value }) },
  { path: "corners", with: (value) => ({ ...VALID, corners: value }) },
  { path: "tone", with: (value) => ({ ...VALID, tone: value }) },
];

describe.each(STRING_FIELDS)("parseBrandKit, hostile input at $path", (field) => {
  it.each(HOSTILE_STRINGS.map((value) => [JSON.stringify(value).slice(0, 40), value] as const))(
    "refuses %s",
    (_label, value) => {
      expect(pathsOf(field.with(value))).toEqual([field.path]);
    },
  );
});

describe("parseBrandKit, fuzzed input", () => {
  it("never throws and accepts nothing malformed, over random structures", () => {
    const seed = 20_261_122;
    const random = seeded(seed);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
    const values: readonly unknown[] = [
      undefined,
      null,
      0,
      -1,
      Number.NaN,
      "",
      "#fff",
      "acme",
      "system",
      "soft",
      "calm",
      [],
      {},
      ...HOSTILE_STRINGS.slice(0, 6),
    ];
    const keys = [...Object.keys(VALID), "tagline", "primary", "secondary", "__proto__", "x"];
    const randomValue = (depth: number): unknown => {
      if (depth > 0 && random() < 0.3) {
        const object: Record<string, unknown> = {};
        for (let index = 0; index < 4; index += 1) {
          Object.defineProperty(object, pick(keys), {
            value: randomValue(depth - 1),
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        return object;
      }
      return pick(values);
    };
    for (let run = 0; run < 3_000; run += 1) {
      const input = randomValue(3);
      let result: ReturnType<typeof parseBrandKit> | undefined;
      expect(
        () => (result = parseBrandKit(input)),
        `seed ${String(seed)}, run ${String(run)}`,
      ).not.toThrow();
      expect(result?.ok, `seed ${String(seed)}, run ${String(run)}`).toBe(false);
    }
  });
});
