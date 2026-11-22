import { REGISTRY_DATA } from "./generated/registry-data.ts";
import type {
  DesignId,
  LayoutId,
  Scheme,
  SchemeChoice,
  StateKey,
  ThemeId,
  UxModeId,
  VariationAxis,
} from "./variation-state.ts";

export interface ThemeSwatches {
  readonly bg: string;
  readonly surface: string;
  readonly text: string;
  readonly accent: string;
  readonly accentSubtle: string;
}

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

function themeVariations(): readonly Variation<ThemeId, ThemePreview>[] {
  return Object.freeze(
    REGISTRY_DATA.theme.variations.map((theme) =>
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

interface TextEntry<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly description: string;
}

function textVariations<Id extends string>(
  entries: readonly TextEntry<Id>[],
): readonly Variation<Id, TextPreview>[] {
  return Object.freeze(
    entries.map(({ id, label, description }) =>
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
    attribute: REGISTRY_DATA.theme.attribute,
    defaultId: REGISTRY_DATA.theme.defaultId,
    variations: themeVariations(),
  }),
  design: Object.freeze({
    attribute: REGISTRY_DATA.design.attribute,
    defaultId: REGISTRY_DATA.design.defaultId,
    variations: textVariations(REGISTRY_DATA.design.variations),
  }),
  layout: Object.freeze({
    attribute: REGISTRY_DATA.layout.attribute,
    defaultId: REGISTRY_DATA.layout.defaultId,
    variations: textVariations(REGISTRY_DATA.layout.variations),
  }),
  ux: Object.freeze({
    attribute: REGISTRY_DATA.ux.attribute,
    defaultId: REGISTRY_DATA.ux.defaultId,
    variations: textVariations(REGISTRY_DATA.ux.variations),
  }),
  scheme: Object.freeze({
    attribute: REGISTRY_DATA.scheme.attribute,
    defaultId: REGISTRY_DATA.scheme.defaultId,
    ids: Object.freeze<SchemeChoice[]>([...REGISTRY_DATA.scheme.ids]),
  }),
});
