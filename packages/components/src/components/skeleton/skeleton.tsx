import { Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { MAX_LINES, SKELETON_VARIANTS, type SkeletonVariant } from "./skeleton-options";

/**
 * A placeholder shaped like content that is still loading. It is always hidden from assistive
 * technology, so it announces nothing by itself. Mark the region being loaded with
 * `aria-busy="true"` and give it a text status such as "Loading profile", then clear `aria-busy`
 * and replace the skeletons when the content arrives.
 *
 * Size it with the page's own CSS on the element, for example `idg-skeleton { inline-size: 12rem }`.
 *
 * @part shape - One placeholder shape, or one line of text.
 */
@Component({
  tag: "idg-skeleton",
  styleUrl: "skeleton.css",
  shadow: true,
})
export class IdgSkeleton {
  /** The shape of what is loading. */
  @Prop({ reflect: true }) variant: SkeletonVariant = "text";

  /** How many lines of text to draw. The last of several is shorter. Only for `text`. */
  @Prop() lines = 1;

  private lineCount(): number {
    return Number.isFinite(this.lines)
      ? Math.min(MAX_LINES, Math.max(1, Math.floor(this.lines)))
      : 1;
  }

  render() {
    const variant = oneOf(SKELETON_VARIANTS, this.variant, "text");
    const count = variant === "text" ? this.lineCount() : 1;
    return (
      <div class="skeleton" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span
            class={{
              shape: true,
              [`variant-${variant}`]: true,
              last: count > 1 && index === count - 1,
            }}
            part="shape"
          />
        ))}
      </div>
    );
  }
}
