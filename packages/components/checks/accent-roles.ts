export type AccentUse = "fill" | "indicator" | "tint" | "decoration";

/** What else marks a state that an accent-subtle tint shows: an indicator, or the content itself. */
export type AccentTintMarker =
  | { readonly kind: "indicator"; readonly what: string }
  | { readonly kind: "content"; readonly what: string };

export interface AccentRoleEntry {
  /** Stylesheet path relative to `src`. */
  readonly file: string;
  /** The property the token is read into. */
  readonly property: string;
  /** The colour role, without `--idg-color-`. */
  readonly token: string;
  readonly use: AccentUse;
  readonly what: string;
  /** For a tint that shows state: what marks that state too, since the tint is too faint alone. */
  readonly markedBy?: AccentTintMarker;
}

/**
 * Every place a component stylesheet reads an accent role, classified. A fill carries a text label
 * and needs only its text colour; an indicator identifies state or selection on the page and needs
 * 3:1 against it (WCAG 1.4.11), so it reads accent-indicator; a tint is the faint accent-subtle
 * wash of hover feedback, and where it shows a state (the current navigation item) it names what
 * else marks that state; decoration identifies nothing. The README's table is this list.
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
    property: "outline",
    token: "accent-edge",
    use: "fill",
    what: "primary button edge where the accent does not stand out on the page",
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
    file: "components/accordion-item/accordion-item.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "accordion trigger, hovered",
  },
  {
    file: "components/accordion-item/accordion-item.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "accordion trigger, hovered",
  },
  {
    file: "components/avatar/avatar.css",
    property: "--_background",
    token: "accent-subtle",
    use: "fill",
    what: "avatar initials (fifth colour pair)",
  },
  {
    file: "components/avatar/avatar.css",
    property: "--_text",
    token: "on-accent-subtle",
    use: "fill",
    what: "avatar initials (fifth colour pair)",
  },
  {
    file: "components/breadcrumb-item/breadcrumb-item.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "linked breadcrumb, hovered",
  },
  {
    file: "components/breadcrumb-item/breadcrumb-item.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "linked breadcrumb, hovered",
  },
  {
    file: "components/button/button.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "secondary and ghost buttons, hovered",
  },
  {
    file: "components/button/button.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "secondary and ghost buttons, hovered",
  },
  {
    file: "components/input/input.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "password reveal button, hovered",
  },
  {
    file: "components/input/input.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "password reveal button, hovered",
  },
  {
    file: "components/input/input.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "password reveal button, pressed",
    markedBy: { kind: "content", what: "the eye icon turns to eye-off" },
  },
  {
    file: "components/input/input.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "password reveal button, pressed",
    markedBy: { kind: "content", what: "the eye icon turns to eye-off" },
  },
  {
    file: "components/layout/layout.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "navigation menu button, hovered",
  },
  {
    file: "components/layout/layout.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "navigation menu button, hovered",
  },
  {
    file: "components/layout/layout.css",
    property: "background",
    token: "accent-subtle",
    use: "fill",
    what: "hero surface and its text",
  },
  {
    file: "components/layout/layout.css",
    property: "color",
    token: "on-accent-subtle",
    use: "fill",
    what: "hero surface and its text",
  },
  {
    file: "components/layout/layout.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "navigation item, hovered",
  },
  {
    file: "components/layout/layout.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "navigation item, hovered",
  },
  {
    file: "components/layout/layout.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "current navigation item",
    markedBy: { kind: "indicator", what: "current navigation item marker" },
  },
  {
    file: "components/layout/layout.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "current navigation item",
    markedBy: { kind: "indicator", what: "current navigation item marker" },
  },
  {
    file: "components/layout/layout.css",
    property: "border-inline-start",
    token: "accent-indicator",
    use: "indicator",
    what: "current navigation item marker",
  },
  {
    file: "components/layout/layout.css",
    property: "text-decoration-color",
    token: "accent-indicator",
    use: "indicator",
    what: "current navigation item marker",
  },
  {
    file: "components/layout/layout.css",
    property: "color",
    token: "on-accent-subtle",
    use: "fill",
    what: "brand on the hero (split-hero)",
  },
  {
    file: "components/layout/layout.css",
    property: "color",
    token: "on-accent-subtle",
    use: "fill",
    what: "header on the hero (immersive)",
  },
  {
    file: "components/layout/layout.css",
    property: "background",
    token: "accent-subtle",
    use: "fill",
    what: "aside band (immersive)",
  },
  {
    file: "components/layout/layout.css",
    property: "color",
    token: "on-accent-subtle",
    use: "fill",
    what: "aside band (immersive)",
  },
  {
    file: "components/link/link.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "link, hovered",
  },
  {
    file: "components/link/link.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "link, hovered",
  },
  {
    file: "components/menu-item/menu-item.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "menu item, hovered or focused (keyboard focus also draws the ring)",
  },
  {
    file: "components/menu-item/menu-item.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "menu item, hovered or focused (keyboard focus also draws the ring)",
  },
  {
    file: "components/pagination/pagination.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "page button, hovered",
  },
  {
    file: "components/pagination/pagination.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "page button, hovered",
  },
  {
    file: "components/tab/tab.css",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "unselected tab, hovered",
  },
  {
    file: "components/tab/tab.css",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "unselected tab, hovered",
  },
  {
    file: "styles/tone.css",
    property: "--_tone-background",
    token: "accent-subtle",
    use: "fill",
    what: "accent badge and alert",
  },
  {
    file: "styles/tone.css",
    property: "--_tone-text",
    token: "on-accent-subtle",
    use: "fill",
    what: "accent badge and alert",
  },
];

// Whitespace may surround the name, and a fallback may follow it.
const ACCENT_TOKEN =
  /var\(\s*--idg-color-((?:on-)?accent(?:-hover|-indicator|-border|-edge|-subtle)?)\s*[,)]/g;
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
