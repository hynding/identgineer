import { readFileSync } from "node:fs";
import {
  generateBrandTheme,
  parseBrandKit,
  type BrandKit,
  type BrandTheme,
} from "@identgineer/brand";
import { describe, expect, it } from "vitest";
import {
  readBackings,
  readCorners,
  readGradients,
  readImage,
  readName,
  readSourceColours,
  readTagline,
  readTone,
} from "./brand-guidelines-model";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);

function kitOf(file: string): BrandKit {
  const result = parseBrandKit(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")));
  if (!result.ok) throw new Error(`${file} is not a kit`);
  return result.kit;
}

const HARBOUR = kitOf("harbour-lights.kit.json");
const ACME = kitOf("acme.kit.json");
const HARBOUR_THEME: BrandTheme = generateBrandTheme(HARBOUR);
const ACME_THEME: BrandTheme = generateBrandTheme(ACME);

/** An object every read of throws, as a hostile getter or a revoked proxy would. */
const THROWING = new Proxy(
  {},
  {
    get(): never {
      throw new Error("no");
    },
    has(): never {
      throw new Error("no");
    },
    ownKeys(): never {
      throw new Error("no");
    },
    getOwnPropertyDescriptor(): never {
      throw new Error("no");
    },
  },
);

function withLight(theme: BrandTheme, light: Record<string, unknown>): unknown {
  return {
    ...theme,
    document: { ...theme.document, light: { ...theme.document.light, ...light } },
  };
}

describe("the name and the tagline", () => {
  it("are the kit's text", () => {
    expect(readName(HARBOUR)).toBe("Harbour Lights");
    expect(readTagline(HARBOUR)).toBe(HARBOUR.tagline ?? "");
    expect(readTagline(ACME)).toBe(ACME.tagline ?? "");
  });

  it("are cut at the kit's limits and have their invisible and bidirectional characters marked", () => {
    expect(Array.from(readName({ name: "n".repeat(100) })).length).toBe(60);
    expect(readName({ name: "n".repeat(100) }).endsWith("…")).toBe(true);
    expect(Array.from(readTagline({ tagline: "t".repeat(300) })).length).toBe(120);
    expect(readName({ name: "pay‮fdp.exe" })).not.toMatch(/‮/);
    expect(readName({ name: "a​b" })).toBe("a�b");
  });

  it.each([
    ["a number", 7],
    ["an object", {}],
    ["null", null],
    ["undefined", undefined],
    ["an array", ["a"]],
  ])("are empty when they are %s", (_name, value) => {
    expect(readName({ name: value })).toBe("");
    expect(readTagline({ tagline: value })).toBe("");
  });

  it("are empty for a kit that is not an object, or whose reads throw", () => {
    for (const kit of [undefined, null, "kit", 3, THROWING]) {
      expect(readName(kit)).toBe("");
      expect(readTagline(kit)).toBe("");
    }
  });

  it("have white space around them trimmed, and a name of white space is empty", () => {
    expect(readName({ name: "  Acme  " })).toBe("Acme");
    expect(readName({ name: "   " })).toBe("");
  });
});

describe("the logo and the mark", () => {
  it("are the kit's own text, to be checked by the logo component and not here", () => {
    expect(readImage(HARBOUR, "logo")).toBe(HARBOUR.logo);
    expect(readImage(HARBOUR, "mark")).toBe(HARBOUR.mark);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 5],
    ["an object", {}],
    ["an array", ["<svg/>"]],
    ["a throwing proxy", THROWING],
  ])("are nothing when they are %s", (_name, value) => {
    expect(readImage({ logo: value, mark: value }, "logo")).toBeUndefined();
    expect(readImage({ logo: value, mark: value }, "mark")).toBeUndefined();
  });

  it("are nothing for a kit that is not an object", () => {
    expect(readImage(undefined, "logo")).toBeUndefined();
    expect(readImage(THROWING, "mark")).toBeUndefined();
  });
});

