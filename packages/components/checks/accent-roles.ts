export type AccentUse = "fill" | "indicator" | "decoration";

export interface AccentRoleEntry {
  /** Stylesheet path relative to `src`. */
  readonly file: string;
  /** The property the token is read into. */
  readonly property: string;
  /** The colour role, without `--idg-color-`. */
  readonly token: string;
  readonly use: AccentUse;
  readonly what: string;
}

/**
 * Every place a component stylesheet reads an accent role (accent-subtle aside), classified. A
 * fill carries a text label and needs only its text colour; an indicator identifies state or
 * selection on the page and needs 3:1 against it (WCAG 1.4.11), so it reads accent-indicator;
 * decoration identifies nothing. The README's table is this list.
 */
export const ACCENT_ROLE_USES: readonly AccentRoleEntry[] = [
  {
    file: "components/avatar/avatar.css",
    property: "--_background",
    token: "accent",
    use: "fill",
    what: "avatar initials background (first colour pair)",
  },
  {
    file: "components/avatar/avatar.css",
    property: "--_text",
    token: "on-accent",
    use: "fill",
    what: "avatar initials",
  },
  {
    file: "components/button/button.css",
    property: "background",
    token: "accent",
    use: "fill",
    what: "primary button",
  },
  {
    file: "components/button/button.css",
    property: "color",
    token: "on-accent",
    use: "fill",
    what: "primary button label",
  },
  {
    file: "components/button/button.css",
    property: "background",
    token: "accent-hover",
    use: "fill",
    what: "primary button, hovered",
  },
  {
    file: "components/button/button.css",
    property: "box-shadow",
    token: "accent-edge",
    use: "fill",
    what: "primary button edge in designs without control borders",
  },
  {
    file: "components/button/button.css",
    property: "box-shadow",
    token: "accent-edge",
    use: "fill",
    what: "primary button edge, hovered",
  },
  {
    file: "components/button/button.css",
    property: "box-shadow",
    token: "accent-edge",
    use: "fill",
    what: "primary button edge, pressed",
  },
  {
    file: "components/card/card.css",
    property: "--idg-color-text",
    token: "on-accent",
    use: "fill",
    what: "accent card text",
  },
  {
    file: "components/card/card.css",
    property: "--idg-color-text-muted",
    token: "on-accent",
    use: "fill",
    what: "accent card muted text",
  },
  {
    file: "components/card/card.css",
    property: "--idg-color-link",
    token: "on-accent",
    use: "fill",
    what: "accent card links",
  },
  {
    file: "components/card/card.css",
    property: "--idg-surface-background",
    token: "on-accent",
    use: "fill",
    what: "surfaces inside an accent card",
  },
  {
    file: "components/card/card.css",
    property: "background",
    token: "accent",
    use: "fill",
    what: "accent card",
  },
  {
    file: "components/card/card.css",
    property: "color",
    token: "on-accent",
    use: "fill",
    what: "accent card text",
  },
  {
    file: "components/card/card.css",
    property: "--_ring",
    token: "accent-indicator",
    use: "indicator",
    what: "outlined interactive card, hovered",
  },
  {
    file: "components/layout/layout.css",
    property: "background",
    token: "accent",
    use: "decoration",
    what: "hero glow",
  },
  {
    file: "components/layout/layout.css",
    property: "background",
    token: "accent",
    use: "fill",
    what: "skip link",
  },
  {
    file: "components/layout/layout.css",
    property: "color",
    token: "on-accent",
    use: "fill",
    what: "skip link label",
  },
  {
    file: "components/pagination/pagination.css",
    property: "background",
    token: "accent-indicator",
    use: "indicator",
    what: "current page",
  },
  {
    file: "components/pagination/pagination.css",
    property: "color",
    token: "on-accent-indicator",
    use: "indicator",
    what: "current page number",
  },
  {
    file: "components/progress/progress.css",
    property: "color",
    token: "accent-indicator",
    use: "indicator",
    what: "progress fill and indeterminate band",
  },
  {
    file: "components/tab/tab.css",
    property: "background",
    token: "accent-indicator",
    use: "indicator",
    what: "selected tab marker",
  },
  {
    file: "demo.css",
    property: "background",
    token: "accent",
    use: "decoration",
    what: "demo page glow",
  },
  {
    file: "styles/choice-control.css",
    property: "--_mark",
    token: "on-accent-indicator",
    use: "indicator",
    what: "check, dot and switch thumb when on",
  },
  {
    file: "styles/choice-control.css",
    property: "--_fill",
    token: "accent-indicator",
    use: "indicator",
    what: "checked checkbox, radio dot, switch track when on",
  },
  {
    file: "styles/tone.css",
    property: "--_tone-solid",
    token: "accent",
    use: "decoration",
    what: "accent tone's solid colour, for edges",
  },
];

// Whitespace may surround the name, and a fallback may follow it.
const ACCENT_TOKEN =
  /var\(\s*--idg-color-((?:on-)?accent(?:-hover|-indicator|-border|-edge)?)\s*[,)]/g;
const DECLARATION = /([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g;

/** Every accent role a stylesheet reads, as `property token` pairs in source order. */
export function findAccentUses(source: string): { property: string; token: string }[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(DECLARATION)].flatMap((declaration) =>
    [...(declaration[2] ?? "").matchAll(ACCENT_TOKEN)].map((match) => ({
      property: declaration[1] ?? "",
      token: match[1] ?? "",
    })),
  );
}
