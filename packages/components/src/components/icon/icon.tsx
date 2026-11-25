import { Build, Component, h, Prop } from "@stencil/core";
import { oneOf } from "../../utils/controls-copies";
import { ICON_SIZES, type IconSize } from "./icon-options";
import { ICON_PATHS, isIconName, type IconName } from "./icon-paths";

const warned = new Set<string>();

// A wrong name is a mistake in the page, not in the user's data, so it is reported while
// developing and then ignored. Once per name keeps a list of them from flooding the console.
function warnOnce(name: string | undefined): void {
  if (!Build.isDev || name === undefined || warned.has(name)) return;
  warned.add(name);
  console.warn(`idg-icon: there is no icon named "${name}".`);
}

/**
 * A small built-in icon, drawn as inline svg paths and coloured by the text around it.
 *
 * @part icon - The svg element.
 */
@Component({
  tag: "idg-icon",
  styleUrl: "icon.css",
  shadow: true,
})
export class IdgIcon {
  /** Which icon to draw. An unknown name draws nothing. */
  @Prop({ reflect: true }) name?: IconName;

  /** Size relative to the surrounding text. */
  @Prop({ reflect: true }) size: IconSize = "md";

  /** Gives the icon an accessible name. Without it the icon is decoration and hidden. */
  @Prop() label?: string;

  render() {
    if (!isIconName(this.name)) {
      warnOnce(this.name);
      return null;
    }
    const size = oneOf(ICON_SIZES, this.size, "md");
    const labelled = this.label !== undefined && this.label !== "";
    return (
      <svg
        class={{ icon: true, [`size-${size}`]: true }}
        part="icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentcolor"
        role={labelled ? "img" : undefined}
        aria-label={labelled ? this.label : undefined}
        aria-hidden={labelled ? undefined : "true"}
        focusable="false"
      >
        {ICON_PATHS[this.name].map((path) => (
          <path d={path} />
        ))}
      </svg>
    );
  }
}
