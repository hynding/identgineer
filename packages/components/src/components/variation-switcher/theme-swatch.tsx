import { h, type FunctionalComponent } from "@stencil/core";
import type { ThemePreview } from "@identgineer/variations";
import { swatchColour } from "./variation-switcher-options";

type Swatches = ThemePreview["swatches"];
type Scheme = keyof Swatches;

interface Block {
  readonly colour: keyof Swatches[Scheme];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

// One half of the picture, on a grid of 20 by 20: the page, a surface on it, a line of text and
// the accent with its subtle partner.
const BLOCKS: readonly Block[] = [
  { colour: "bg", x: 0, y: 0, width: 20, height: 20, radius: 0 },
  { colour: "surface", x: 3, y: 3, width: 14, height: 14, radius: 2 },
  { colour: "text", x: 5, y: 6, width: 9, height: 2, radius: 1 },
  { colour: "accent", x: 5, y: 11, width: 6, height: 4, radius: 1 },
  { colour: "accentSubtle", x: 12, y: 11, width: 3, height: 4, radius: 1 },
];

const HALVES: readonly { scheme: Scheme; offset: number }[] = [
  { scheme: "light", offset: 0 },
  { scheme: "dark", offset: 20 },
];

/**
 * A theme's colours, light on the left and dark on the right, drawn as an svg.
 *
 * A strict `style-src` refuses inline styles, and so a `style` attribute or a style property
 * cannot carry a colour that is only known at run time. SVG presentation attributes are not
 * styles: `fill` is an attribute, which the policy does not govern, and it is set here from the
 * registry. Each colour is checked to be a hex colour first, so only a colour can reach it.
 */
export const ThemeSwatch: FunctionalComponent<{ preview: ThemePreview }> = ({ preview }) => (
  <svg
    class="swatch"
    viewBox="0 0 40 20"
    aria-hidden="true"
    focusable="false"
    xmlns="http://www.w3.org/2000/svg"
  >
    {HALVES.flatMap(({ scheme, offset }) =>
      BLOCKS.map((block) => {
        const fill = swatchColour(preview.swatches[scheme][block.colour]);
        return fill === undefined ? null : (
          <rect
            x={block.x + offset}
            y={block.y}
            width={block.width}
            height={block.height}
            rx={block.radius}
            fill={fill}
          />
        );
      }),
    )}
  </svg>
);
