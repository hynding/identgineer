import { logoDataUrl, sanitiseSvgLogo } from "@identgineer/brand";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The sanitiser writes a clip path of more than one shape, or of one clipped in turn, as an alpha
// mask of the same shapes, since a renderer combining the shapes of a clip path can take minutes,
// and changes a few other things that would cost too much to draw. It must never show more than
// the original: each logo below is drawn as an image before and after sanitising, no pixel may be
// painted after that was not before but for antialiasing at the edges, and where the picture is
// meant to stay the same the two must match pixel for pixel, but for antialiasing.

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

/** `same`: the picture must not change; `less`: it may lose what was painted, but gain nothing. */
type Outcome = "same" | "less";

const CLIPS: readonly (readonly [string, string, Outcome?])[] = [
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
  [
    "a clip child that a use elsewhere draws",
    logo(
      '<clipPath id="c"><rect id="r" width="40" height="40" fill="#0f766e"/><circle cx="60" cy="60" r="20"/></clipPath>' +
        `${FULL} clip-path="url(#c)"/><use href="#r" x="55" y="5"/>`,
    ),
  ],
  [
    "a hidden clip child that a use elsewhere draws",
    logo(
      '<g visibility="hidden"><clipPath id="c"><rect id="r" width="40" height="40"/><circle cx="60" cy="60" r="20"/></clipPath></g>' +
        `${FULL} clip-path="url(#c)"/><use href="#r" x="50" y="50" visibility="visible" fill="#0f766e"/>`,
    ),
  ],
  [
    "a use with a position, a mask of its own and a clip path",
    logo(
      '<mask id="m"><rect x="-100" y="-100" width="300" height="300" fill="#fff"/></mask><rect id="s" x="-50" y="-50" width="100" height="100" fill="url(#g)"/>' +
        '<clipPath id="c"><rect width="20" height="20"/><rect x="25" y="25" width="20" height="20"/></clipPath>' +
        '<use href="#s" x="50" y="50" mask="url(#m)" clip-path="url(#c)"/><use href="#s" x="5%" y="10" transform="scale(0.5)" mask="url(#m)" clip-path="url(#c)"/>',
    ),
  ],
  [
    "a use at a percentage position in a clip path in the box of what it clips",
    logo(
      '<defs><rect id="r" width="0.3" height="0.3"/></defs><clipPath id="c" clipPathUnits="objectBoundingBox"><use href="#r" x="0.5%" y="0.1%"/>' +
        '<circle cx="0.2" cy="0.7" r="0.2"/></clipPath><rect x="10" y="20" width="80" height="60" fill="url(#g)" clip-path="url(#c)"/>',
    ),
  ],
  [
    "a clip path that is clipped itself, under its own transform",
    logo(
      '<clipPath id="d"><rect width="50" height="50"/></clipPath><clipPath id="c" clip-path="url(#d)" transform="translate(20 0)"><rect width="60" height="100"/></clipPath>' +
        `${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a clipped shape in a clip path",
    logo(
      '<clipPath id="d"><rect width="50" height="50"/></clipPath><clipPath id="c"><rect width="100" height="100" clip-path="url(#d)"/></clipPath>' +
        `${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a clipped use in a clip path, the inner clip of two shapes",
    logo(
      '<clipPath id="d"><rect width="50" height="50"/><circle cx="70" cy="70" r="20"/></clipPath><defs><rect id="t" width="100" height="100" fill="#f00"/></defs>' +
        `<clipPath id="c"><use href="#t" clip-path="url(#d)"/></clipPath>${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a mask inside a clip path, which Chromium ignores",
    logo(
      '<mask id="m"><rect width="30" height="100" fill="#fff"/></mask><clipPath id="c" mask="url(#m)"><rect width="50" height="100" mask="url(#m)"/>' +
        `<circle cx="70" cy="50" r="20"/></clipPath>${FULL} clip-path="url(#c)"/>`,
    ),
  ],
  [
    "a clip path of one shape in the box of what it clips, with a transform, kept as it is",
    logo(
      '<clipPath id="c" clipPathUnits="objectBoundingBox" transform="translate(0.5 0)"><rect width="0.4" height="1"/></clipPath>' +
        '<rect x="10" y="10" width="80" height="80" fill="url(#g)" clip-path="url(#c)"/>',
    ),
  ],
  [
    "a clip path holding a use of a group, emptied",
    logo(
      '<g id="gr"><rect x="60" width="20" height="100"/></g><clipPath id="c"><rect width="50" height="100"/><use href="#gr"/></clipPath>' +
        `${FULL} clip-path="url(#c)"/><circle cx="50" cy="50" r="30" fill="#0f766e"/>`,
    ),
    "less",
  ],
];

/** Logos whose view box would be stretched or cropped, beside the clip paths. */
const ASPECTS: readonly (readonly [string, string, Outcome])[] = [
  [
    "a view box cropped to fill a square",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="${String(SIZE)}" height="${String(SIZE)}" preserveAspectRatio="xMinYMid slice"><defs>${GRADIENT}</defs>` +
      '<rect x="-40" y="-40" width="200" height="130" fill="#0f766e"/><circle cx="25" cy="25" r="25" fill="url(#g)"/><circle cx="80" cy="25" r="25" fill="#e11d48"/></svg>',
    "same",
  ],
  [
    "a view box stretched to fill a square",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="${String(SIZE)}" height="${String(SIZE)}" preserveAspectRatio="none"><defs>${GRADIENT}</defs>` +
      '<rect x="-40" y="-40" width="200" height="35" fill="#0f766e"/><circle cx="25" cy="25" r="25" fill="url(#g)"/></svg>',
    "less",
  ],
  [
    // Percentages of a box, not of the view box, are unchanged by a crop.
    "a view box cropped to fill a square, with percentages of boxes",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="${String(SIZE)}" height="${String(SIZE)}" preserveAspectRatio="xMidYMid slice">` +
      '<linearGradient id="h" x1="10%" x2="90%"><stop offset="0" stop-color="#e11d48"/><stop offset="1" stop-color="#2563eb"/></linearGradient>' +
      '<mask id="m" x="-10%" y="-10%" width="60%" height="120%"><rect width="100" height="50" fill="#fff"/></mask>' +
      '<rect width="100" height="50" fill="url(#h)" mask="url(#m)"/></svg>',
    "same",
  ],
];

interface Comparison {
  /** Pixels that differ in any channel. */
  readonly differing: number;
  /**
   * Pixels painted after in a colour that is neither the original's there nor the transparent
   * background: what sanitising would show that the original did not, opaque or not.
   */
  readonly foreign: number;
  /** Pixels painted before. */
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
      let foreign = 0;
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
        if (most > tolerance && (second[index + 3] ?? 0) > tolerance) foreign += 1;
        if ((first[index + 3] ?? 0) > 0) painted += 1;
      }
      return { differing, foreign, painted };
    },
    { before, after, size: SIZE, tolerance: CHANNEL_TOLERANCE },
  );
}

