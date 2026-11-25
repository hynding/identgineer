export type AccentUse = "fill" | "indicator" | "tint" | "decoration";

/** What else marks a state that an accent-subtle tint shows: an indicator, or the content itself. */
export type AccentTintMarker =
  | { readonly kind: "indicator"; readonly what: string }
  | { readonly kind: "content"; readonly what: string };

export interface AccentRoleEntry {
  /** Source path relative to `src`: a stylesheet, or a TypeScript file whose template strings hold one. */
  readonly file: string;
  /** The rule it sits in, as `findAccentUses` names it: at-rules and selector, normalised. */
  readonly selector: string;
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
    selector: ".tone-0",
    property: "--_background",
    token: "accent",
    use: "fill",
    what: "avatar initials background (first colour pair)",
  },
  {
    file: "components/avatar/avatar.css",
    selector: ".tone-0",
    property: "--_text",
    token: "on-accent",
    use: "fill",
    what: "avatar initials",
  },
  {
    file: "components/button/button.css",
    selector: ".variant-primary",
    property: "background",
    token: "accent",
    use: "fill",
    what: "primary button",
  },
  {
    file: "components/button/button.css",
    selector: ".variant-primary",
    property: "color",
    token: "on-accent",
    use: "fill",
    what: "primary button label",
  },
  {
    file: "components/button/button.css",
    selector: '.variant-primary:not(:disabled):not([aria-disabled="true"]):hover',
    property: "background",
    token: "accent-hover",
    use: "fill",
    what: "primary button, hovered",
  },
  {
    file: "components/button/button.css",
    selector: ".variant-primary",
    property: "outline",
    token: "accent-edge",
    use: "fill",
    what: "primary button edge where the accent does not stand out on the page",
  },
  {
    file: "components/card/card.css",
    selector: ".variant-accent",
    property: "--idg-color-text",
    token: "on-accent",
    use: "fill",
    what: "accent card text",
  },
  {
    file: "components/card/card.css",
    selector: ".variant-accent",
    property: "--idg-color-text-muted",
    token: "on-accent",
    use: "fill",
    what: "accent card muted text",
  },
  {
    file: "components/card/card.css",
    selector: ".variant-accent",
    property: "--idg-color-link",
    token: "on-accent",
    use: "fill",
    what: "accent card links",
  },
  {
    file: "components/card/card.css",
    selector: ".variant-accent",
    property: "--idg-surface-background",
    token: "on-accent",
    use: "fill",
    what: "surfaces inside an accent card",
  },
  {
    file: "components/card/card.css",
    selector: ".variant-accent",
    property: "background",
    token: "accent",
    use: "fill",
    what: "accent card",
  },
  {
    file: "components/card/card.css",
    selector: ".variant-accent",
    property: "color",
    token: "on-accent",
    use: "fill",
    what: "accent card text",
  },
  {
    file: "components/card/card.css",
    selector: ".variant-outlined.interactive:hover",
    property: "--_ring",
    token: "accent-indicator",
    use: "indicator",
    what: "outlined interactive card, hovered",
  },
  {
    file: "components/layout/layout.css",
    selector: ".hero",
    property: "background",
    token: "accent",
    use: "decoration",
    what: "hero glow",
  },
  {
    file: "components/layout/layout.css",
    selector: ".skip",
    property: "background",
    token: "accent",
    use: "fill",
    what: "skip link",
  },
  {
    file: "components/layout/layout.css",
    selector: ".skip",
    property: "color",
    token: "on-accent",
    use: "fill",
    what: "skip link label",
  },
  {
    file: "components/pagination/pagination.css",
    selector: '.control[aria-current="page"]',
    property: "background",
    token: "accent-indicator",
    use: "indicator",
    what: "current page",
  },
  {
    file: "components/pagination/pagination.css",
    selector: '.control[aria-current="page"]',
    property: "color",
    token: "on-accent-indicator",
    use: "indicator",
    what: "current page number",
  },
  {
    file: "components/progress/progress.css",
    selector: ".bar",
    property: "color",
    token: "accent-indicator",
    use: "indicator",
    what: "progress fill and indeterminate band",
  },
  {
    file: "components/sparkline/sparkline.css",
    selector: ":host",
    property: "color",
    token: "accent-indicator",
    use: "indicator",
    what: "sparkline line, end mark and fill",
  },
  {
    file: "components/tab/tab.css",
    selector: ".tab::after",
    property: "background",
    token: "accent-indicator",
    use: "indicator",
    what: "selected tab marker",
  },
  {
    file: "demo.css",
    selector: "section.dashboard",
    property: "background",
    token: "accent",
    use: "decoration",
    what: "demo page glow",
  },
  {
    file: "styles/choice-control.css",
    selector: ".choice",
    property: "--_mark",
    token: "on-accent-indicator",
    use: "indicator",
    what: "check, dot and switch thumb when on",
  },
  {
    file: "styles/choice-control.css",
    selector: ".choice",
    property: "--_fill",
    token: "accent-indicator",
    use: "indicator",
    what: "checked checkbox, radio dot, switch track when on",
  },
  {
    file: "components/accordion-item/accordion-item.css",
    selector: ".trigger:not(:disabled):hover",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "accordion trigger, hovered",
  },
  {
    file: "components/accordion-item/accordion-item.css",
    selector: ".trigger:not(:disabled):hover",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "accordion trigger, hovered",
  },
  {
    file: "components/avatar/avatar.css",
    selector: ".tone-5",
    property: "--_background",
    token: "accent-subtle",
    use: "fill",
    what: "avatar initials (fifth colour pair)",
  },
  {
    file: "components/avatar/avatar.css",
    selector: ".tone-5",
    property: "--_text",
    token: "on-accent-subtle",
    use: "fill",
    what: "avatar initials (fifth colour pair)",
  },
  {
    file: "components/brand-logo/brand-logo.css",
    selector: ".monogram",
    property: "background",
    token: "accent",
    use: "fill",
    what: "monogram that stands in for a brand's mark",
  },
  {
    file: "components/brand-logo/brand-logo.css",
    selector: ".monogram",
    property: "color",
    token: "on-accent",
    use: "fill",
    what: "monogram letters",
  },
  {
    file: "components/breadcrumb-item/breadcrumb-item.css",
    selector: ".linked:hover",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "linked breadcrumb, hovered",
  },
  {
    file: "components/breadcrumb-item/breadcrumb-item.css",
    selector: ".linked:hover",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "linked breadcrumb, hovered",
  },
  {
    file: "components/button/button.css",
    selector:
      '.variant-secondary:not(:disabled):not([aria-disabled="true"]):hover, .variant-ghost:not(:disabled):not([aria-disabled="true"]):hover',
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "secondary and ghost buttons, hovered",
  },
  {
    file: "components/button/button.css",
    selector:
      '.variant-secondary:not(:disabled):not([aria-disabled="true"]):hover, .variant-ghost:not(:disabled):not([aria-disabled="true"]):hover',
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "secondary and ghost buttons, hovered",
  },
  {
    file: "components/input/input.css",
    selector: ".reveal:hover",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "password reveal button, hovered",
  },
  {
    file: "components/input/input.css",
    selector: ".reveal:hover",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "password reveal button, hovered",
  },
  {
    file: "components/input/input.css",
    selector: '.reveal[aria-pressed="true"]',
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "password reveal button, pressed",
    markedBy: { kind: "content", what: "the eye icon turns to eye-off" },
  },
  {
    file: "components/input/input.css",
    selector: '.reveal[aria-pressed="true"]',
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "password reveal button, pressed",
    markedBy: { kind: "content", what: "the eye icon turns to eye-off" },
  },
  {
    file: "components/layout/layout.css",
    selector: ".toggle:hover",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "navigation menu button, hovered",
  },
  {
    file: "components/layout/layout.css",
    selector: ".toggle:hover",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "navigation menu button, hovered",
  },
  {
    file: "components/layout/layout.css",
    selector: ".hero",
    property: "background",
    token: "accent-subtle",
    use: "fill",
    what: "hero surface and its text",
  },
  {
    file: "components/layout/layout.css",
    selector: ".hero",
    property: "color",
    token: "on-accent-subtle",
    use: "fill",
    what: "hero surface and its text",
  },
  {
    file: "components/layout/layout.css",
    selector: '::slotted([slot="navigation"]:hover)',
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "navigation item, hovered",
  },
  {
    file: "components/layout/layout.css",
    selector: '::slotted([slot="navigation"]:hover)',
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "navigation item, hovered",
  },
  {
    file: "components/layout/layout.css",
    selector: '::slotted([slot="navigation"][aria-current])',
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "current navigation item",
    markedBy: { kind: "indicator", what: "current navigation item marker" },
  },
  {
    file: "components/layout/layout.css",
    selector: '::slotted([slot="navigation"][aria-current])',
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "current navigation item",
    markedBy: { kind: "indicator", what: "current navigation item marker" },
  },
  {
    file: "components/layout/layout.css",
    selector: '::slotted([slot="navigation"][aria-current])',
    property: "border-inline-start",
    token: "accent-indicator",
    use: "indicator",
    what: "current navigation item marker",
  },
  {
    file: "components/layout/layout.css",
    selector: '::slotted([slot="navigation"][aria-current])',
    property: "text-decoration-color",
    token: "accent-indicator",
    use: "indicator",
    what: "current navigation item marker",
  },
  {
    file: "components/layout/layout.css",
    selector:
      "@container idg-shell style(--idg-layout-shell: split-hero) >> @container idg-shell (min-inline-size: 56rem) >> .shell:not(.no-hero) .brand",
    property: "color",
    token: "on-accent-subtle",
    use: "fill",
    what: "brand on the hero (split-hero)",
  },
  {
    file: "components/layout/layout.css",
    selector: "@container idg-shell style(--idg-layout-shell: immersive) >> .header",
    property: "color",
    token: "on-accent-subtle",
    use: "fill",
    what: "header on the hero (immersive)",
  },
  {
    file: "components/layout/layout.css",
    selector: "@container idg-shell style(--idg-layout-shell: immersive) >> .aside",
    property: "background",
    token: "accent-subtle",
    use: "fill",
    what: "aside band (immersive)",
  },
  {
    file: "components/layout/layout.css",
    selector: "@container idg-shell style(--idg-layout-shell: immersive) >> .aside",
    property: "color",
    token: "on-accent-subtle",
    use: "fill",
    what: "aside band (immersive)",
  },
  {
    file: "components/link/link.css",
    selector: ".control:hover",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "link, hovered",
  },
  {
    file: "components/link/link.css",
    selector: ".control:hover",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "link, hovered",
  },
  {
    file: "components/menu-item/menu-item.css",
    selector: ".item:hover, .item:focus",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "menu item, hovered or focused (keyboard focus also draws the ring)",
  },
  {
    file: "components/menu-item/menu-item.css",
    selector: ".item:hover, .item:focus",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "menu item, hovered or focused (keyboard focus also draws the ring)",
  },
  {
    file: "components/pagination/pagination.css",
    selector: '.control:not([aria-disabled="true"]):not(:disabled):not([aria-current]):hover',
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "page button, hovered",
  },
  {
    file: "components/pagination/pagination.css",
    selector: '.control:not([aria-disabled="true"]):not(:disabled):not([aria-current]):hover',
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "page button, hovered",
  },
  {
    file: "components/tab/tab.css",
    selector: ":host(:not([selected]):not([disabled])) .tab:hover",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "unselected tab, hovered",
  },
  {
    file: "components/tab/tab.css",
    selector: ":host(:not([selected]):not([disabled])) .tab:hover",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "unselected tab, hovered",
  },
  {
    file: "styles/tone.css",
    selector: ".variant-accent",
    property: "--_tone-background",
    token: "accent-subtle",
    use: "fill",
    what: "accent badge and alert",
  },
  {
    file: "styles/tone.css",
    selector: ".variant-accent",
    property: "--_tone-text",
    token: "on-accent-subtle",
    use: "fill",
    what: "accent badge and alert",
  },
  {
    file: "components/table/table-light-styles.ts",
    selector: "@layer idg.components >> idg-table > table > tbody > tr:hover > :is(th, td)",
    property: "background",
    token: "accent-subtle",
    use: "tint",
    what: "table row, hovered",
  },
  {
    file: "components/table/table-light-styles.ts",
    selector: "@layer idg.components >> idg-table > table > tbody > tr:hover > :is(th, td)",
    property: "color",
    token: "on-accent-subtle",
    use: "tint",
    what: "table row, hovered",
  },
];

