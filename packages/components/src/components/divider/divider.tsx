import { Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/choice";
import { DIVIDER_ORIENTATIONS, type DividerOrientation } from "./divider-options";

/**
 * A rule between groups of content, drawn in the design language's own border.
 *
 * @part line - The rule.
 */
@Component({
  tag: "idg-divider",
  styleUrl: "divider.css",
  shadow: true,
})
export class IdgDivider {
  /** Direction of the rule. A vertical divider needs a parent that gives it a height. */
  @Prop({ reflect: true }) orientation: DividerOrientation = "horizontal";

  /** Takes the divider out of the accessibility tree, for a rule that only decorates. */
  @Prop() decorative = false;

  render() {
    const orientation = oneOf(DIVIDER_ORIENTATIONS, this.orientation, "horizontal");
    const vertical = orientation === "vertical";
    return (
      <hr
        class={{ line: true, [orientation]: true }}
        part="line"
        role={this.decorative ? "presentation" : undefined}
        aria-orientation={vertical && !this.decorative ? "vertical" : undefined}
      />
    );
  }
}
