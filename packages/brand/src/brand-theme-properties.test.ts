import { contrastRatio } from "@identgineer/tokens";
import { findThemeProblems } from "@identgineer/tokens/theme-pipeline";
import { describe, expect, it } from "vitest";
import { CORNERS, TONES } from "./brand-kit.ts";
import { TYPOGRAPHY_IDS } from "./font-pairings.ts";
import { generateBrandTheme } from "./generate-brand-theme.ts";
import { toOklch } from "./oklch.ts";
import { formatHexColor, parseHexColor, type Rgb } from "./srgb.ts";
import { seeded } from "./seeded-random.ts";
import { BUILT_IN_PAIRS, failingUsedPairs } from "./used-pairs.ts";
import {
  contrastProblems,
  hueDistance,
  kitFrom,
  parsedTheme,
  resolvedColors,
  SEMANTIC,
} from "./test-support.ts";

// The acceptance property of feature 15: any two valid brand colours give a theme that passes the
// whole contrast suite in both schemes, for every tone and corner style. A failure names the seed
// and the case, so it can be replayed exactly.
const SEED = 15_018;
const RANDOM_CASES = 2_700;

/** An adjusted brand colour keeps its hue within this many degrees while it still has colour. */
const MAX_HUE_SHIFT = 3;
/** Below this chroma a colour is close enough to grey that its hue is not what makes it the brand's. */
const HUE_MATTERS = 0.04;

interface Case {
  readonly label: string;
  readonly colors: Record<string, string>;
  readonly tone: string;
  readonly corners: string;
  readonly typography: string;
}

const EDGE_PAIRS: readonly (readonly [string, string | undefined, string | undefined])[] = [
  ["#ffffff", undefined, undefined],
  ["#000000", undefined, undefined],
  ["#fefefe", "#010101", undefined],
  ["#010101", "#fefefe", "#ffffff"],
  ["#808080", "#808080", "#808080"],
  ["#777777", undefined, "#000000"],
  ["#767676", "#777777", undefined],
  ["#ff0000", "#ff0000", undefined],
  ["#00ff00", "#00ff01", undefined],
  ["#0000ff", "#0000fe", "#0000ff"],
  ["#ffff00", "#ffff01", undefined],
  ["#00ffff", "#ff00ff", "#ffff00"],
  ["#ff00ff", undefined, "#00ff00"],
  ["#4f46e5", "#4f46e6", undefined],
  ["#f97316", "#f97316", "#f97316"],
  ["#14b8a6", undefined, undefined],
  ["#fbbf24", "#dc2626", undefined],
  ["#e0e0ff", "#ffe0e0", "#e0ffe0"],
  ["#1a0033", "#330019", "#001a33"],
  ["#00ff88", undefined, "#ff0088"],
];

function edgeCases(): Case[] {
  return EDGE_PAIRS.flatMap(([primary, secondary, neutralTint], index) =>
    TONES.flatMap((tone) =>
      CORNERS.map((corners) => ({
        label: `edge ${String(index)}`,
        colors: {
          primary,
          ...(secondary !== undefined && { secondary }),
          ...(neutralTint !== undefined && { neutralTint }),
        },
        tone,
        corners,
        typography: TYPOGRAPHY_IDS[index % TYPOGRAPHY_IDS.length] ?? "system",
      })),
    ),
  );
}

function randomCases(seed: number, count: number): Case[] {
  const random = seeded(seed);
  const channel = () => Math.floor(random() * 256);
  const color = () => formatHexColor([channel(), channel(), channel()]);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  return Array.from({ length: count }, (_, index) => {
    const primary = color();
    const secondary = random() < 0.8 ? color() : undefined;
    const neutralTint = random() < 0.5 ? color() : undefined;
    return {
      label: `random ${String(index)}`,
      colors: {
        primary,
        ...(secondary !== undefined && { secondary }),
        ...(neutralTint !== undefined && { neutralTint }),
      },
      tone: TONES[index % TONES.length] ?? "balanced",
      corners: CORNERS[Math.floor(index / TONES.length) % CORNERS.length] ?? "soft",
      typography: pick(TYPOGRAPHY_IDS),
    };
  });
}

function rgbOf(hex: string): Rgb {
  const rgb = parseHexColor(hex);
  if (!rgb) throw new Error(`not a colour: ${hex}`);
  return rgb;
}

