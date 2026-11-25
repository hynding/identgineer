import { Component, Element, h, Prop } from "@stencil/core";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { numberFormatter } from "../../utils/format-number";
import { languageOf } from "../../utils/language";
import { BRAND_SWATCHES_LABELS, type BrandSwatchesLabels } from "./brand-swatches-labels";
import {
  buildSwatchGroups,
  contrastText,
  readSwatchColours,
  SWATCH_SCHEMES,
  type SwatchGroup,
  type SwatchScheme,
} from "./brand-swatches-model";
import type { BrandSwatchesTheme } from "./brand-swatches-types";

/**
 * The colours of a generated brand theme, light and dark: for each role a chip, the role's name
 * and its value as text, and for a foreground colour its contrast on the backgrounds it is used
 * on, with whether that meets its WCAG level. Every colour is also written out, so colour is
 * never the only carrier, and each chip has an edge, so a colour close to the page is still seen.
 *
 * It takes the data `generateBrandTheme` returns and works out nothing of its own but the contrast
 * ratios. A colour that is not in the package's format (`#rrggbb`, lower case) is left out, and
 * only validated values reach the page, as a custom property set through the style API.
 *
 * @part swatches - The group around everything.
 * @part scheme - One scheme, light or dark.
 * @part scheme-title - The scheme's name.
 * @part group-title - The name of a group of roles.
 * @part swatch - One role's item.
 * @part chip - The colour chip.
 * @part role - The role's name.
 * @part value - The colour as text.
 * @part pairs - The contrast of a foreground colour on its backgrounds.
 * @part empty - The message shown when there is no colour to show.
 */
@Component({
  tag: "idg-brand-swatches",
  styleUrl: "brand-swatches.css",
  shadow: true,
})
export class IdgBrandSwatches {
  @Element() host!: HTMLElement;

  /**
   * The theme `generateBrandTheme` returned, or its `document`. Set it as a property: it is data,
   * not an attribute.
   */
  @Prop() theme?: BrandSwatchesTheme;

  /** The accessible name of the whole. Defaults to the `name` label. */
  @Prop() label?: string;

  /** The words shown, merged over the English defaults. */
  @Prop() labels?: Partial<BrandSwatchesLabels>;

  private groupTitle(group: SwatchGroup, labels: BrandSwatchesLabels): string {
    const titles = {
      page: labels.groupPage,
      text: labels.groupText,
      accent: labels.groupAccent,
      status: labels.groupStatus,
    };
    return titles[group.id];
  }

  render() {
    const labels = mergeLabels(BRAND_SWATCHES_LABELS, this.labels);
    const format = numberFormatter(languageOf(this.host));
    const colours = readSwatchColours(this.theme);
    const schemes = SWATCH_SCHEMES.map((scheme) => ({
      scheme,
      groups: buildSwatchGroups(colours[scheme]),
    })).filter(({ groups }) => groups.length > 0);
    const name = typeof this.label === "string" && this.label !== "" ? this.label : labels.name;

    return (
      <div class="swatches" part="swatches" role="group" aria-label={name}>
        {schemes.length === 0 ? (
          <p class="empty" part="empty">
            {labels.empty}
          </p>
        ) : (
          schemes.map(({ scheme, groups }) => (
            <div
              class="scheme"
              part="scheme"
              role="group"
              data-scheme={scheme}
              aria-labelledby={`scheme-${scheme}`}
            >
              <div class="scheme-title" part="scheme-title" id={`scheme-${scheme}`}>
                {scheme === "light" ? labels.light : labels.dark}
              </div>
              {groups.map((group) => (
                <SwatchList
                  scheme={scheme}
                  group={group}
                  title={this.groupTitle(group, labels)}
                  labels={labels}
                  format={format}
                />
              ))}
            </div>
          ))
        )}
      </div>
    );
  }
}

interface SwatchListProps {
  scheme: SwatchScheme;
  group: SwatchGroup;
  title: string;
  labels: BrandSwatchesLabels;
  format: (value: number) => string;
}

const SwatchList = ({ scheme, group, title, labels, format }: SwatchListProps) => {
  const id = `group-${scheme}-${group.id}`;
  return (
    <div class="group">
      <div class="group-title" part="group-title" id={id}>
        {title}
      </div>
      <ul class="list" aria-labelledby={id}>
        {group.swatches.map((swatch) => (
          <li class="swatch" part="swatch">
            <span class="chip" part="chip" aria-hidden="true" style={{ "--_chip": swatch.value }} />
            <div class="details">
              <span class="role" part="role">
                {swatch.role}
              </span>
              <code class="value" part="value">
                {swatch.value}
              </code>
              {swatch.pairs.length === 0 ? null : (
                <ul class="pairs" part="pairs">
                  {swatch.pairs.map((pair) => (
                    <li class={{ pair: true, failing: !pair.passes }}>
                      {fillTemplate(labels.pair, {
                        ratio: contrastText(pair.ratio, format),
                        background: pair.background,
                      })}{" "}
                      <span class="verdict">
                        {fillTemplate(pair.passes ? labels.passes : labels.fails, {
                          minimum: format(pair.minimum),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
