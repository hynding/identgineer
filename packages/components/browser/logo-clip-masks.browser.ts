import { logoDataUrl, sanitiseSvgLogo } from "@identgineer/brand";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The sanitiser writes a clip path of more than one shape, or of one clipped in turn, as an alpha
// mask of the same shapes, since a renderer combining the shapes of a clip path can take minutes.
// The picture must not change: each logo below is drawn as an image before and after sanitising,
// and the two must match pixel for pixel but for antialiasing at the edges.

const SIZE = 200;
/** A pixel differs when a channel moves by more than this, out of 255. */
const CHANNEL_TOLERANCE = 48;
/** How many pixels may differ: antialiased edges, at most half a percent of the image. */
const DIFFERING_PIXELS = (SIZE * SIZE) / 200;

const GRADIENT =
  '<linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#e11d48"/><stop offset="1" stop-color="#2563eb"/></linearGradient>';
const FULL = '<rect width="100" height="100" fill="url(#g)"';

function logo(body: string, root = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${String(SIZE)}" height="${String(SIZE)}"${root}><defs>${GRADIENT}</defs>${body}</svg>`;
}

const RING = "M50 10A40 40 0 1 1 49.9 10ZM50 30A20 20 0 1 1 49.9 30Z";
const RING_REVERSED = "M50 10A40 40 0 1 1 49.9 10ZM50 30A20 20 0 1 0 50.1 30Z";