// Whitespace may surround the name, and a fallback may follow it. CSS reads the function name in
// any case.
const ACCENT_TOKEN =
  /var\(\s*--idg-color-((?:on-)?accent(?:-hover|-indicator|-border|-edge|-subtle)?)\s*[,)]/gi;

export interface AccentRead {
  /** The rule's selector, with every at-rule around it, normalised: `@media (...) >> .a > .b`. */
  readonly selector: string;
  readonly property: string;
  readonly token: string;
}

const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Every accent role a stylesheet reads, in source order, with the rule it sits in. A block's
 * prelude (a selector list or an at-rule's condition) is what precedes its `{`; a declaration is
 * what precedes a `;` or the closing `}`.
 */
export function findAccentUses(source: string): AccentRead[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const uses: AccentRead[] = [];
  const preludes: string[] = [];
  let pending = "";
  const declare = () => {
    const colon = pending.indexOf(":");
    if (colon > 0) {
      const property = pending.slice(0, colon).trim().toLowerCase();
      for (const match of pending.slice(colon + 1).matchAll(ACCENT_TOKEN)) {
        uses.push({
          selector: preludes.join(" >> "),
          property,
          token: (match[1] ?? "").toLowerCase(),
        });
      }
    }
    pending = "";
  };
  for (const character of css) {
    if (character === "{") {
      preludes.push(normalise(pending));
      pending = "";
    } else if (character === "}") {
      declare();
      preludes.pop();
    } else if (character === ";") {
      declare();
    } else {
      pending += character;
    }
  }
  return uses;
}
