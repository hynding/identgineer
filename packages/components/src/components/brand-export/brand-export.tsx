import { Component, Event, Prop, type EventEmitter } from "@stencil/core";
import type { BrandExportLabels } from "./brand-export-labels";
import type { BrandExportDetail, BrandExportTheme } from "./brand-export-types";

/**
 * Lets a person take a brand theme away.
 *
 * @part export - The group around everything.
 */
@Component({
  tag: "idg-brand-export",
  shadow: true,
})
export class IdgBrandExport {
  /** The text `emitBrandThemeCss` produced. */
  @Prop() css?: string;

  /** The text `emitBrandThemeTokens` produced. */
  @Prop() tokens?: string;

  /** A theme from `generateBrandTheme`: the stylesheet and tokens are emitted from it. */
  @Prop() theme?: BrandExportTheme;

  /** The theme id for the usage snippet, when there is no `theme`. */
  @Prop({ attribute: "theme-id" }) themeId?: string;

  /** The brand's name, which the file names are made from. */
  @Prop() name?: string;

  /** The accessible name of the whole. Defaults to the `name` label. */
  @Prop() label?: string;

  /** The words shown, merged over the English defaults. */
  @Prop() labels?: Partial<BrandExportLabels>;

  /** The level of the artefacts' headings, 1 to 6. */
  @Prop({ attribute: "heading-level" }) headingLevel = 2;

  /** Fires after an artefact was put on the clipboard. */
  @Event() idgCopy!: EventEmitter<BrandExportDetail>;

  /** Fires after a download of an artefact was started. */
  @Event() idgDownload!: EventEmitter<BrandExportDetail>;

  render() {
    return null;
  }
}
