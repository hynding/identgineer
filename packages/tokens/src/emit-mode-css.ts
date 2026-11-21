import { emitDeclarationRule } from "./emit-css.ts";
import { PREFERENCE_MEDIA, type PreferenceGroupName } from "./preferences-media.ts";
import type { ResolvedToken } from "./token-types.ts";

const WITHOUT_BACKDROP_FILTER =
  "@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))";
const REDUCED_TRANSPARENCY = "@media (prefers-reduced-transparency: reduce)";

// A preference is not an axis value, so it is applied wherever any axis attribute can sit.
const PREFERENCE_SELECTORS = [":root", "[data-theme]", "[data-design]", "[data-ux]"];

export interface ModeCssInput {
  readonly id: string;
  /** The default mode also answers to a bare `:root`, at zero specificity. */
  readonly isDefault: boolean;
  readonly tokens: readonly ResolvedToken[];
}

export interface DesignCssInput extends ModeCssInput {
  /** What the design falls back to without `backdrop-filter` or under reduced transparency. */
  readonly opaque: readonly ResolvedToken[];
}

function selectorsFor(attribute: string, { id, isDefault }: ModeCssInput): string[] {
  const own = `[data-${attribute}="${id}"]`;
  return isDefault ? [":where(:root)", own] : [own];
}

function layered(layer: string, blocks: readonly string[]): string {
  return [`@layer ${layer} {`, blocks.join("\n\n"), "}", ""].join("\n");
}

function nested(condition: string, rule: string): string {
  return [`  ${condition} {`, rule, "  }"].join("\n");
}

export function emitDesignCss(input: DesignCssInput): string {
  const selectors = selectorsFor("design", input);
  const fallback = (depth: number) => emitDeclarationRule(selectors, input.opaque, depth);
  const blocks = [
    emitDeclarationRule(selectors, input.tokens, 1),
    ...(input.opaque.length > 0
      ? [nested(WITHOUT_BACKDROP_FILTER, fallback(2)), nested(REDUCED_TRANSPARENCY, fallback(2))]
      : []),
  ];
  return layered("idg.design", blocks);
}

export function emitUxCss(input: ModeCssInput): string {
  return layered("idg.ux", [emitDeclarationRule(selectorsFor("ux", input), input.tokens, 1)]);
}

export interface PreferenceCssGroup {
  readonly name: PreferenceGroupName;
  readonly tokens: readonly ResolvedToken[];
}

/** Last layer, so these overrides beat every design language and UX mode whatever the specificity. */
export function emitPreferencesCss(groups: readonly PreferenceCssGroup[]): string {
  return layered(
    "idg.preferences",
    groups.map(({ name, tokens }) =>
      nested(
        `@media ${PREFERENCE_MEDIA[name]}`,
        emitDeclarationRule(PREFERENCE_SELECTORS, tokens, 2),
      ),
    ),
  );
}
