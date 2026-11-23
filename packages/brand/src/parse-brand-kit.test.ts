import { readFileSync } from "node:fs";
import { RESERVED_THEME_IDS, THEME_IDS } from "@identgineer/tokens";
import { describe, expect, it } from "vitest";
import { BRAND_ID_MAX_LENGTH, RESERVED_BRAND_IDS } from "./brand-id.ts";
import {
  MAX_REPORTED_ERRORS,
  NAME_MAX_LENGTH,
  parseBrandKit,
  TAGLINE_MAX_LENGTH,
  type BrandKitError,
} from "./parse-brand-kit.ts";
import { sanitiseSvgLogo } from "./sanitise-svg-logo.ts";
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

  it.each(["flat", "pixel", "top-bar", "bento", "comfortable", "power"])(
    "refuses %s, the id of another axis",
    (id) => {
      expect(errorsOf({ ...VALID, id })).toEqual([
        expect.objectContaining({ path: "id", code: "reserved-id" }),
      ]);
    },
  );

  it("uses the tokens package's added theme id rule", () => {
    expect([...RESERVED_BRAND_IDS]).toEqual([...RESERVED_THEME_IDS]);
  });

  it("reserves the prototype names that fit the id rule", () => {
    expect(RESERVED_BRAND_IDS).toContain("constructor");
    expect(RESERVED_BRAND_IDS).toContain("prototype");
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

describe("parseBrandKit, text", () => {
  it.each(["a  b", "Acme  Rockets", "Acme Rockets  Ltd"])(
    "refuses two spaces in a row: %j",
    (name) => {
      expect(pathsOf({ ...VALID, name })).toEqual(["name"]);
      expect(pathsOf({ ...VALID, tagline: name })).toEqual(["tagline"]);
    },
  );

  const marks = (count: number) => String.fromCodePoint(0x301).repeat(count);

  it.each([
    ["Devanagari", String.fromCodePoint(0x928, 0x92e, 0x938, 0x94d, 0x924, 0x947)],
    ["decomposed Vietnamese", `Vie${String.fromCodePoint(0x323, 0x302)}t`],
    ["four marks on one letter", `a${marks(4)}`],
  ])("accepts combining marks that a script needs: %s", (_label, name) => {
    expect(errorsOf({ ...VALID, name })).toEqual([]);
  });

  it.each([
    ["five marks on one letter", `a${marks(5)}`],
    ["a stack of 59 accents", `a${marks(59)}`],
  ])("refuses more than four combining marks in a row: %s", (_label, name) => {
    expect(pathsOf({ ...VALID, name })).toEqual(["name"]);
    expect(pathsOf({ ...VALID, tagline: name })).toEqual(["tagline"]);
  });

  it.each([
    [
      "Burmese with three spacing marks",
      String.fromCodePoint(0x101c, 0x103b, 0x103e, 0x1031, 0x102c, 0x1037),
    ],
    ["Burmese, another word", String.fromCodePoint(0x1019, 0x103b, 0x103e, 0x1031, 0x102c, 0x103a)],
  ])("counts only non-spacing and enclosing marks towards a stack: %s", (_label, name) => {
    expect(errorsOf({ ...VALID, name })).toEqual([]);
  });

  it("still refuses five non-spacing or enclosing marks in a row", () => {
    const stack = `a${String.fromCodePoint(0x301, 0x302, 0x303, 0x20dd, 0x304)}`;
    expect(pathsOf({ ...VALID, name: stack })).toEqual(["name"]);
  });

  it.each([
    [
      "Persian with a zero-width non-joiner",
      String.fromCodePoint(0x645, 0x6cc, 0x200c, 0x62e, 0x648, 0x627, 0x647, 0x645),
    ],
    ["Sinhala with a zero-width joiner", String.fromCodePoint(0xdc1, 0xdca, 0x200d, 0xdbb, 0xdd3)],
    ["Hebrew with a geresh", String.fromCodePoint(0x5e6, 0x5f3, 0x5d9, 0x5e4, 0x5e1)],
    ["Hebrew with gershayim", String.fromCodePoint(0x5e6, 0x5d4, 0x5f4, 0x5dc)],
    [
      "a katakana middle dot",
      String.fromCodePoint(0x30b8, 0x30e7, 0x30f3, 0x30fb, 0x30b9, 0x30df, 0x30b9),
    ],
    ["a middle dot", `Col${String.fromCodePoint(0xb7)}legi`],
  ])("accepts characters real names need: %s", (_label, name) => {
    expect(errorsOf({ ...VALID, name })).toEqual([]);
  });

  it.each([
    ["a run of joiners", `a${String.fromCodePoint(0x200d, 0x200d)}b`],
    ["a joiner and a non-joiner together", `a${String.fromCodePoint(0x200c, 0x200d)}b`],
    ["a leading non-joiner", `${String.fromCodePoint(0x200c)}ab`],
    ["a trailing joiner", `ab${String.fromCodePoint(0x200d)}`],
    ["a joiner beside a space", `a ${String.fromCodePoint(0x200d)}b`],
    ["a joiner beside a digit", `a${String.fromCodePoint(0x200d)}1`],
    ["a right-to-left override", `a${String.fromCodePoint(0x202e)}b`],
    ["a first-strong isolate", `a${String.fromCodePoint(0x2068)}b`],
    ["a zero-width space", `a${String.fromCodePoint(0x200b)}b`],
  ])("refuses %s", (_label, name) => {
    expect(pathsOf({ ...VALID, name })).toEqual(["name"]);
  });

  it("counts combining marks across joiners, so joiners cannot reset a stack", () => {
    const joined = `a${`${String.fromCodePoint(0x301)}${String.fromCodePoint(0x200d)}`.repeat(10)}b`;
    expect(pathsOf({ ...VALID, name: joined })).toEqual(["name"]);
    const joinedFour = `a${`${String.fromCodePoint(0x301)}${String.fromCodePoint(0x200d)}`.repeat(4)}b`;
    expect(errorsOf({ ...VALID, name: joinedFour })).toEqual([]);
  });

  it.each([
    ["Persian", "می‌خواهم"],
    ["Sinhala", "ශ්‍රී"],
    ["Hebrew geresh at the end of a word", "ג׳ורג׳"],
    ["Hebrew gershayim", "צה״ל"],
    ["a katakana middle dot", "東京タワー・カフェ"],
    ["a Catalan middle dot", "Col·lecció"],
  ])("accepts the real name %s", (_label, name) => {
    expect(errorsOf({ ...VALID, name })).toEqual([]);
    expect(errorsOf({ ...VALID, tagline: name })).toEqual([]);
  });

  it.each([
    ["a run of katakana middle dots after a space", "Acme ・・・・・・"],
    ["a middle dot between a space and a letter", "Acme ·a·"],
    ["a trailing middle dot", "Acme·"],
    ["a leading middle dot", "·Acme"],
    ["a doubled middle dot", "Ac··me"],
    ["a katakana middle dot ending a word", "カフェ・"],
    ["a run of gereshim after a letter", "Acme א׳׳׳"],
    ["a geresh after a space", "Acme ׳"],
    ["a leading gershayim", "״Acme"],
    ["a doubled gershayim", "צה״״ל"],
    ["a geresh after a digit", "A1׳"],
  ])("refuses %s", (_label, name) => {
    expect(pathsOf({ ...VALID, name })).toEqual(["name"]);
  });

  it("counts length in code points, so letters outside the BMP count once", () => {
    const letter = String.fromCodePoint(0x1d49c);
    expect(errorsOf({ ...VALID, name: letter.repeat(NAME_MAX_LENGTH) })).toEqual([]);
    expect(pathsOf({ ...VALID, name: letter.repeat(NAME_MAX_LENGTH + 1) })).toEqual(["name"]);
    expect(errorsOf({ ...VALID, tagline: letter.repeat(TAGLINE_MAX_LENGTH) })).toEqual([]);
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
    expect(errorsOf({ ...VALID, favicon: "<svg/>" })).toEqual([
      expect.objectContaining({ path: "favicon", code: "unknown-key" }),
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

  it("reports a field whose getter throws once, as unreadable", () => {
    const getter = Object.defineProperty({ ...VALID }, "name", {
      enumerable: true,
      get() {
        throw new Error("boom");
      },
    });
    expect(errorsOf(getter)).toEqual([
      expect.objectContaining({ path: "name", code: "unreadable" }),
    ]);
  });

  class Kit {
    readonly id = "acme";
  }
  const notPlain: [string, unknown][] = [
    ["a Map", new Map(Object.entries(VALID))],
    ["a Date", new Date(0)],
    ["a class instance", new Kit()],
    ["a boxed string", new String("acme")],
  ];
  it.each(notPlain)("refuses %s with one error at the root", (_label, input) => {
    expect(errorsOf(input)).toEqual([expect.objectContaining({ path: "", code: "not-an-object" })]);
  });

  it("accepts an object without a prototype", () => {
    expect(
      errorsOf(
        Object.assign(Object.create(null) as object, VALID, {
          colors: Object.assign(Object.create(null) as object, VALID.colors),
        }),
      ),
    ).toEqual([]);
  });

  it("caps the errors it reports, ending with one that says so", () => {
    const input: Record<string, unknown> = { ...VALID };
    for (let index = 0; index < 500; index += 1) input[`extra${String(index)}`] = index;
    const errors = errorsOf(input);
    expect(errors).toHaveLength(MAX_REPORTED_ERRORS + 1);
    expect(errors.at(-1)).toEqual(expect.objectContaining({ path: "", code: "too-many-errors" }));
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

function sanitisedLogo(body: string, idPrefix = "logo-"): string {
  const result = sanitiseSvgLogo(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`,
    { idPrefix },
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.svg;
}

const LOGO = sanitisedLogo('<g id="g"><path d="M0 0H10V10Z" fill="#4f46e5"/></g><use href="#g"/>');
const MARK = sanitisedLogo('<circle cx="5" cy="5" r="5"/>', "mark-");

describe("parseBrandKit, logo and mark", () => {
  it("keeps a logo and a mark exactly as the sanitiser returned them", () => {
    const result = parseBrandKit({ ...VALID, logo: LOGO, mark: MARK });
    expect(result.ok && result.kit.logo).toBe(LOGO);
    expect(result.ok && result.kit.mark).toBe(MARK);
  });

  it("round-trips a kit's logo and mark through JSON", () => {
    const first = parseBrandKit({ ...VALID, logo: LOGO, mark: MARK });
    if (!first.ok) throw new Error("expected a kit");
    // Stored as JSON (a CMS field, a file) and read back, the logo is the same kit again.
    const stored = JSON.stringify({ ...VALID, logo: first.kit.logo, mark: first.kit.mark });
    const second = parseBrandKit(JSON.parse(stored));
    expect(second).toEqual(first);
  });

  it.each(["logo", "mark"])("treats an undefined %s as absent", (field) => {
    const result = parseBrandKit({ ...VALID, [field]: undefined });
    expect(result.ok && field in result.kit).toBe(false);
  });

  it.each([
    ["a script", LOGO.replace("</svg>", "<script>alert(1)</script></svg>")],
    ["an event handler", LOGO.replace("<path ", '<path onload="alert(1)" ')],
    [
      "an external reference",
      LOGO.replace('href="#logo-0"', 'href="https://attacker.invalid/x.svg#a"'),
    ],
    [
      "a file straight from an editor",
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>',
    ],
  ])("refuses a logo with %s until it is sanitised", (_label, logo) => {
    for (const field of ["logo", "mark"]) {
      expect(errorsOf({ ...VALID, [field]: logo })).toEqual([
        expect.objectContaining({ path: field, code: "unsanitised-logo" }),
      ]);
    }
  });

  it.each([
    [
      "a DOCTYPE",
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>',
      "doctype",
    ],
    ["malformed markup", "<svg><g></svg>", "mismatched-tag"],
    ["no SVG at all", "Acme", "malformed"],
    ["an empty string", "", "malformed"],
    [
      "a reference cycle",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><use id="u" href="#u"/></svg>',
      "reference-cycle",
    ],
  ])("refuses a logo with %s, naming the reason and where", (_label, logo, code) => {
    const [error] = errorsOf({ ...VALID, logo });
    expect(error).toEqual(expect.objectContaining({ path: "logo", code: "invalid-logo" }));
    expect(error?.message).toContain(code);
    expect(error?.message).not.toMatch(/ENTITY|alert|Acme/);
  });

  it.each([[42], [null], [{ svg: LOGO }], [[LOGO]]])(
    "refuses the logo %j as the wrong type",
    (logo) => {
      expect(errorsOf({ ...VALID, logo })).toEqual([
        expect.objectContaining({ path: "logo", code: "wrong-type" }),
      ]);
    },
  );

  it("reads the fixture kit with its logo and mark", () => {
    const fixture: unknown = JSON.parse(
      readFileSync(new URL("./__fixtures__/harbour-lights.kit.json", import.meta.url), "utf8"),
    );
    const result = parseBrandKit(fixture);
    expect(result.ok && result.kit.logo?.startsWith("<svg ")).toBe(true);
    expect(result.ok && result.kit.mark?.startsWith("<svg ")).toBe(true);
  });
});
