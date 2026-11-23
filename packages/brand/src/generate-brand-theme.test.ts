import { contrastRatio } from "@identgineer/tokens";
import { findThemeProblems } from "@identgineer/tokens/theme-pipeline";
import { describe, expect, it } from "vitest";
import { emitBrandThemeCss } from "./emit-brand-theme.ts";
import { fontPairingFor } from "./font-pairings.ts";
import { ACCENT_BLENDS_WITH_PAGE } from "./generate-palette.ts";
import { generateBrandTheme, type BrandTheme } from "./generate-brand-theme.ts";
import { toOklab, toOklch } from "./oklch.ts";
import { parseHexColor } from "./srgb.ts";
import {
  contrastProblems,
  hueDistance,
  kitFrom,
  parsedTheme,
  resolvedColors,
  SEMANTIC,
} from "./test-support.ts";

function chromaOf(hex: string | undefined): number {
  const rgb = parseHexColor(hex ?? "");
  if (!rgb) throw new Error(`not a colour: ${String(hex)}`);
  return toOklch(rgb).chroma;
}

function hueOf(hex: string | undefined): number {
  const rgb = parseHexColor(hex ?? "");
  if (!rgb) throw new Error(`not a colour: ${String(hex)}`);
  return toOklch(rgb).hue;
}

const SAMPLES: readonly [string, BrandTheme][] = [
  ["indigo", generateBrandTheme(kitFrom())],
  [
    "orange with a teal secondary",
    generateBrandTheme(kitFrom({ colors: { primary: "#f97316", secondary: "#14b8a6" } })),
  ],
  ["white", generateBrandTheme(kitFrom({ colors: { primary: "#ffffff" } }))],
  ["black", generateBrandTheme(kitFrom({ colors: { primary: "#000000" } }))],
  ["mid grey", generateBrandTheme(kitFrom({ colors: { primary: "#777777" } }))],
  ["yellow, vivid", generateBrandTheme(kitFrom({ colors: { primary: "#ffff00" }, tone: "vivid" }))],
  [
    "navy, calm, tinted",
    generateBrandTheme(
      kitFrom({ colors: { primary: "#001f3f", neutralTint: "#a0522d" }, tone: "calm" }),
    ),
  ],
];

describe.each(SAMPLES)("generateBrandTheme, %s", (_name, theme) => {
  it("defines every theme-owned role in both schemes and nothing else, by the tokens check", () => {
    expect(findThemeProblems(parsedTheme(theme), SEMANTIC)).toEqual([]);
  });

  it("passes the tokens contrast suite in both schemes", () => {
    expect(contrastProblems(theme)).toEqual([]);
  });

  it("reports only real adjustments, each now passing and matching the theme", () => {
    for (const adjustment of theme.adjustments) {
      expect(adjustment.used).not.toBe(adjustment.requested);
      expect(adjustment.contrastBefore).toBeLessThan(adjustment.minimum);
      expect(adjustment.contrastAfter).toBeGreaterThanOrEqual(adjustment.minimum);
      const colors = resolvedColors(theme, adjustment.scheme);
      const role = adjustment.token.replace(/^color\./, "");
      const against = adjustment.against.replace(/^color\./, "");
      expect(colors.get(role)).toBe(adjustment.used);
      expect(contrastRatio(adjustment.used, colors.get(against) ?? "")).toBe(
        adjustment.contrastAfter,
      );
      expect(contrastRatio(adjustment.requested, colors.get(against) ?? "")).toBe(
        adjustment.contrastBefore,
      );
    }
  });
});

