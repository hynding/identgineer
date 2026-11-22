import {
  DEFAULT_DESIGN_ID,
  DEFAULT_LAYOUT_ID,
  DEFAULT_THEME_ID,
  DEFAULT_UX_MODE_ID,
  DESIGNS,
  LAYOUTS,
  SCHEMES,
  THEMES,
  UX_MODES,
} from "@identgineer/tokens";
import type {
  DesignId,
  LayoutId,
  ModeDefinition,
  Scheme,
  ThemeId,
  ThemeSwatches,
  UxModeId,
} from "@identgineer/tokens";
import type { SchemeChoice, StateKey, VariationAxis } from "./variation-state.ts";

export interface ThemePreview {
  readonly kind: "theme";
  readonly swatches: Readonly<Record<Scheme, ThemeSwatches>>;
  readonly fonts: { readonly display: string; readonly body: string; readonly mono: string };
}

/** Designs, layouts and UX modes expose nothing richer than a label and a description. */
export interface TextPreview {
  readonly kind: "text";
  readonly label: string;
  readonly description: string;
}

export type VariationPreview = ThemePreview | TextPreview;

export interface Variation<Id extends string, Preview extends VariationPreview> {
  readonly id: Id;
  readonly label: string;
  readonly description: string;
  readonly preview: Preview;
}

export interface AxisRegistry<Id extends string, Preview extends VariationPreview> {
  readonly attribute: string;
  readonly defaultId: Id;
  readonly variations: readonly Variation<Id, Preview>[];
}

export interface SchemeRegistry {
  readonly attribute: "data-scheme";
  readonly defaultId: "system";
  readonly ids: readonly SchemeChoice[];
}

export interface VariationsRegistry {
  readonly theme: AxisRegistry<ThemeId, ThemePreview>;
  readonly design: AxisRegistry<DesignId, TextPreview>;
  readonly layout: AxisRegistry<LayoutId, TextPreview>;
  readonly ux: AxisRegistry<UxModeId, TextPreview>;
  readonly scheme: SchemeRegistry;
}

export const AXES: readonly VariationAxis[] = Object.freeze(["theme", "design", "layout", "ux"]);

export const STATE_KEYS: readonly StateKey[] = Object.freeze([...AXES, "scheme"]);

// The token registries are shared, so the preview is copied before it is frozen.
function themeVariations(): readonly Variation<ThemeId, ThemePreview>[] {
  return Object.freeze(
    THEMES.map((theme) =>
      Object.freeze({
        id: theme.id,
        label: theme.label,
        description: theme.description,
        preview: Object.freeze({
          kind: "theme" as const,
          swatches: Object.freeze({
            light: Object.freeze({ ...theme.swatches.light }),
            dark: Object.freeze({ ...theme.swatches.dark }),
          }),
          fonts: Object.freeze({ ...theme.fonts }),
        }),
      }),
    ),
  );
}

function textVariations<Id extends string>(
  modes: readonly ModeDefinition<Id>[],
): readonly Variation<Id, TextPreview>[] {
  return Object.freeze(
    modes.map(({ id, label, description }) =>
      Object.freeze({
        id,
        label,
        description,
        preview: Object.freeze({ kind: "text" as const, label, description }),
      }),
    ),
  );
}

export const REGISTRY: VariationsRegistry = Object.freeze({
  theme: Object.freeze({
    attribute: "data-theme",
    defaultId: DEFAULT_THEME_ID,
    variations: themeVariations(),
  }),
  design: Object.freeze({
    attribute: "data-design",
    defaultId: DEFAULT_DESIGN_ID,
    variations: textVariations(DESIGNS),
  }),
  layout: Object.freeze({
    attribute: "data-layout",
    defaultId: DEFAULT_LAYOUT_ID,
    variations: textVariations(LAYOUTS),
  }),
  ux: Object.freeze({
    attribute: "data-ux",
    defaultId: DEFAULT_UX_MODE_ID,
    variations: textVariations(UX_MODES),
  }),
  scheme: Object.freeze({
    attribute: "data-scheme",
    defaultId: "system",
    ids: Object.freeze<SchemeChoice[]>([...SCHEMES, "system"]),
  }),
});
