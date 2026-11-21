import { contrastRatio } from "./contrast.ts";

export interface ContrastPair {
  readonly foreground: string;
  readonly background: string;
  /** WCAG 2.2 AA: 4.5 for text (1.4.3), 3 for non-text UI (1.4.11). */
  readonly minimum: 4.5 | 3;
}

export interface ContrastFailure {
  readonly pair: ContrastPair;
  readonly reason: "low-contrast" | "missing";
  readonly ratio: number | undefined;
  readonly missingRole: string | undefined;
}

const text = (foreground: string, background: string): ContrastPair => ({
  foreground,
  background,
  minimum: 4.5,
});
const nonText = (foreground: string, background: string): ContrastPair => ({
  foreground,
  background,
  minimum: 3,
});

const STATUSES = ["success", "warning", "danger", "info"] as const;

/** Roles are colour token names without the `color.` prefix. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  text("text", "bg"),
  text("text", "surface"),
  text("text", "surface-raised"),
  text("text-muted", "bg"),
  text("text-muted", "surface"),
  text("on-accent", "accent"),
  text("on-accent", "accent-hover"),
  text("on-accent-subtle", "accent-subtle"),
  text("link", "bg"),
  ...STATUSES.flatMap((status) => [
    text(`on-${status}`, status),
    text(`on-${status}-subtle`, `${status}-subtle`),
  ]),
  nonText("focus-ring", "bg"),
  nonText("border-strong", "bg"),
];

export function findContrastFailures(colors: ReadonlyMap<string, string>): ContrastFailure[] {
  return CONTRAST_PAIRS.flatMap((pair): ContrastFailure[] => {
    const foreground = colors.get(pair.foreground);
    const background = colors.get(pair.background);
    const missingRole =
      foreground === undefined
        ? pair.foreground
        : background === undefined
          ? pair.background
          : undefined;
    if (foreground === undefined || background === undefined) {
      return [{ pair, reason: "missing", ratio: undefined, missingRole }];
    }
    const ratio = contrastRatio(foreground, background);
    return ratio >= pair.minimum
      ? []
      : [{ pair, reason: "low-contrast", ratio, missingRole: undefined }];
  });
}

export function formatContrastFailure(
  theme: string,
  scheme: string,
  failure: ContrastFailure,
): string {
  const { foreground, background, minimum } = failure.pair;
  const prefix = `${theme} ${scheme}: ${foreground} on ${background}`;
  if (failure.reason === "missing") {
    return `${prefix} cannot be checked, "${failure.missingRole ?? "?"}" is not defined`;
  }
  return `${prefix} is ${(failure.ratio ?? 0).toFixed(2)}:1, needs ${String(minimum)}:1`;
}