describe("the colours a kit was made from", () => {
  it("are the primary, secondary and neutral tint, as hex, in that order", () => {
    expect(readSourceColours(HARBOUR)).toEqual([
      { role: "primary", value: "#f4c430" },
      { role: "neutralTint", value: "#1b2a4a" },
    ]);
    expect(readSourceColours(ACME)).toEqual([
      { role: "primary", value: "#4f46e5" },
      { role: "secondary", value: "#0f766e" },
    ]);
  });

  it.each([
    ["a float", [1.5, 2, 3]],
    ["a channel over 255", [0, 0, 256]],
    ["a negative channel", [-1, 0, 0]],
    ["NaN", [Number.NaN, 0, 0]],
    ["Infinity", [Number.POSITIVE_INFINITY, 0, 0]],
    ["a string channel", ["255", 0, 0]],
    ["two channels", [1, 2]],
    ["four channels", [1, 2, 3, 4]],
    ["a string", "#ff0000"],
    ["an object", { r: 1, g: 2, b: 3 }],
    ["a throwing proxy", THROWING],
  ])("leave out a colour that is %s, and keep the others", (_name, bad) => {
    expect(readSourceColours({ colors: { primary: [1, 2, 3], secondary: bad } })).toEqual([
      { role: "primary", value: "#010203" },
    ]);
  });

  it("are nothing for a kit without colours, or colours that are not an object", () => {
    for (const kit of [{}, { colors: null }, { colors: "red" }, undefined, THROWING]) {
      expect(readSourceColours(kit)).toEqual([]);
    }
  });

  it("do not read through the prototype", () => {
    const colors = Object.create({ primary: [1, 2, 3] }) as object;
    expect(readSourceColours({ colors })).toEqual([]);
  });
});

describe("the backings a logo is judged on", () => {
  it("are the brand's own page, text and accent colours, for the light scheme and the dark", () => {
    const backings = readBackings(HARBOUR_THEME);
    expect(backings.map((backing) => backing.scheme)).toEqual(["light", "dark"]);
    for (const backing of backings) {
      const colours = HARBOUR_THEME.document[backing.scheme].color;
      expect(backing).toEqual({
        scheme: backing.scheme,
        background: (colours.bg as { $value: string }).$value,
        text: (colours.text as { $value: string }).$value,
        accent: (colours.accent as { $value: string }).$value,
        onAccent: (colours["on-accent"] as { $value: string }).$value,
      });
    }
  });

  it("read the document alone as well", () => {
    expect(readBackings(ACME_THEME.document)).toEqual(readBackings(ACME_THEME));
  });

  it("leave out a scheme whose colours are not all the package's own format", () => {
    const hostile = withLight(ACME_THEME, {
      color: {
        ...ACME_THEME.document.light.color,
        bg: { $value: "red; background: url(https://example.com/x.png)" },
      },
    });
    expect(readBackings(hostile).map((backing) => backing.scheme)).toEqual(["dark"]);
  });

  it("are nothing for data that is not a theme", () => {
    for (const theme of [undefined, null, "theme", 4, {}, THROWING]) {
      expect(readBackings(theme)).toEqual([]);
    }
  });
});

