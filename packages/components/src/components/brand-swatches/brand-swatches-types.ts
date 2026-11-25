/** The colours of one scheme as the brand package's theme document holds them, role by role. */
export interface BrandSwatchesScheme {
  readonly color: Readonly<Record<string, unknown>>;
}

/** What `generateBrandTheme` puts in a theme's `document`: the colours of both schemes. */
export interface BrandSwatchesPalette {
  readonly light: BrandSwatchesScheme;
  readonly dark: BrandSwatchesScheme;
}

/**
 * A theme from `generateBrandTheme`, or just its `document`. Declared here, not imported, so the
 * component names only what it reads; a `BrandTheme` of the brand package fits it.
 */
export type BrandSwatchesTheme = BrandSwatchesPalette | { readonly document: BrandSwatchesPalette };
