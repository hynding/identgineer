import { Component, h, Prop, State, Watch } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { initials } from "../../utils/initials";
import { displayText } from "../../utils/untrusted-text";
import {
  BRAND_LOGO_SIZES,
  BRAND_LOGO_VARIANTS,
  BRAND_NAME_MAX_LENGTH,
  type BrandLogoSize,
  type BrandLogoVariant,
} from "./brand-logo-options";
import { brandLogoSource, type BrandLogoSource } from "./brand-logo-source";

/**
 * A brand's logo or mark, or the brand's name where there is none to show.
 *
 * The logo is drawn only through an `<img>` whose source is a data URL, and only when the text is
 * exactly what the brand package's logo sanitiser returns (it is read again and must come back
 * unchanged). The SVG is never part of the page. Anything else, a script, a handler, an external
 * reference, an editor's file, is not drawn at all: the component shows the name as a wordmark, or
 * for the mark its first letters as a monogram, and with no name shows nothing.
 *
 * The page's Content-Security-Policy must allow `img-src data:` for the logo to load (the strict
 * policy the components are tested under, `default-src 'self'`, does not). Where the browser
 * refuses the image, or it cannot be decoded, the name is shown instead.
 *
 * @part image - The logo, an `img`.
 * @part wordmark - The brand's name as text, in place of a logo.
 * @part monogram - The brand's first letters in a box, in place of a mark.
 */
@Component({
  tag: "idg-brand-logo",
  styleUrl: "brand-logo.css",
  shadow: true,
})
export class IdgBrandLogo {
  /**
   * The logo's SVG text exactly as `sanitiseSvgLogo` returned it, the kit's `logo` or `mark`. Text
   * that is not that output is never drawn.
   */
  @Prop() logo?: string;

  /** The brand's name: the image's alternative text, and what is shown when there is no logo. */
  @Prop() name?: string;

  /** `logo` shows a wide logo or a wordmark, `mark` a compact symbol or a monogram. */
  @Prop({ reflect: true }) variant: BrandLogoVariant = "logo";

  /** The height of the logo, the mark's edge, and the size of the text that stands in for them. */
  @Prop({ reflect: true }) size: BrandLogoSize = "md";

  /**
   * Marks the logo as decoration, with an empty alternative text, for one that sits beside the
   * brand's name written out as text.
   */
  @Prop() decorative = false;

  @State() private source?: BrandLogoSource;

  @State() private failedUrl?: string;

  // The check reads the whole logo again, so it runs when the logo changes and not on every render.
  @Watch("logo")
  protected logoChanged(): void {
    this.source = brandLogoSource(this.logo);
    this.failedUrl = undefined;
  }

  private handleError = (): void => {
    this.failedUrl = this.source?.url;
  };

  componentWillLoad(): void {
    this.logoChanged();
  }

  render() {
    const variant = oneOf(BRAND_LOGO_VARIANTS, this.variant, "logo");
    const size = oneOf(BRAND_LOGO_SIZES, this.size, "md");
    const classes = { [`variant-${variant}`]: true, [`size-${size}`]: true };
    // Trimmed first: neutralising would turn a name of white space into a visible mark.
    const name = displayText(
      typeof this.name === "string" ? this.name.trim() : "",
      BRAND_NAME_MAX_LENGTH,
    );

    if (this.source !== undefined && this.source.url !== this.failedUrl) {
      return (
        <img
          class={{ ...classes, image: true }}
          part="image"
          src={this.source.url}
          alt={this.decorative ? "" : name}
          width={this.source.width}
          height={this.source.height}
          decoding="async"
          onError={this.handleError}
        />
      );
    }
    if (name === "") return null;
    if (variant === "logo") {
      return (
        <span
          class={{ ...classes, wordmark: true }}
          part="wordmark"
          aria-hidden={this.decorative ? "true" : undefined}
        >
          {name}
        </span>
      );
    }
    return (
      <span
        class={{ ...classes, monogram: true }}
        part="monogram"
        role={this.decorative ? undefined : "img"}
        aria-label={this.decorative ? undefined : name}
        aria-hidden={this.decorative ? "true" : undefined}
      >
        <span class="letters" aria-hidden="true">
          {initials(name) || Array.from(name)[0]}
        </span>
      </span>
    );
  }
}