const PAGE_BACKGROUNDS = ["bg", "bg-subtle", "surface", "surface-raised"];

function weakestOnPage(colors: ReadonlyMap<string, string>, role: string): number {
  return Math.min(
    ...PAGE_BACKGROUNDS.map((background) =>
      contrastRatio(colors.get(role) ?? "", colors.get(background) ?? ""),
    ),
  );
}

/**
 * The indicator and the fill's edge reach 3:1 on every page background (the suite checks that
 * too) and are the accent's own colours wherever the accent already does; the hover differs.
 */
function accentRoleProblems(colors: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  for (const role of ["accent-indicator", "accent-border"]) {
    const ratio = weakestOnPage(colors, role);
    if (ratio < 3) problems.push(`${role} is ${ratio.toFixed(2)}:1 on the page`);
  }
  if (weakestOnPage(colors, "accent") >= 3) {
    for (const [role, own] of [
      ["accent-indicator", "accent"],
      ["accent-border", "accent"],
      ["on-accent-indicator", "on-accent"],
    ] as const) {
      if (colors.get(role) !== colors.get(own)) {
        problems.push(`${role} differs from ${own} although the accent passes on the page`);
      }
    }
  }
  if (colors.get("accent-hover") === colors.get("accent"))
    problems.push("accent-hover is the accent");
  return problems;
}

/** Problems with one case, each naming it; empty when the case holds. */
function checkCase(entry: Case): string[] {
  const where = `seed ${String(SEED)}, ${entry.label} ${JSON.stringify(entry)}`;
  const { colors, tone, corners, typography } = entry;
  const theme = generateBrandTheme(kitFrom({ colors, tone, corners, typography }));
  const problems = [...findThemeProblems(parsedTheme(theme), SEMANTIC), ...contrastProblems(theme)];
  for (const adjustment of theme.adjustments) {
    if (adjustment.origin === "generated") continue;
    const requested = toOklch(rgbOf(adjustment.requested));
    const used = toOklch(rgbOf(adjustment.used));
    if (requested.chroma >= HUE_MATTERS && used.chroma >= HUE_MATTERS) {
      const shift = hueDistance(requested.hue, used.hue);
      if (shift > MAX_HUE_SHIFT) {
        problems.push(`${adjustment.scheme} ${adjustment.token} hue moved ${shift.toFixed(1)}°`);
      }
    }
  }
  for (const scheme of ["light", "dark"] as const) {
    const colors = resolvedColors(theme, scheme);
    problems.push(...failingUsedPairs(colors).map((failure) => `${scheme} ${failure}`));
    problems.push(...accentRoleProblems(colors).map((problem) => `${scheme} ${problem}`));
  }
  for (const scheme of ["light", "dark"] as const) {
    // White, black or the near-black text the generator prefers reaches 4.5:1 on any colour, so the
    // fill is always the brand's own; the page is the indicator's business.
    const accent = resolvedColors(theme, scheme).get("accent");
    if (accent !== entry.colors.primary) {
      problems.push(`${scheme} accent ${String(accent)} is not the primary`);
    }
  }
  return problems.map((problem) => `${where}: ${problem}`);
}

describe("brand theme properties", () => {
  it("holds for hand-picked edge colours, for every tone and corner style", () => {
    expect(edgeCases().flatMap(checkCase)).toEqual([]);
  });

  // Thousands of generated themes take longer than the default five seconds on a shared runner.
  it(
    `holds for ${String(RANDOM_CASES)} random colour sets (seed ${String(SEED)})`,
    { timeout: 120_000 },
    () => {
      const failures: string[] = [];
      for (const entry of randomCases(SEED, RANDOM_CASES)) {
        failures.push(...checkCase(entry));
        if (failures.length > 20) break;
      }
      expect(failures).toEqual([]);
    },
  );

  it("holds generated themes to pairs every built-in theme passes", () => {
    expect(BUILT_IN_PAIRS.length).toBeGreaterThan(20);
  });

  it("covers every tone and corner style with the random cases", () => {
    const seen = new Set(
      randomCases(SEED, RANDOM_CASES).map((entry) => `${entry.tone} ${entry.corners}`),
    );
    expect(seen.size).toBe(TONES.length * CORNERS.length);
  });
});
