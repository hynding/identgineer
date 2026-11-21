import { Component, h } from "@stencil/core";

/**
 * A rule between groups of items in an idg-menu.
 *
 * @part separator - The rule.
 */
@Component({
  tag: "idg-menu-separator",
  styleUrl: "menu-separator.css",
  shadow: true,
})
export class IdgMenuSeparator {
  render() {
    return <div class="separator" part="separator" role="separator" />;
  }
}
