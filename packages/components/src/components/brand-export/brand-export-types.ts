import type { Artefact } from "./brand-export-files";

/**
 * A theme from `generateBrandTheme`, as far as the export reads it: the id the theme is selected
 * by, the kit it was generated from, and the document and radii the emitters check against that kit.
 * Declared here, not imported, so the component's types drag nothing of the brand package in; a
 * `BrandTheme` of that package fits it.
 */
export interface BrandExportTheme {
  readonly id: string;
  readonly kit: object;
  readonly document: object;
  readonly radius: object;
}

/** The detail of `idgCopy` and `idgDownload`: which artefact it was. */
export interface BrandExportDetail {
  readonly artefact: Artefact;
}
