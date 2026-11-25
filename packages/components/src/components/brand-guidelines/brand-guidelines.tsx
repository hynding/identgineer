import { Component, Prop } from "@stencil/core";
import type { BrandGuidelinesLabels } from "./brand-guidelines-labels";
import type { BrandGuidelinesKit, BrandGuidelinesTheme } from "./brand-guidelines-types";

/**
 * A brand guide for one kit.
 *
 * @part guidelines - The article around everything.
 */
@Component({
  tag: "idg-brand-guidelines",
  shadow: true,
})
export class IdgBrandGuidelines {
  /** The kit `parseBrandKit` returned. Set it as a property: it is data, not an attribute. */
  @Prop() kit?: BrandGuidelinesKit;

  /** The theme `generateBrandTheme` returned, or its `document`. */
  @Prop() theme?: BrandGuidelinesTheme;

  /** The accessible name of the whole. Defaults to the `name` label. */
  @Prop() label?: string;

  /** The words shown, merged over the English defaults. */
  @Prop() labels?: Partial<BrandGuidelinesLabels>;

  /** The words of the colour swatches the guide holds. */
  @Prop() swatchLabels?: Record<string, string>;

  /** The level of the brand name's heading, 1 to 6; the sections' headings are one deeper. */
  @Prop({ attribute: "heading-level" }) headingLevel = 2;

  render() {
    return null;
  }
}