const CLIPS: readonly (readonly [string, string])[] = [
  [
    "overlapping circles",
    logo(
      '<clipPath id="c"><circle cx="35" cy="40" r="25"/><circle cx="65" cy="40" r="25"/><circle cx="50" cy="65" r="25"/></clipPath>' +
        `${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "compound shapes filled by the even-odd rule, inherited from the clip path",
    logo(
      `<clipPath id="c" clip-rule="evenodd"><rect x="40" y="40" width="20" height="55"/><path d="${RING}"/></clipPath>${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "compound shapes filled by the nonzero rule, one wound each way",
    logo(
      `<clipPath id="c"><path d="${RING}"/><path d="${RING_REVERSED}" transform="translate(20 20) scale(0.6)"/></clipPath>${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a clip path with a transform of its own",
    logo(
      '<clipPath id="c" transform="rotate(20 50 50) scale(0.8)"><rect x="10" y="10" width="40" height="80"/><circle cx="70" cy="50" r="25"/></clipPath>' +
        `${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a clip path in the box of what it clips",
    logo(
      '<clipPath id="c" clipPathUnits="objectBoundingBox"><circle cx="0.3" cy="0.5" r="0.3"/><rect x="0.5" y="0.1" width="0.45" height="0.8"/></clipPath>' +
        '<rect x="10" y="20" width="80" height="40" fill="url(#g)" clip-path="url(#c)"/><circle cx="50" cy="80" r="15" fill="#0f766e" clip-path="url(#c)"/>',
    ),
  ],
  [
    "uses of shapes with fills, strokes and opacity of their own",
    logo(
      '<rect id="t" x="10" y="10" width="30" height="60" fill="#f00" stroke="#00f" stroke-width="12" opacity="0.3" transform="rotate(10)"/>' +
        '<clipPath id="c"><use href="#t" x="10"/><use href="#t" x="45" transform="translate(0 10)"/><circle cx="50" cy="85" r="12"/></clipPath>' +
        `${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a clip path on an element with a mask of its own",
    logo(
      '<mask id="m"><rect width="100" height="100" fill="#fff"/><rect x="30" width="20" height="100" fill="#555"/></mask>' +
        '<clipPath id="c"><circle cx="35" cy="50" r="30"/><circle cx="70" cy="50" r="25"/></clipPath>' +
        `${FULL} transform="translate(5 0)" clip-path="url(#c)" mask="url(#m)"/>`,
    ),
  ],
  [
    "a clip path on a transformed element drawn again by a use",
    logo(
      '<clipPath id="c"><circle cx="30" cy="30" r="20"/><rect x="30" y="30" width="30" height="20"/></clipPath>' +
        '<rect id="r" width="60" height="60" fill="url(#g)" transform="rotate(10 30 30)" clip-path="url(#c)"/><use href="#r" x="35" y="40"/>',
    ),
  ],
  [
    "a clip path on a stroke reaching far past its shape's box",
    logo(
      '<clipPath id="c"><circle cx="20" cy="50" r="18"/><circle cx="80" cy="50" r="18"/><rect x="40" y="5" width="20" height="90"/></clipPath>' +
        '<line x1="5" y1="50" x2="95" y2="50" stroke="url(#g)" stroke-width="95" clip-path="url(#c)"/>' +
        '<clipPath id="b" clipPathUnits="objectBoundingBox"><rect x="-2" y="-2" width="1.9" height="5"/><rect x="1.1" y="-2" width="1.9" height="5"/></clipPath>' +
        '<path d="M45 45h10v10h-10z" fill="none" stroke="#0f766e" stroke-width="40" clip-path="url(#b)"/>',
    ),
  ],
  [
    "shapes hidden or not displayed, and a use at a percentage position",
    logo(
      '<clipPath id="c" visibility="hidden"><circle cx="30" cy="50" r="20" visibility="visible"/><circle cx="70" cy="50" r="20"/>' +
        '<rect width="100" height="10" display="none"/><use href="#d" x="10%" y="5%" visibility="visible"/></clipPath>' +
        '<rect id="d" width="20" height="20" fill="none"/>' +
        `${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a clip path in a mask's content, set in style",
    logo(
      '<clipPath id="c"><circle cx="35" cy="50" r="30"/><circle cx="70" cy="50" r="25"/></clipPath>' +
        '<mask id="m"><rect width="100" height="100" fill="#fff" style="clip-path:url(#c)"/></mask>' +
        `${FULL} mask="url(#m)"/>`,
    ),
  ],
  [
    "a clip path of one shape clipped in turn",
    logo(
      '<clipPath id="k"><rect width="60" height="100"/></clipPath><circle id="t" cx="50" cy="50" r="40" clip-path="url(#k)"/>' +
        `<clipPath id="c"><use href="#t"/></clipPath>${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a clip path on the root, which works in the space around the root",
    logo(
      `<clipPath id="c"><circle cx="35" cy="50" r="30"/><circle cx="70" cy="50" r="25"/></clipPath>${FULL}/>`,
      ' clip-path="url(#c)"',
    ),
  ],
];

interface Comparison {
  readonly differing: number;
  readonly painted: number;
}

/** Draws both as images on canvases and counts the pixels that differ, and those painted. */
async function compare(page: Page, before: string, after: string): Promise<Comparison> {
  return page.evaluate(
    async ({ before, after, size, tolerance }) => {
      const pixels = async (url: string): Promise<Uint8ClampedArray> => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("no 2D context");
        context.drawImage(image, 0, 0, size, size);
        return context.getImageData(0, 0, size, size).data;
      };
      const [first, second] = [await pixels(before), await pixels(after)];
      let differing = 0;
      let painted = 0;
      for (let index = 0; index < first.length; index += 4) {
        let most = 0;
        for (let channel = 0; channel < 4; channel += 1) {
          most = Math.max(
            most,
            Math.abs((first[index + channel] ?? 0) - (second[index + channel] ?? 0)),
          );
        }
        if (most > tolerance) differing += 1;
        if ((first[index + 3] ?? 0) > 0) painted += 1;
      }
      return { differing, painted };
    },
    { before, after, size: SIZE, tolerance: CHANNEL_TOLERANCE },
  );
}

test.describe("a clip path written as a mask", () => {
  for (const [label, input] of CLIPS) {
    test(`draws the same picture: ${label}`, async ({ page }) => {
      const result = sanitiseSvgLogo(input);
      if (!result.ok) throw new Error(JSON.stringify(result.errors));
      expect(result.svg).not.toMatch(/<clipPath[^>]*>(?:<[^/][^>]*\/>){2}/);
      await page.setContent("<!doctype html><body>");
      const { differing, painted } = await compare(
        page,
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(input)}`,
        logoDataUrl(result.svg),
      );
      expect(painted, "the clipped picture paints something").toBeGreaterThan(SIZE * 10);
      expect(painted, "and is clipped").toBeLessThan(SIZE * SIZE * 0.95);
      expect(differing).toBeLessThanOrEqual(DIFFERING_PIXELS);
    });
  }

  // Chromium (153 here) clips to less than the union when a shape with a hole comes before one
  // that overlaps it, and to the union when the order is turned round. The mask draws the union the
  // specification asks for, whatever the order.
  test("draws the union of the shapes, which Chromium's clip gives in only one order", async ({
    page,
  }) => {
    const clip = (shapes: string): string =>
      logo(
        `<clipPath id="c" clip-rule="evenodd">${shapes}</clipPath>${FULL} clip-path="url(#c)"/>`,
      );
    const RECT = '<rect x="40" y="40" width="20" height="55"/>';
    const result = sanitiseSvgLogo(clip(`<path d="${RING}"/>${RECT}`));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    await page.setContent("<!doctype html><body>");
    const { differing } = await compare(
      page,
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clip(`${RECT}<path d="${RING}"/>`))}`,
      logoDataUrl(result.svg),
    );
    expect(differing).toBeLessThanOrEqual(DIFFERING_PIXELS);
  });
});
