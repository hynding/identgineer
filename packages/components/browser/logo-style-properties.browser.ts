import { sanitiseSvgLogo } from "@identgineer/brand";
// The base test, not the strict fixture: Chromium logs each value it rejects, as it should here.
import { expect, test, type Page } from "@playwright/test";

// Which style properties move or resize an element is Chromium's to say, not a list's: every
// property its CSSStyleDeclaration exposes, prefixed aliases and shorthands included, is set in
// `style` on each element the sanitiser keeps, with each of a set of values that would move,
// resize, hide or clip something, wherever Chromium takes the value. Where Chromium then draws
// the logo otherwise (as an image) and the element's box or transform has changed (read from the
// same document inline, where the box of a shape and its transform can be asked for; for a
// definition, which has no box, any change to the drawing counts), the sanitiser must refuse the
// logo, drop the element, or keep the declaration so the output draws as the original does.

const svg = (body: string, root = ""): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"${root}>${body}</svg>`;

const RECT = '<rect x="10" y="10" width="50" height="50" fill="#f00"/>';
const STOPS = '<stop offset="0.5" stop-color="#0f0"/><stop offset="0.5" stop-color="#00f"/>';

interface Probe {
  /** The probe with the style attribute written where `@` stands. */
  readonly template: string;
  /** What to measure inline: the root's content, an element by name, or nothing (a definition). */
  readonly measure: string | undefined;
  /** The element the style is on, as a removal names it. */
  readonly element: string;
}

const probe = (template: string, element: string, measure?: string): Probe => ({
  template,
  element,
  measure,
});

const PROBES: Readonly<Record<string, Probe>> = {
  root: probe(svg(RECT, "@"), "svg", "root"),
  rect: probe(
    svg('<rect x="10" y="10" width="50" height="50" rx="5" fill="#f00"@/>'),
    "rect",
    "rect",
  ),
  "rect with a transform": probe(
    svg('<rect x="10" y="10" width="50" height="50" fill="#f00" transform="rotate(20)"@/>'),
    "rect",
    "rect",
  ),
  circle: probe(svg('<circle cx="40" cy="40" r="20" fill="#f00"@/>'), "circle", "circle"),
  ellipse: probe(
    svg('<ellipse cx="40" cy="40" rx="20" ry="10" fill="#f00"@/>'),
    "ellipse",
    "ellipse",
  ),
  line: probe(
    svg('<line x1="10" y1="10" x2="60" y2="60" stroke="#f00" stroke-width="5"@/>'),
    "line",
    "line",
  ),
  polyline: probe(
    svg('<polyline points="10 10 60 10 60 60" fill="#f00"@/>'),
    "polyline",
    "polyline",
  ),
  polygon: probe(svg('<polygon points="10 10 60 10 60 60" fill="#f00"@/>'), "polygon", "polygon"),
  path: probe(svg('<path d="M10 10H60V60Z" fill="#f00"@/>'), "path", "path"),
  g: probe(svg(`<g@>${RECT}</g>`), "g", "rect"),
  "g with a transform": probe(svg(`<g transform="rotate(20)"@>${RECT}</g>`), "g", "rect"),
  use: probe(
    svg(
      '<defs><rect id="r" width="30" height="30" fill="#f00"/></defs><use href="#r" x="10" y="10"@/>',
    ),
    "use",
    "use",
  ),
  "use with a transform": probe(
    svg(
      '<defs><rect id="r" width="30" height="30" fill="#f00"/></defs><use href="#r" x="10" y="10" transform="rotate(20)"@/>',
    ),
    "use",
    "use",
  ),
  "shape in a clip path": probe(
    svg(
      '<clipPath id="c"><rect x="10" y="10" width="50" height="50"@/></clipPath><rect width="100" height="100" fill="#f00" clip-path="url(#c)"/>',
    ),
    "rect",
    "clipPath rect",
  ),
  linearGradient: probe(
    svg(
      `<linearGradient id="g" x2="1"@>${STOPS}</linearGradient><rect width="100" height="100" fill="url(#g)"/>`,
    ),
    "linearGradient",
  ),
  "linearGradient with a transform": probe(
    svg(
      `<linearGradient id="g" x2="1" gradientTransform="rotate(20)"@>${STOPS}</linearGradient><rect width="100" height="100" fill="url(#g)"/>`,
    ),
    "linearGradient",
  ),
  radialGradient: probe(
    svg(
      `<radialGradient id="g"@>${STOPS}</radialGradient><rect width="100" height="100" fill="url(#g)"/>`,
    ),
    "radialGradient",
  ),
  stop: probe(
    svg(
      '<linearGradient id="g"><stop offset="0.5" stop-color="#0f0"@/><stop offset="0.5" stop-color="#00f"/></linearGradient><rect width="100" height="100" fill="url(#g)"/>',
    ),
    "stop",
  ),
  clipPath: probe(
    svg(
      '<clipPath id="c"@><rect x="10" y="10" width="50" height="50"/></clipPath><rect width="100" height="100" fill="#f00" clip-path="url(#c)"/>',
    ),
    "clipPath",
  ),
  "clipPath with a transform": probe(
    svg(
      '<clipPath id="c" transform="rotate(20)"@><rect x="10" y="10" width="50" height="50"/></clipPath><rect width="100" height="100" fill="#f00" clip-path="url(#c)"/>',
    ),
    "clipPath",
  ),
  mask: probe(
    svg(
      '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"@><rect x="10" y="10" width="50" height="50" fill="#fff"/></mask><rect width="100" height="100" fill="#f00" mask="url(#m)"/>',
    ),
    "mask",
  ),
};