/** Sanitises `input` and compares the two pictures, holding them to `outcome`. */
async function check(page: Page, input: string, outcome: Outcome): Promise<Comparison> {
  const result = sanitiseSvgLogo(input);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await page.setContent("<!doctype html><body>");
  const comparison = await compare(
    page,
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(input)}`,
    logoDataUrl(result.svg),
  );
  expect(comparison.painted, "the original paints something").toBeGreaterThan(SIZE * 10);
  expect(
    comparison.foreign,
    "nothing shown that the original did not show there",
  ).toBeLessThanOrEqual(DIFFERING_PIXELS);
  if (outcome === "same") expect(comparison.differing).toBeLessThanOrEqual(DIFFERING_PIXELS);
  return comparison;
}

test.describe("a clip path written as a mask", () => {
  for (const [label, input, outcome = "same"] of CLIPS) {
    test(`draws ${outcome === "same" ? "the same picture" : "no more"}: ${label}`, async ({
      page,
    }) => {
      const result = sanitiseSvgLogo(input);
      expect(result.ok && result.svg).not.toMatch(/<clipPath[^>]*[^/]>(?:<[^/][^>]*\/>){2}/);
      const { painted } = await check(page, input, outcome);
      expect(painted, "and is clipped").toBeLessThan(SIZE * SIZE * 0.95);
    });
  }

  for (const [label, input, outcome] of ASPECTS) {
    test(`draws ${outcome === "same" ? "the same picture" : "no more"}: ${label}`, async ({
      page,
    }) => {
      await check(page, input, outcome);
    });
  }

  // Stretching keeps the view box, so percentages of it resolve as they did: drawn in a frame of
  // the view box's proportions, where nothing is stretched, before and after are the same.
  test("keeps percentages of a stretched view box where they were", async ({ page }) => {
    const body =
      '<mask id="m" maskUnits="userSpaceOnUse" x="25%" width="50%" height="100%"><rect width="200" height="100" fill="#fff"/></mask>' +
      '<rect width="50%" height="100%" fill="#2563eb"/><circle cx="150" cy="50" r="20%" fill="#e11d48" mask="url(#m)"/>' +
      '<path d="M0 50H200" stroke="#0f766e" stroke-width="10%"/>';
    const logo = (height: number): string =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="${String(height)}" preserveAspectRatio="none">${body}</svg>`;
    const result = sanitiseSvgLogo(logo(200));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.svg).toContain('<rect width="50%" height="100%"');
    await page.setContent("<!doctype html><body>");
    const url = (svg: string): string =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const { differing, painted } = await compare(
      page,
      url(logo(100)),
      url(result.svg.replace('height="200"', 'height="100"')),
    );
    expect(painted).toBeGreaterThan(SIZE * SIZE * 0.5);
    expect(differing).toBeLessThanOrEqual(DIFFERING_PIXELS);
  });

  // Two opaque pictures, the second showing in red what the first hid under its root clip path (as
  // an earlier version wrote a stretched view box beside one): the alpha is the same everywhere,
  // so only a comparison of colour sees what was shown.
  test("counts what is shown in another colour as shown, though nothing grows more opaque", async ({
    page,
  }) => {
    const before =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200" preserveAspectRatio="none" clip-path="url(#c)">' +
      '<clipPath id="c"><rect y="90" width="200" height="20"/></clipPath><rect width="100" height="100" fill="red"/><rect y="45" width="100" height="10" fill="lime"/></svg>';
    const after =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200" clip-path="url(#c)">' +
      '<clipPath id="c"><rect y="90" width="200" height="20"/></clipPath><rect width="100" height="100" fill="red"/><rect y="40" width="100" height="10" fill="lime"/></svg>';
    await page.setContent("<!doctype html><body>");
    const url = (svg: string): string =>
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const { foreign } = await compare(page, url(before), url(after));
    expect(foreign).toBeGreaterThan(DIFFERING_PIXELS);
  });

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

test.describe("paint order", () => {
  test("draws a stroke painted under its fill as it was", async ({ page }) => {
    await check(
      page,
      logo(
        '<circle cx="50" cy="50" r="30" fill="url(#g)" stroke="#e11d48" stroke-width="20" paint-order="stroke"/>',
      ),
      "same",
    );
  });
});
