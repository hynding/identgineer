import { Component, h, Prop } from "@stencil/core";

/**
 * A labelled group of items in an idg-menu, such as the radio items of one choice. Radio items
 * uncheck each other within their group.
 *
 * @slot - `idg-menu-item` elements.
 * @part label - The visible label.
 */
@Component({
  tag: "idg-menu-group",
  styleUrl: "menu-group.css",
  shadow: true,
})
export class IdgMenuGroup {
  /** The group's visible label and accessible name. */
  @Prop() label?: string;

  render() {
    const labelled = this.label !== undefined && this.label !== "";
    return (
      <div role="group" aria-labelledby={labelled ? "label" : undefined}>
        {labelled ? (
          <div id="label" class="label" part="label">
            {this.label}
          </div>
        ) : null}
        <slot />
      </div>
    );
  }
}