// Values that would move, resize, hide or clip something, for whichever properties take them.
const VALUES = [
  "translate(20px, 20px)",
  "rotate(45deg)",
  "scale(0.5)",
  "matrix(0.5, 0, 0, 0.5, 10, 10)",
  "rotateY(45deg)",
  "perspective(10px) rotateY(45deg)",
  "20px",
  "30px 30px",
  "10px 10px 0",
  "20px 20px 20px 20px",
  "50%",
  "0.5",
  "2",
  "45deg",
  "x 45deg",
  "2 2",
  "path('M0 0H50')",
  "path('M0 0H90V90Z')",
  "path('M0 0H50') 20px",
  "inset(10px)",
  "circle(10px)",
  "fill-box",
  "view-box",
  "stroke-box",
  "border-box",
  "content-box",
  "none",
  "hidden",
  "auto",
  "absolute",
  "block",
  "flex",
  "preserve-3d",
  "below",
  "left",
  "right",
  "bottom",
  "center",
  "vertical-rl",
  "rtl",
];

/** Every style property Chromium exposes, as written in CSS, with each value it takes. */
async function declarations(page: Page): Promise<string[]> {
  return page.evaluate((values) => {
    const style = document.body.style as unknown as Record<string, unknown>;
    const names = new Set<string>();
    for (const key in style) {
      if (/^\d+$/.test(key) || typeof style[key] !== "string") continue;
      let name = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      if (name.startsWith("webkit-")) name = `-${name}`;
      if (CSS.supports(name, "initial")) names.add(name);
    }
    const computed = getComputedStyle(document.body);
    for (let index = 0; index < computed.length; index += 1) names.add(computed.item(index));
    return [...names]
      .sort()
      .flatMap((name) =>
        values.filter((value) => CSS.supports(name, value)).map((value) => `${name}:${value}`),
      );
  }, VALUES);
}

const withStyle = (template: string, declaration: string): string =>
  template.replace(
    "@",
    declaration === "" ? "" : ` style="${declaration.replace(/"/g, "&quot;")}"`,
  );

/** A hash of every pixel of each source drawn as an image, in order. */
async function drawings(page: Page, sources: readonly string[]): Promise<number[]> {
  return page.evaluate(async (list) => {
    const draw = async (source: string): Promise<number> => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
      await image.decode().catch(() => undefined);
      const canvas = new OffscreenCanvas(100, 100);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no canvas");
      context.drawImage(image, 0, 0, 100, 100);
      const data = context.getImageData(0, 0, 100, 100).data;
      let hash = 0;
      for (const byte of data) hash = (Math.imul(hash, 31) + byte) | 0;
      return hash;
    };
    return Promise.all(list.map(draw));
  }, sources);
}

/**
 * Each source's measured element inline: its box and transform (for the root, its content's box
 * within the page and the root's size), or `missing`.
 */
async function measures(
  page: Page,
  sources: readonly string[],
  measure: string,
): Promise<string[]> {
  return page.evaluate(
    ([list, selector]) =>
      list.map((source) => {
        const holder = document.createElement("div");
        holder.style.cssText = "position:absolute;left:0;top:0";
        document.body.append(holder);
        holder.innerHTML = source;
        const root = holder.querySelector("svg");
        const target =
          selector === "root"
            ? root?.querySelector("rect")
            : root?.querySelector<SVGGraphicsElement>(`${selector}:not(defs *)`);
        let read = "missing";
        if (root !== null && target !== null && target !== undefined) {
          const box = target.getBoundingClientRect();
          const size = root.getBoundingClientRect();
          const matrix = target instanceof SVGGraphicsElement ? target.getCTM() : null;
          const numbers = [box.x, box.y, box.width, box.height, size.width, size.height];
          if (matrix !== null)
            numbers.push(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
          read = numbers.map((number) => number.toFixed(2)).join(",");
        }
        holder.remove();
        return read;
      }),
    [sources, measure] as const,
  );
}

test.describe("every style property Chromium has, on each element the sanitiser keeps", () => {
  test.describe.configure({ timeout: 600_000 });
  for (const [name, { template, measure, element }] of Object.entries(PROBES)) {
    test(`is refused, drops the ${name}, or draws as the original where it moves it`, async ({
      page,
    }) => {
      await page.setContent("<!doctype html><body></body>");
      const list = await declarations(page);
      expect(list.length).toBeGreaterThan(1000);
      const originals = list.map((declaration) => withStyle(template, declaration));
      const [plain = 0, ...drawn] = await drawings(page, [withStyle(template, ""), ...originals]);
      let changed = list.flatMap((declaration, index) =>
        drawn[index] === plain ? [] : [{ declaration, original: originals[index] ?? "" }],
      );
      if (measure !== undefined) {
        const [before, ...after] = await measures(
          page,
          [withStyle(template, ""), ...changed.map(({ original }) => original)],
          measure,
        );
        changed = changed.filter((_, index) => after[index] !== before);
      }
      const kept = changed.flatMap(({ declaration, original }) => {
        const result = sanitiseSvgLogo(original);
        if (!result.ok) return [];
        const dropped = result.removed.some(
          (removal) =>
            removal.element === element &&
            removal.attribute === undefined &&
            removal.property === undefined,
        );
        return dropped ? [] : [{ declaration, original, output: result.svg }];
      });
      const shown = await drawings(
        page,
        kept.flatMap(({ original, output }) => [original, output]),
      );
      const disagreements = kept.flatMap(({ declaration }, index) =>
        shown[2 * index] === shown[2 * index + 1] ? [] : [declaration],
      );
      expect(disagreements).toEqual([]);
    });
  }
});
