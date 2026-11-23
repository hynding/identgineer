import { contrastRatio } from "@identgineer/tokens";

// Test support. The colour pairings the components draw (text and indicators on the page, cards,
// popovers and tinted rows) at their WCAG level, 4.5 for text and 3 for indicators, for every pairing
// all eight built-in themes meet in both schemes. used-pairs.test.ts checks the built-in themes
// against it, so the list cannot ask more than they give; the property test holds every generated
// theme to all of it. Warning is left out: as a colour on the page the built-in themes do not
// reach 3:1 with it either (amber on a light page).

export interface UsedPair {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: 4.5 | 3;
}

const PAGE = ["bg", "bg-subtle", "surface", "surface-raised"] as const;
const text = (foreground: string, backgrounds: readonly string[]): UsedPair[] =>
  backgrounds.map((background) => ({ foreground, background, minimum: 4.5 }));
const nonText = (foreground: string, backgrounds: readonly string[]): UsedPair[] =>
  backgrounds.map((background) => ({ foreground, background, minimum: 3 }));

export const BUILT_IN_PAIRS: readonly UsedPair[] = [
  ...text("text", [...PAGE, "accent-subtle"]),
  ...text("text-muted", [...PAGE, "accent-subtle"]),
  ...text("link", [...PAGE, "accent-subtle"]),
  ...text("on-accent-subtle", PAGE),
  ...nonText("focus-ring", [...PAGE, "accent-subtle"]),
  ...nonText("border-strong", ["bg", "surface", "surface-raised"]),
  ...nonText("danger", PAGE),
  ...nonText("success", PAGE),
  ...nonText("info", PAGE),
];

export function failingUsedPairs(colors: ReadonlyMap<string, string>): string[] {
  return BUILT_IN_PAIRS.flatMap(({ foreground, background, minimum }) => {
    const ratio = contrastRatio(colors.get(foreground) ?? "", colors.get(background) ?? "");
    return ratio >= minimum
      ? []
      : [`${foreground} on ${background} is ${ratio.toFixed(2)}:1, needs ${String(minimum)}:1`];
  });
}
