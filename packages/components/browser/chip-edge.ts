import type { Locator } from "@playwright/test";

/** The edge of one element, measured the same way for any element a test names. */
export interface Edge {
  /** What the element is: the swatch role it belongs to, or its own class. */
  readonly label: string;
  readonly scheme: string;
  /** The edge, composited where it is translucent, as `rgb()` channels. */
  readonly edge: string;
  /** What is behind the element: every background from the page down, composited. */
  readonly behind: string;
  readonly width: string;
  /** WCAG contrast of the edge against what is behind the element. */
  readonly ratio: number;
}

export interface ChipEdge {
  readonly role: string;
  readonly scheme: string;
  /** The edge, composited where it is translucent, as `rgb()` channels. */
  readonly edge: string;
  /** What is behind the chip: every background from the page down to the scheme's surface, composited. */
  readonly behind: string;
  readonly width: string;
  /** WCAG contrast of the edge against what is behind the chip. */
  readonly ratio: number;
}

/**
 * The edge of every chip of a swatches element measured against the background it really sits on:
 * the backgrounds of its ancestors, through shadow roots, composited from the page down, so a
 * translucent surface (the glass design's 42% fill) is judged as drawn and not as its token.
 */
export async function measureChipEdges(swatches: Locator): Promise<ChipEdge[]> {
  const edges = await measureEdges(swatches, ".chip");
  return edges.map(({ label, ...rest }) => ({ role: label, ...rest }));
}

/**
 * The top edge of every element matching `selector` in a host's shadow root and in the shadow roots
 * inside it, measured as `measureChipEdges` does: against what is really behind it.
 */
export async function measureEdges(host: Locator, selector: string): Promise<Edge[]> {
  return host.evaluate((element, wanted) => {
    type Colour = [number, number, number, number];
    const parse = (css: string): Colour => {
      const legacy = /^rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\)$/.exec(css);
      if (legacy) {
        return [Number(legacy[1]), Number(legacy[2]), Number(legacy[3]), Number(legacy[4] ?? 1)];
      }
      const modern = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(css);
      if (modern) {
        return [
          Number(modern[1]) * 255,
          Number(modern[2]) * 255,
          Number(modern[3]) * 255,
          Number(modern[4] ?? 1),
        ];
      }
      throw new Error(`not a colour this test reads: ${css}`);
    };
    const over = (top: Colour, bottom: Colour): Colour => {
      const alpha = top[3] + bottom[3] * (1 - top[3]);
      const channel = (index: 0 | 1 | 2) =>
        (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha;
      return [channel(0), channel(1), channel(2), alpha];
    };
    const luminance = ([red, green, blue]: Colour) => {
      const [r, g, b] = [red, green, blue].map((value) => {
        const unit = value / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      }) as [number, number, number];
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parentOf = (node: Element): Element | null =>
      node.parentElement ?? (node.getRootNode() as Partial<ShadowRoot>).host ?? null;
    const behind = (chip: Element): Colour => {
      const layers: Colour[] = [];
      for (let node = parentOf(chip); node; node = parentOf(node)) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none")
          throw new Error(`${node.localName} has a background image`);
        layers.push(parse(style.backgroundColor));
      }
      // The page is painted over white where nothing opaque is behind.
      return layers.reduceRight((below, layer) => over(layer, below), [255, 255, 255, 1] as Colour);
    };
    const css = (colour: Colour) => `rgb(${colour.slice(0, 3).map(Math.round).join(", ")})`;
    const collect = (root: ParentNode): Element[] => [
      ...root.querySelectorAll(wanted),
      ...[...root.querySelectorAll("*")].flatMap((inner) =>
        inner.shadowRoot ? collect(inner.shadowRoot) : [],
      ),
    ];
    return collect(element.shadowRoot ?? element).map((item) => {
      const style = getComputedStyle(item);
      const background = behind(item);
      const edge = over(parse(style.borderTopColor), background);
      const [lighter, darker] = [luminance(edge), luminance(background)].sort((a, b) => b - a) as [
        number,
        number,
      ];
      return {
        label: item.closest(".swatch")?.querySelector(".role")?.textContent ?? item.className,
        scheme: item.closest("[data-scheme]")?.getAttribute("data-scheme") ?? "",
        edge: css(edge),
        behind: css(background),
        width: style.borderTopWidth,
        ratio: (lighter + 0.05) / (darker + 0.05),
      };
    });
  }, selector);
}
