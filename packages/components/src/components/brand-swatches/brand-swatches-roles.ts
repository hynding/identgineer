export type SwatchGroupId = "page" | "text" | "accent" | "status";

export interface SwatchGroupDefinition {
  readonly id: SwatchGroupId;
  /** Colour roles, as the brand package's theme names them. */
  readonly roles: readonly string[];
}

const STATUSES = ["success", "warning", "danger", "info"] as const;

/**
 * The colour roles of a generated theme, in the order a reader looks for them. The roles shown
 * are these and nothing a theme brings with it, so a name never comes from the data.
 */
export const SWATCH_GROUPS: readonly SwatchGroupDefinition[] = [
  {
    id: "page",
    roles: ["bg", "bg-subtle", "surface", "surface-raised", "border", "border-strong"],
  },
  { id: "text", roles: ["text", "text-muted", "link", "focus-ring"] },
  {
    id: "accent",
    roles: [
      "accent",
      "on-accent",
      "accent-hover",
      "accent-subtle",
      "on-accent-subtle",
      "accent-indicator",
      "on-accent-indicator",
      "accent-border",
    ],
  },
  {
    id: "status",
    roles: STATUSES.flatMap((status) => [
      status,
      `on-${status}`,
      `${status}-subtle`,
      `on-${status}-subtle`,
    ]),
  },
];

export interface SwatchPairDefinition {
  readonly foreground: string;
  readonly background: string;
  /** WCAG 2.2 AA: 4.5 for text, 3 for the parts of the interface that are not text. */
  readonly minimum: 4.5 | 3;
}

const text = (foreground: string, background: string): SwatchPairDefinition => ({
  foreground,
  background,
  minimum: 4.5,
});
const nonText = (foreground: string, background: string): SwatchPairDefinition => ({
  foreground,
  background,
  minimum: 3,
});

const PAGE_BACKGROUNDS = ["bg", "bg-subtle", "surface", "surface-raised"] as const;

/**
 * The foreground and background pairs a theme is held to, each with its WCAG level: every pair the
 * tokens package requires of a theme, and the others the brand package's generator meets for the
 * text and the accent. A pair is shown on the swatch of its foreground.
 */
export const SWATCH_PAIRS: readonly SwatchPairDefinition[] = [
  ...[...PAGE_BACKGROUNDS, "accent-subtle"].map((background) => text("text", background)),
  ...PAGE_BACKGROUNDS.map((background) => text("text-muted", background)),
  ...PAGE_BACKGROUNDS.map((background) => text("link", background)),
  text("on-accent", "accent"),
  text("on-accent", "accent-hover"),
  text("on-accent-subtle", "accent-subtle"),
  text("on-accent-indicator", "accent-indicator"),
  ...STATUSES.flatMap((status) => [
    text(`on-${status}`, status),
    text(`on-${status}-subtle`, `${status}-subtle`),
  ]),
  nonText("focus-ring", "bg"),
  nonText("border-strong", "bg"),
  ...PAGE_BACKGROUNDS.flatMap((background) => [
    nonText("accent-indicator", background),
    nonText("accent-border", background),
  ]),
  nonText("accent-indicator", "accent-subtle"),
];
