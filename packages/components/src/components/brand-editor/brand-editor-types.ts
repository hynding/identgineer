/** Detail of `idgSave`: which kit was stored, and nothing of what it holds. */
export interface BrandEditorSaveDetail {
  /** The CMS's id of the stored kit, to `update` it or `get` it again. */
  readonly documentId: string;
  /** The kit's own id, its `data-theme` value. */
  readonly id: string;
  /** Whether this save made a new kit (`create`) rather than changing one (`update`). */
  readonly created: boolean;
}

/** A colour as a parsed kit keeps it: three channels from 0 to 255. */
export type BrandEditorRgb = readonly [number, number, number];

/**
 * The kit the editor starts from, as `parseBrandKit` or the store's `get` returned it. Declared
 * here, not imported, so the component names only what it reads; a `BrandKit` of the brand
 * package fits it. Every field is read defensively all the same, once, as an own property: a kit
 * set from JavaScript may hold anything.
 */
export interface BrandEditorKit {
  readonly id: string;
  readonly name: string;
  readonly tagline?: string;
  readonly colors: {
    readonly primary: BrandEditorRgb;
    readonly secondary?: BrandEditorRgb;
    readonly neutralTint?: BrandEditorRgb;
  };
  readonly typography: string;
  readonly corners: string;
  readonly tone: string;
  readonly logo?: string;
  readonly mark?: string;
}