describe("generateBrandTheme", () => {
  it("is deterministic", () => {
    const kit = kitFrom({ colors: { primary: "#c2410c", secondary: "#65a30d" }, tone: "vivid" });
    expect(JSON.stringify(generateBrandTheme(kit))).toBe(JSON.stringify(generateBrandTheme(kit)));
  });

  it("uses a primary that carries text unchanged in both schemes", () => {
    const theme = generateBrandTheme(kitFrom({ colors: { primary: "#2f9e44" } }));
    expect(resolvedColors(theme, "light").get("accent")).toBe("#2f9e44");
    expect(resolvedColors(theme, "dark").get("accent")).toBe("#2f9e44");
    expect(theme.adjustments.filter((entry) => entry.token === "color.accent")).toEqual([]);
  });

  it.each([
    ["#facc15", "light"],
    ["#f59e0b", "light"],
    ["#ffffff", "light"],
    ["#111827", "dark"],
    ["#000000", "dark"],
    ["#1d4ed8", "dark"],
    ["#10b981", "light"],
    ["#0000ff", "dark"],
  ] as const)(
    "keeps %s as the %s accent fill and marks state with an indicator that reaches 3:1",
    (primary, scheme) => {
      const theme = generateBrandTheme(kitFrom({ colors: { primary } }));
      const colors = resolvedColors(theme, scheme);
      expect(colors.get("accent")).toBe(primary);
      for (const background of ["bg", "bg-subtle", "surface", "surface-raised", "accent-subtle"]) {
        for (const role of ["accent-indicator", "accent-border"]) {
          if (role === "accent-border" && background === "accent-subtle") continue;
          expect(
            contrastRatio(colors.get(role) ?? "", colors.get(background) ?? ""),
            `${role} on ${background}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
      expect(
        contrastRatio(
          colors.get("on-accent-indicator") ?? "",
          colors.get("accent-indicator") ?? "",
        ),
      ).toBeGreaterThanOrEqual(4.5);
      const indicator = theme.adjustments.find(
        (entry) => entry.token === "color.accent-indicator" && entry.scheme === scheme,
      );
      expect(indicator).toMatchObject({ origin: "primary", requested: primary, minimum: 3 });
    },
  );

  it.each([
    ["#ffffff", "light"],
    ["#fafafa", "light"],
    ["#111827", "dark"],
    ["#000000", "dark"],
  ] as const)("notes that %s blends with the %s page, for the brand guide", (primary, scheme) => {
    const theme = generateBrandTheme(kitFrom({ colors: { primary } }));
    const notes = theme.notes.filter((note) => note.kind === "accent-blends-with-page");
    expect(notes).toEqual([
      {
        scheme,
        kind: "accent-blends-with-page",
        token: "color.accent",
        against: "color.bg",
        contrast: contrastRatio(primary, resolvedColors(theme, scheme).get("bg") ?? ""),
      },
    ]);
    expect(notes[0]?.contrast).toBeLessThan(ACCENT_BLENDS_WITH_PAGE);
  });

  it("does not note an accent that stands apart from the page, even below 3:1", () => {
    for (const primary of ["#4f46e5", "#f59e0b", "#0ea5e9"]) {
      const theme = generateBrandTheme(kitFrom({ colors: { primary } }));
      expect(
        theme.notes.filter((note) => note.kind === "accent-blends-with-page"),
        primary,
      ).toEqual([]);
    }
  });

  it("notes a status colour that sits close to the accent, for the brand guide", () => {
    const red = generateBrandTheme(kitFrom({ colors: { primary: "#dc2626" } }));
    expect(red.notes).toContainEqual(
      expect.objectContaining({
        kind: "status-near-accent",
        scheme: "light",
        token: "color.danger",
        against: "color.accent",
      }),
    );
    const indigo = generateBrandTheme(kitFrom());
    expect(indigo.notes.filter((note) => note.token === "color.danger")).toEqual([]);
  });

  it("keeps a mid grey that neither white nor near-black text passes on, with black text", () => {
    const theme = generateBrandTheme(kitFrom({ colors: { primary: "#777777" } }));
    for (const scheme of ["light", "dark"] as const) {
      const colors = resolvedColors(theme, scheme);
      expect(colors.get("accent")).toBe("#777777");
      expect(colors.get("on-accent")).toBe("#000000");
    }
    expect(theme.adjustments.filter((entry) => entry.token === "color.accent")).toEqual([]);
  });

  it("moves an adjusted accent in lightness only, keeping its hue", () => {
    for (const primary of ["#e0602c", "#2f9e44", "#8a63d2", "#d6336c", "#1c7ed6"]) {
      const theme = generateBrandTheme(kitFrom({ colors: { primary } }));
      for (const scheme of ["light", "dark"] as const) {
        const accent = resolvedColors(theme, scheme).get("accent");
        expect(hueDistance(hueOf(accent), hueOf(primary)), `${primary} ${scheme}`).toBeLessThan(3);
      }
    }
  });

  it("follows the secondary colour for the focus ring and the end of the gradient", () => {
    const theme = generateBrandTheme(
      kitFrom({ colors: { primary: "#4f46e5", secondary: "#0f766e" } }),
    );
    expect(resolvedColors(theme, "light").get("focus-ring")).toBe("#0f766e");
    const gradient = theme.document.light.gradient.brand.$value;
    expect(gradient.at(-1)?.color).toBe("#0f766e");
    expect(gradient[0]?.color).toBe("#4f46e5");
  });

  it.each(["#d97706", "#f4c430", "#4f46e5", "#14b8a6", "#dc2626", "#16a34a", "#9333ea"])(
    "pairs %s in its gradient with an analogous hue that stays as colourful, not a muddy one",
    (primary) => {
      const theme = generateBrandTheme(kitFrom({ colors: { primary } }));
      for (const scheme of ["light", "dark"] as const) {
        const [start, end] = theme.document[scheme].gradient.brand.$value;
        expect(start?.color, scheme).toBe(primary);
        const from = toOklch(parseHexColor(primary) ?? [0, 0, 0]);
        const to = toOklch(parseHexColor(end?.color ?? "") ?? [0, 0, 0]);
        const turn = hueDistance(from.hue, to.hue);
        expect(turn, `${primary} ${scheme}`).toBeGreaterThanOrEqual(25);
        expect(turn, `${primary} ${scheme}`).toBeLessThanOrEqual(50);
        expect(to.chroma, `${primary} ${scheme}`).toBeGreaterThanOrEqual(from.chroma * 0.6);
        expect(Math.abs(to.lightness - from.lightness), `${primary} ${scheme}`).toBeLessThan(0.02);
      }
    },
  );

  it.each([
    ["#16a34a", "teal"],
    ["#f59e0b", "coral"],
  ])("turns %s in its gradient away from the olive band, towards %s", (primary) => {
    const theme = generateBrandTheme(kitFrom({ colors: { primary } }));
    const [, end] = theme.document.light.gradient.brand.$value;
    const to = toOklch(parseHexColor(end?.color ?? "") ?? [0, 0, 0]);
    const olive = to.hue >= 95 && to.hue <= 135 && to.lightness < 0.85;
    expect(olive, `${primary} ends at ${String(end?.color)}`).toBe(false);
  });

  it.each(["#111827", "#000000", "#ffffff", "#0b1d3a"])(
    "gives %s a gradient whose ends can be told apart",
    (primary) => {
      const theme = generateBrandTheme(kitFrom({ colors: { primary } }));
      const [start, end] = theme.document.light.gradient.brand.$value;
      expect(start?.color).toBe(primary);
      const from = toOklab(parseHexColor(primary) ?? [0, 0, 0]);
      const to = toOklab(parseHexColor(end?.color ?? "") ?? [0, 0, 0]);
      const distance = Math.hypot(to.lightness - from.lightness, to.a - from.a, to.b - from.b);
      expect(distance, `${primary} ends at ${String(end?.color)}`).toBeGreaterThanOrEqual(0.08);
      // OKLab overstates differences next to black, so the ends must also differ in luminance.
      expect(
        contrastRatio(primary, end?.color ?? ""),
        `${primary} ends at ${String(end?.color)}`,
      ).toBeGreaterThanOrEqual(1.5);
    },
  );

  it("turns a grey primary's gradient in lightness, staying grey", () => {
    const theme = generateBrandTheme(kitFrom({ colors: { primary: "#777777" } }));
    const [start, end] = theme.document.light.gradient.brand.$value;
    expect(start?.color).toBe("#777777");
    const to = toOklch(parseHexColor(end?.color ?? "") ?? [0, 0, 0]);
    expect(to.chroma).toBeLessThan(0.01);
    expect(Math.abs(to.lightness - toOklch([119, 119, 119]).lightness)).toBeGreaterThan(0.08);
  });

  it("tints the neutrals with the neutral tint's hue", () => {
    const theme = generateBrandTheme(
      kitFrom({ colors: { primary: "#4f46e5", neutralTint: "#b45309" } }),
    );
    for (const scheme of ["light", "dark"] as const) {
      const bgSubtle = resolvedColors(theme, scheme).get("bg-subtle");
      expect(hueDistance(hueOf(bgSubtle), hueOf("#b45309")), scheme).toBeLessThan(15);
    }
  });

  it("makes calm quieter and vivid stronger than balanced", () => {
    const chromaFor = (tone: string, role: string) =>
      chromaOf(resolvedColors(generateBrandTheme(kitFrom({ tone })), "light").get(role));
    for (const role of ["bg-subtle", "accent-subtle", "success-subtle", "danger"]) {
      expect(chromaFor("calm", role), role).toBeLessThan(chromaFor("balanced", role));
      expect(chromaFor("balanced", role), role).toBeLessThan(chromaFor("vivid", role));
    }
  });

  it("writes the font pairing into the typography roles", () => {
    const theme = generateBrandTheme(kitFrom({ typography: "classic-serif" }));
    const pairing = fontPairingFor("classic-serif");
    expect(theme.document.common.font.family.display.$value).toEqual(pairing.display);
    expect(theme.document.common.font.family.body.$value).toEqual(pairing.body);
    expect(theme.document.common.font.family.mono.$value).toEqual(pairing.mono);
    expect(theme.document.common.font.display.weight.$value).toBe(pairing.displayWeight);
  });

  it("maps corners to radii, sharp smallest and round largest", () => {
    const rem = (value: string) => (value.endsWith("px") ? 1000 : Number.parseFloat(value));
    const radii = (corners: string) => generateBrandTheme(kitFrom({ corners })).radius;
    for (const size of ["sm", "md", "lg"] as const) {
      expect(rem(radii("sharp")[size])).toBeLessThan(rem(radii("soft")[size]));
      expect(rem(radii("soft")[size])).toBeLessThan(rem(radii("round")[size]));
    }
    expect(Object.keys(radii("soft"))).toEqual(["sm", "md", "lg", "pill"]);
  });

  it("names the theme after the kit and records the kit's choices", () => {
    const theme = generateBrandTheme(
      kitFrom({ name: "Acme Rockets", tagline: "Up we go!", tone: "calm" }),
    );
    const parsed = parsedTheme(theme);
    expect(parsed.label).toBe("Acme Rockets");
    expect(parsed.description).toBe("Up we go!");
    expect(theme.document.$extensions.identgineer.brand).toMatchObject({
      typography: "system",
      corners: "soft",
      tone: "calm",
      colors: { primary: "#4f46e5" },
    });
    expect(parsedTheme(generateBrandTheme(kitFrom())).description).toBe("Brand theme for Acme");
  });

  it("reads a hand-built kit once: a getter cannot pass validation and then change", () => {
    const reads = { id: 0, tone: 0 };
    const kit = Object.defineProperties(
      { ...kitFrom() },
      {
        id: {
          enumerable: true,
          get: () => (reads.id++ === 0 ? "acme" : 'x"] body{display:none} [y="'),
        },
        tone: {
          enumerable: true,
          get: () => (reads.tone++ === 0 ? "balanced" : "__proto__"),
        },
      },
    );
    const theme = generateBrandTheme(kit);
    expect(theme.id).toBe("acme");
    expect(theme.kit.tone).toBe("balanced");
    expect(Object.isFrozen(theme.kit)).toBe(true);
    const css = emitBrandThemeCss(theme);
    expect(css).not.toContain("body{");
    expect(reads).toEqual({ id: 1, tone: 1 });
  });

  it("refuses a hand-built kit whose id is not a valid brand id", () => {
    expect(() => generateBrandTheme({ ...kitFrom(), id: 'x"]' })).toThrow(/brand id/);
    expect(() => generateBrandTheme({ ...kitFrom(), id: "aurora" })).toThrow(/brand id/);
  });
});