describe("the gradients", () => {
  it("are the brand gradient of each scheme, as the tokens package writes a gradient", () => {
    expect(readGradients(HARBOUR_THEME)).toEqual([
      {
        scheme: "light",
        stops: [
          { colour: "#f4c430", percent: 0 },
          { colour: "#ffb982", percent: 100 },
        ],
        value: "linear-gradient(135deg, #f4c430 0%, #ffb982 100%)",
      },
      expect.objectContaining({ scheme: "dark" }),
    ]);
  });

  const gradientOf = (value: unknown) => ({
    document: {
      light: { color: {}, gradient: { brand: { $value: value } } },
      dark: { color: {} },
    },
  });

  it("keeps a position written as a fraction to two decimals of a percent", () => {
    const [light] = readGradients(
      gradientOf([
        { color: "#000000", position: 0.3333333 },
        { color: "#ffffff", position: 1 },
      ]),
    );
    expect(light?.value).toBe("linear-gradient(135deg, #000000 33.33%, #ffffff 100%)");
  });

  it("holds two to four stops, in the order the theme gives them", () => {
    const stops = (count: number) =>
      Array.from({ length: count }, (_unused, index) => ({
        color: "#102030",
        position: index / Math.max(count - 1, 1),
      }));
    expect(readGradients(gradientOf(stops(1)))).toEqual([]);
    expect(readGradients(gradientOf(stops(2)))).toHaveLength(1);
    expect(readGradients(gradientOf(stops(4)))).toHaveLength(1);
    expect(readGradients(gradientOf(stops(5)))).toEqual([]);
  });

  it.each([
    ["a named colour", "red"],
    ["a colour with a declaration after it", "#ffffff; background: url(https://example.com/x.png)"],
    ["an upper case colour", "#FFFFFF"],
    ["a short colour", "#fff"],
    ["a function", "rgb(0, 0, 0)"],
    ["a variable", "var(--x)"],
    ["a number", 16777215],
    ["nothing", undefined],
  ])("drop the whole gradient when a stop's colour is %s", (_name, color) => {
    expect(
      readGradients(
        gradientOf([
          { color: "#000000", position: 0 },
          { color, position: 1 },
        ]),
      ),
    ).toEqual([]);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["below zero", -0.1],
    ["above one", 1.01],
    ["a string", "1"],
    ["nothing", undefined],
  ])("drop the whole gradient when a stop's position is %s", (_name, position) => {
    expect(
      readGradients(
        gradientOf([
          { color: "#000000", position: 0 },
          { color: "#ffffff", position },
        ]),
      ),
    ).toEqual([]);
  });

  it("keeps a scheme's gradient when the other's is bad", () => {
    const theme = {
      document: {
        light: { color: {}, gradient: { brand: { $value: "red" } } },
        dark: HARBOUR_THEME.document.dark,
      },
    };
    expect(readGradients(theme).map((gradient) => gradient.scheme)).toEqual(["dark"]);
  });

  it("writes only characters a validated gradient has", () => {
    for (const gradient of readGradients(HARBOUR_THEME)) {
      expect(gradient.value).toMatch(/^linear-gradient\(135deg(?:, #[0-9a-f]{6} [0-9.]+%)+\)$/);
    }
  });

  it("are nothing for data that is not a theme", () => {
    for (const theme of [undefined, null, "theme", {}, { document: null }, THROWING]) {
      expect(readGradients(theme)).toEqual([]);
    }
    expect(readGradients(gradientOf({ length: 2 }))).toEqual([]);
    expect(readGradients(gradientOf([THROWING, THROWING]))).toEqual([]);
  });
});

describe("the corners", () => {
  it("are the theme's radii, with the style the kit names", () => {
    expect(readCorners(HARBOUR, HARBOUR_THEME)).toEqual({
      style: "round",
      radii: [
        { name: "sm", value: "0.5rem" },
        { name: "md", value: "1rem" },
        { name: "lg", value: "1.5rem" },
        { name: "pill", value: "9999px" },
      ],
    });
  });

  it("fall back to the radii of the kit's corner style when there is no theme", () => {
    expect(readCorners(ACME, undefined)).toEqual({
      style: "soft",
      radii: [
        { name: "sm", value: "0.25rem" },
        { name: "md", value: "0.5rem" },
        { name: "lg", value: "0.75rem" },
        { name: "pill", value: "9999px" },
      ],
    });
    expect(readCorners(ACME, ACME_THEME.document).radii).toHaveLength(4);
  });

  it.each([
    ["a declaration after it", "0.5rem; background: red"],
    ["a function", "calc(1px)"],
    ["an exponent", "1e3rem"],
    ["a negative value", "-1rem"],
    ["a percentage", "50%"],
    ["a unit that is not allowed", "5vw"],
    ["too large", "10000px"],
    ["a number", 8],
    ["nothing", undefined],
  ])("leave out a radius that is %s, and keep the others", (_name, value) => {
    const theme = { document: ACME_THEME.document, radius: { ...ACME_THEME.radius, md: value } };
    expect(readCorners(ACME, theme).radii.map((radius) => radius.name)).toEqual([
      "sm",
      "lg",
      "pill",
    ]);
  });

  it("give no style for one the kit does not name, and no radii without one to fall back on", () => {
    expect(readCorners({ corners: "bevelled" }, undefined)).toEqual({
      style: undefined,
      radii: [],
    });
    expect(readCorners({ corners: "bevelled" }, ACME_THEME).radii).toHaveLength(4);
    expect(readCorners(THROWING, THROWING)).toEqual({ style: undefined, radii: [] });
  });

  it("do not read a radius through the prototype", () => {
    const radius = Object.create({ sm: "1rem" }) as Record<string, string>;
    expect(
      readCorners({ corners: "bevelled" }, { document: ACME_THEME.document, radius }).radii,
    ).toEqual([]);
  });
});

describe("the tone", () => {
  it.each(["calm", "balanced", "vivid"])("is %s when the kit says so", (tone) => {
    expect(readTone({ tone })).toBe(tone);
  });

  it.each([["loud"], [7], [undefined], [null], [{}], ["__proto__"], ["constructor"]])(
    "is nothing when the kit says %s",
    (tone) => {
      expect(readTone({ tone })).toBeUndefined();
    },
  );

  it("is nothing for a kit whose reads throw", () => {
    expect(readTone(THROWING)).toBeUndefined();
    expect(readTone(undefined)).toBeUndefined();
  });
});
