import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  logoDataUrl,
  parseBrandKit,
  sanitiseSvgLogo,
  SVG_LOGO_LIMITS,
  type SvgLogoErrorCode,
} from "@identgineer/brand";
import { test as base, type Page } from "@playwright/test";
import { CONTENT_SECURITY_POLICY } from "./content-security-policy";
import { expect, test } from "./fixtures";
import { BROWSER_PORT } from "./port";

const BRAND_FIXTURES = new URL("../../brand/src/__fixtures__/", import.meta.url);
const PAGE = "/fixtures/logo-render.html";
const ORIGIN = `http://127.0.0.1:${String(BROWSER_PORT)}`;
const OWN_FILES = new Set([
  PAGE,
  "/fixtures/logo-render.js",
  "/fixtures/logos.json",
  "/favicon.ico",
]);

/**
 * The strict policy every browser test runs under, with one directive added: images may come from
 * data URLs, which is what a page that shows logos through `logoDataUrl` must allow.
 */
const LOGO_POLICY = CONTENT_SECURITY_POLICY.replace(
  "default-src 'self';",
  "default-src 'self'; img-src 'self' data:;",
);

interface Logo {
  readonly name: string;
  /** Rendered inline when given. */
  readonly svg?: string;
  /** Rendered as an image when given. */
  readonly dataUrl?: string;
}

function corpus(folder: string): { name: string; bytes: Uint8Array }[] {
  const directory = new URL(`${folder}/`, BRAND_FIXTURES);
  return readdirSync(fileURLToPath(directory))
    .filter((file) => file.endsWith(".svg"))
    .sort()
    .map((file) => ({
      name: `${folder}/${file}`,
      bytes: new Uint8Array(readFileSync(new URL(file, directory))),
    }));
}

/** Every logo the sanitiser accepts from both corpora and the fixture kit, with its data URL. */
function sanitisedLogos(): Logo[] {
  const logos: Logo[] = [];
  for (const { name, bytes } of [...corpus("hostile-svg"), ...corpus("clean-svg")]) {
    const result = sanitiseSvgLogo(bytes);
    if (result.ok) logos.push({ name, svg: result.svg, dataUrl: logoDataUrl(result.svg) });
  }
  const kit = parseBrandKit(
    JSON.parse(readFileSync(new URL("harbour-lights.kit.json", BRAND_FIXTURES), "utf8")),
  );
  if (!kit.ok || kit.kit.logo === undefined || kit.kit.mark === undefined) {
    throw new Error("the fixture kit has no logo");
  }
  logos.push({ name: "kit logo", svg: kit.kit.logo, dataUrl: logoDataUrl(kit.kit.logo) });
  logos.push({ name: "kit mark", svg: kit.kit.mark, dataUrl: logoDataUrl(kit.kit.mark) });
  return logos;
}

interface Watch {
  readonly requests: string[];
  readonly dialogs: string[];
}

/**
 * Serves the fixture page with the given policy (none when `undefined`), hands it the logos, and
 * records every request the page makes and every dialog it opens. Requests to any other origin
 * are recorded and then refused, so nothing leaves the machine.
 */
async function render(
  page: Page,
  logos: readonly Logo[],
  policy: string | undefined,
): Promise<Watch> {
  const watch: Watch = { requests: [], dialogs: [] };
  page.on("request", (request) => {
    if (!request.url().startsWith("data:")) watch.requests.push(request.url());
  });
  page.on("dialog", (dialog) => {
    watch.dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.addInitScript(() => {
    // A logo's script would most likely call alert; counting the calls is the canary.
    const counter = window as unknown as { __canary: number };
    counter.__canary = 0;
    window.alert = () => {
      counter.__canary += 1;
    };
  });
  await page.route(
    (url) => url.origin !== ORIGIN,
    (route) => route.abort(),
  );
  await page.route(`**${PAGE}`, async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers["content-security-policy"];
    if (policy !== undefined) headers["content-security-policy"] = policy;
    await route.fulfill({ response, headers });
  });
  await page.route("**/fixtures/logos.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ logos }) }),
  );
  await page.goto(PAGE);
  await expect(page.locator(`html[data-rendered="${String(logos.length)}"]`)).toHaveCount(1);
  return watch;
}

async function canary(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __canary: number }).__canary);
}

async function report(page: Page): Promise<{ violations: string[]; broken: string[] }> {
  return page.evaluate(
    () =>
      (window as unknown as { __logoReport: { violations: string[]; broken: string[] } })
        .__logoReport,
  );
}

/** What the HTML parser built from the inline logos: every element and attribute name. */
async function inlineMarkup(page: Page): Promise<{ elements: string[]; attributes: string[] }> {
  return page.evaluate(() => {
    const elements = new Set<string>();
    const attributes = new Set<string>();
    for (const element of document.querySelectorAll("#inline *")) {
      if (element.parentElement?.id === "inline") continue;
      elements.add(`${element.namespaceURI ?? ""} ${element.localName}`);
      for (const attribute of element.attributes) attributes.add(attribute.name);
    }
    return { elements: [...elements].sort(), attributes: [...attributes].sort() };
  });
}

const SVG = "http://www.w3.org/2000/svg";
const ALLOWED_ELEMENTS = [
  "svg",
  "g",
  "defs",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "use",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "title",
  "desc",
].map((name) => `${SVG} ${name}`);

test.describe("sanitised logos in a browser", () => {
  const logos = sanitisedLogos();

  test("every accepted logo renders as an image and inline under the strict policy, with no script, load or violation", async ({
    page,
  }) => {
    expect(logos.length).toBeGreaterThan(80);
    const watch = await render(page, logos, LOGO_POLICY);
    expect(await report(page)).toEqual({ violations: [], broken: [] });
    expect(await canary(page)).toBe(0);
    expect(watch.dialogs).toEqual([]);
    expect(
      watch.requests
        .map((url) => new URL(url))
        .filter((url) => url.origin !== ORIGIN || !OWN_FILES.has(url.pathname)),
    ).toEqual([]);
    const markup = await inlineMarkup(page);
    expect(markup.elements.filter((element) => !ALLOWED_ELEMENTS.includes(element))).toEqual([]);
    expect(
      markup.attributes.filter((name) => /^on|^style$|:/i.test(name) && name !== "xmlns"),
    ).toEqual([]);
  });

  test("with no policy at all, inlining every accepted logo still runs nothing and loads nothing", async ({
    page,
  }) => {
    const watch = await render(page, logos, undefined);
    expect(await canary(page)).toBe(0);
    expect(watch.dialogs).toEqual([]);
    expect(
      watch.requests
        .map((url) => new URL(url))
        .filter((url) => url.origin !== ORIGIN || !OWN_FILES.has(url.pathname)),
    ).toEqual([]);
    expect((await report(page)).broken).toEqual([]);
  });
});

// The control: the same page and checks, given the corpus as uploaded. If these did not trip, the
// passing tests above would prove nothing. Inline is the control that can trip: an image never runs
// a script or loads anything, whatever the file holds, as the last test here shows. That is why
// an image is the second layer, and why it cannot be the control for the first.
base.describe("the checks themselves", () => {
  // Only the files the sanitiser accepts (after removing their payload): those it refuses include
  // the resource attacks (billions of drawn copies), which would only hang the page. So would those
  // whose clip paths it writes as masks: unsanitised, a renderer combining their shapes can take
  // minutes, and none holds a script or a load.
  const expectations = JSON.parse(
    readFileSync(new URL("hostile-svg/expectations.json", BRAND_FIXTURES), "utf8"),
  ) as Record<string, { outcome: string; removed?: { reason: string }[] }>;
  const raw = corpus("hostile-svg")
    .filter(({ name }) => {
      const expected = expectations[name.replace("hostile-svg/", "")];
      return (
        expected?.outcome === "accept" &&
        !(expected.removed ?? []).some(({ reason }) => reason === "rewritten")
      );
    })
    .map(({ name, bytes }) => ({ name, svg: new TextDecoder().decode(bytes) }));

  base("catch a script and an external load in the unsanitised corpus", async ({ page }) => {
    const watch = await render(page, raw, undefined);
    expect(await canary(page)).toBeGreaterThan(0);
    expect(watch.requests.some((url) => new URL(url).hostname === "attacker.invalid")).toBe(true);
  });

  base(
    "show an image runs and loads nothing even from the unsanitised corpus, with no policy",
    async ({ page }) => {
      const images = raw.map(({ name, svg }) => ({
        name,
        dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      }));
      const watch = await render(page, images, undefined);
      expect(await canary(page)).toBe(0);
      expect(watch.dialogs).toEqual([]);
      expect(watch.requests.filter((url) => new URL(url).origin !== ORIGIN)).toEqual([]);
    },
  );

  base(
    "catch a policy violation in the unsanitised corpus under the strict policy",
    async ({ page }) => {
      await render(page, raw, LOGO_POLICY);
      expect((await report(page)).violations).not.toEqual([]);
    },
  );
});

// The costliest logos the sanitiser still accepts, one for each kind of work a renderer does: long
// edges, crowded on every row; arcs; hairline dashes, of two lengths and of 64; dashes along
// circles, an ellipse, a rounded rectangle, an arc, a cubic, a diagonal and a horizontal line, and
// along paths of horizontal and vertical lines (an L, a staircase, a serpentine, a square spiral, a
// line drawn back and forth, an open path round a square); thin strokes along full-size circles,
// ellipses and arcs, along concentric circles, along circles and arcs far larger than the image
// passing through it, and along a rosette of quadratics in one path; solid paint over and over; gradients at the stop limit, opaque and translucent; a fill under a
// very wide stroke; group opacity layers; masks inside masks; a clip path of crowded edges with the
// even-odd rule; a view box far wider than tall; dashes, round dots and round joins on a stroke as
// wide as the image; clip paths of near-coincident zigzags, which a renderer combining them took
// minutes over, each written as a mask, and of one such zigzag in every form a clip path of one
// shape is kept (alone, transformed, through a use, under the clip path's transform, even-odd, one
// inside another, each at 30,000 and at 100,000, and in the box of a unit square); clip paths of a
// clipped shape and of 43 shapes; a mask holding a clipped shape; and a shape scaled as far as a
// transform may go. Each is the largest of its family that is accepted (the next one up is refused,
// for the drawing cost or the overdraw), and must be drawn as an image and inline, rasterised in
// full at 600 CSS pixels and at 2000 with a device scale factor of 2, shown as an image 2000 CSS
// pixels square at that density (which Chromium rasterises in tiles), and drawn inline at 600, each
// within its budget (the budgets cover inline logos up to 600 CSS pixels only: see the brand
// README). On a loaded four-core machine the slowest took about 0.35 seconds at 600 and 1.8 at
// 2000, and on an idle one 3.5 shown as an image at 2000 (see the brand README), so the budgets
// leave room for a slow runner, yet a limit raised tenfold would blow through them.
const SIZE = 600;
const LARGE_SIZE = 2000;
const RENDER_BUDGET_MS = 15_000;
const RASTER_BUDGET_MS = 3_000;
const LARGE_RASTER_BUDGET_MS = 6_000;

function costlyLogo(body: string, root = 'viewBox="0 0 1000 1000"'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" ${root} width="${String(SIZE)}" height="${String(SIZE)}">${body}</svg>`;
}

function zigzag(segments: number, command: (index: number) => string): string {
  let data = "M0 0";
  for (let index = 0; index < segments; index += 1) data += command(index);
  return data;
}

const point = (index: number): string =>
  `${String((index * 37) % 1000)} ${String((index * 91) % 1000)}`;

/** `count` uses of `#p` in the root, after the definitions. */
const copies = (definitions: string) => (count: number) =>
  costlyLogo(`<defs>${definitions}</defs>${'<use href="#p"/>'.repeat(count)}`);

/** `count` stops of varied colour, translucent when asked. */
function stops(count: number, translucent: boolean): string {
  return Array.from({ length: count }, (_, index) => {
    const colour = ((index * 0x9e3779 + 0x203040) & 0xffffff).toString(16).padStart(6, "0");
    const opacity = translucent ? ` stop-opacity="${(0.1 + (index % 9) / 10).toFixed(1)}"` : "";
    return `<stop offset="${(index / (count - 1)).toFixed(3)}" stop-color="#${colour}"${opacity}/>`;
  }).join("");
}

/**
 * A zigzag of `segments` edges between two lines `width` apart at `base`, its rows `step` apart
 * (moved down by `shift`), as a path: each edge all but on top of the next, the geometry that made
 * a renderer combining the shapes of a clip path take minutes.
 */
function nearZigzag(segments: number, base: number, step: number, shift = 0, width = 100): string {
  let data = `M${String(base)} ${(base + shift).toFixed(6)}`;
  for (let index = 1; index < segments; index += 1) {
    data += `L${String(index % 2 === 1 ? base + width : base)} ${(base + shift + index * step).toFixed(6)}`;
  }
  return `<path d="${data}Z"/>`;
}

const SQUARE = '<rect width="1" height="1"/>';
/** Edges in a clip path of one shape: what the length of a path's data allows, and then some. */
const SHAPE_SEGMENTS = 6000;

/** `count` uses of a half-transparent square clipped to `clip(segments)`, in a view box at `base`. */
const clipCopies =
  (segments: number, clip: (segments: number) => string, base = 100000) =>
  (count: number) =>
    costlyLogo(
      `<defs><clipPath id="c">${clip(segments)}</clipPath><rect id="p" width="${String(2 * base)}" height="${String(2 * base)}" fill="#0f766e" fill-opacity="0.5" clip-path="url(#c)"/></defs>${'<use href="#p"/>'.repeat(count)}`,
      `viewBox="0 0 ${String(2 * base)} ${String(2 * base)}"`,
    );

/** Ways a clip path of one shape is written, each kept as a clip path, and the code past its size. */
const ONE_SHAPE_CLIPS: readonly (readonly [string, (base: number) => string, SvgLogoErrorCode])[] =
  [
    ["alone", (base) => clipOf(nearZigzag(SHAPE_SEGMENTS, base, 0.001)), "drawing-too-costly"],
    [
      "turned by a transform of its own",
      (base) =>
        clipOf(
          nearZigzag(SHAPE_SEGMENTS, base, 0.001).replace(
            "/>",
            ` transform="rotate(0.5 ${String(base)} ${String(base)})"/>`,
          ),
        ),
      "drawing-too-costly",
    ],
    [
      "drawn by a use",
      (base) =>
        nearZigzag(SHAPE_SEGMENTS, base, 0.001).replace("<path", '<path id="t"') +
        clipOf('<use href="#t" x="0.0005"/>'),
      "drawing-too-costly",
    ],
    [
      "turned by the clip path's transform",
      (base) =>
        clipOf(nearZigzag(SHAPE_SEGMENTS, base, 0.001)).replace(
          '<clipPath id="c">',
          `<clipPath id="c" transform="rotate(0.5 ${String(base)} ${String(base)})">`,
        ),
      "drawing-too-costly",
    ],
    [
      "by the even-odd rule",
      (base) =>
        clipOf(nearZigzag(SHAPE_SEGMENTS, base, 0.001).replace("/>", ' clip-rule="evenodd"/>')),
      "drawing-too-costly",
    ],
    [
      "inside another such clip path",
      (base) =>
        nearZigzag(SHAPE_SEGMENTS, base, 0.001, 0.0003).replace("<path", '<clipPath id="a"><path') +
        "</clipPath>" +
        clipOf(nearZigzag(SHAPE_SEGMENTS, base, 0.001), 'clip-path="url(#a)"'),
      "drawing-too-costly",
    ],
    [
      "drawn by a use of a shape clipped in turn, so drawn as a mask",
      (base) =>
        `<clipPath id="a">${nearZigzag(SHAPE_SEGMENTS, base, 0.001, 0.0003)}</clipPath>` +
        nearZigzag(SHAPE_SEGMENTS, base, 0.001).replace(
          "<path",
          '<path id="t" clip-path="url(#a)"',
        ) +
        clipOf('<use href="#t"/>'),
      "overdraw-too-large",
    ],
  ];

/** A clip path `c` of `shapes`, and a half-transparent square `#p` it clips, inside `wrapper`. */
function clipOf(shapes: string, wrapper = ""): string {
  return `<clipPath id="c">${shapes}</clipPath><g id="p" ${wrapper}><rect width="200000" height="200000" fill="#0f766e" fill-opacity="0.5" clip-path="url(#c)"/></g>`;
}

/** Path data of `steps` steps across the image, each a horizontal line and then a vertical one. */
function staircase(steps: number): string {
  let data = "M0 0";
  for (let step = 1; step <= steps; step += 1) {
    const at = String((step * 1000) / steps);
    data += `H${at}V${at}`;
  }
  return data;
}

/** Path data of `rows` horizontal lines across the image, joined end to end by vertical ones. */
function serpentine(rows: number): string {
  let data = "M0 0";
  for (let row = 0; row < rows; row += 1) {
    data += `${row % 2 === 0 ? "H1000" : "H0"}V${String(((row + 1) * 1000) / rows)}`;
  }
  return data;
}

/** Path data of `sides` horizontal and vertical lines winding out from the centre, 12 apart. */
function squareSpiral(sides: number): string {
  let data = "M500 500";
  for (let side = 0; side < sides; side += 1) {
    const reach = (side + 1) * 12;
    const command = ["H", "V", "H", "V"][side % 4] ?? "H";
    data += `${command}${String(side % 4 < 2 ? 500 + reach : 500 - reach)}`;
  }
  return data;
}

/** `count` points across the image, from 50 to 950. */
function spread(count: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    Number((50 + (index * 900) / Math.max(1, count - 1)).toFixed(2)),
  );
}

/**
 * Path data of a spirograph rosette: `count` quadratics winding 37 times round a ring 450 from the
 * centre, each bulging out to 600.
 */
function rosette(count: number): string {
  const at = (radius: number, step: number): string => {
    const angle = (step * 2 * Math.PI * 37) / count;
    return `${(500 + radius * Math.cos(angle)).toFixed(1)} ${(500 + radius * Math.sin(angle)).toFixed(1)}`;
  };
  let data = "M950 500";
  for (let step = 1; step <= count; step += 1) data += `Q${at(600, step - 0.5)} ${at(450, step)}`;
  return data;
}

const FULL = 'width="1000" height="1000"';
const STOPS = SVG_LOGO_LIMITS.gradientStops;

const FAMILIES: readonly (readonly [string, (count: number) => string, SvgLogoErrorCode])[] = [
  [
    "a path of long stroked lines",
    (count) =>
      costlyLogo(
        `<path d="${zigzag(count, (index) => `L${point(index)}`)}" fill="#0f766e" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`,
      ),
    "overdraw-too-large",
  ],
  [
    "a path of wide stroked arcs",
    (count) =>
      costlyLogo(
        `<path d="${zigzag(count, (index) => `A400 300 ${String(index % 90)} 1 ${String(index % 2)} ${point(index)}`)}" fill="none" stroke="#000" stroke-width="30"/>`,
      ),
    "overdraw-too-large",
  ],
  [
    "dashes a tenth of a unit long, round-capped",
    copies(
      '<path id="p" d="M0 0L1000 1000L0 1000L1000 0" fill="none" stroke="#000" stroke-width="0.1" stroke-linecap="round" stroke-dasharray="0.1"/>',
    ),
    "drawing-too-costly",
  ],
  // Dashes along anything but one horizontal or vertical line or a rectangle are worked out again
  // for every tile of a large image the shape's box touches, along a path of two such lines too;
  // along one line or a rectangle, culled to the tile.
  ...(["butt", "round", "square"] as const).flatMap((cap) =>
    (["3", "5"] as const).map(
      (width) =>
        [
          `dashed full-size circles ${width} wide, ${cap}-capped, by uses`,
          copies(
            `<circle id="p" cx="500" cy="500" r="450" fill="none" stroke="#000" stroke-width="${width}" stroke-linecap="${cap}" stroke-dasharray="8 4"/>`,
          ),
          "drawing-too-costly",
        ] as const,
    ),
  ),
  ...(
    [
      ["an ellipse", '<ellipse id="p" cx="500" cy="500" rx="450" ry="200"'],
      [
        "a rectangle with rounded corners",
        '<rect id="p" x="50" y="50" width="900" height="900" rx="100"',
      ],
      ["an arc", '<path id="p" d="M50 500A450 450 0 0 1 950 500"'],
      ["a cubic", '<path id="p" d="M50 500C50 251 251 50 500 50"'],
      ["a diagonal line", '<path id="p" d="M0 0L1000 1000"'],
      ["a horizontal line", '<path id="p" d="M0 500H1000"'],
      ["an L of a horizontal and a vertical line", '<path id="p" d="M0 0H1000V1000"'],
      ["a staircase of four steps", `<path id="p" d="${staircase(4)}"`],
      ["a serpentine of 20 rows", `<path id="p" d="${serpentine(20)}"`],
      ["a square spiral of 40 sides", `<path id="p" d="${squareSpiral(40)}"`],
      [
        "a horizontal line drawn back and forth ten times",
        `<path id="p" d="M0 500${"H1000H0".repeat(10)}"`,
      ],
      ["an open path round a square", '<path id="p" d="M50 50H950V950H50V50"'],
    ] as const
  ).map(
    ([shape, element]) =>
      [
        `dashes along ${shape}, round-capped`,
        copies(
          `${element} fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-dasharray="8 4"/>`,
        ),
        "drawing-too-costly",
      ] as const,
  ),
  ...(
    [
      ["of 64 lengths", Array.from({ length: 64 }, () => "1").join(" ")],
      ["of two lengths", "1 1"],
    ] as const
  ).map(
    ([lengths, dasharray]) =>
      [
        `hairline dashes ${lengths} along a zigzag`,
        copies(
          `<path id="p" d="M50 50${Array.from({ length: 10 }, (_, index) => `L${index % 2 === 0 ? "950" : "50"} ${String(50 + index * 90)}`).join("")}" fill="none" stroke="#000" stroke-width="0.1" stroke-dasharray="${dasharray}"/>`,
        ),
        "drawing-too-costly",
      ] as const,
  ),
  // A thin stroke along a curve is stroked again for every tile of a large image its box touches.
  ...(["2", "0.5"] as const).map(
    (width) =>
      [
        `thin full-size circles ${width} wide, by uses`,
        copies(
          `<circle id="p" cx="500" cy="500" r="450" fill="none" stroke="#000" stroke-width="${width}"/>`,
        ),
        "overdraw-too-large",
      ] as const,
  ),
  [
    "thin full-size ellipses, by uses",
    copies(
      '<ellipse id="p" cx="500" cy="500" rx="450" ry="300" fill="none" stroke="#000" stroke-width="0.5"/>',
    ),
    "overdraw-too-large",
  ],
  [
    "thin paths of 20 full-size semicircles, by uses",
    copies(
      `<path id="p" d="M50 500${Array.from({ length: 20 }, (_, index) => `A450 450 0 1 1 ${index % 2 === 0 ? "950" : "50"} 500`).join("")}" fill="none" stroke="#000" stroke-width="0.5"/>`,
    ),
    "overdraw-too-large",
  ],
  [
    "thin concentric circles",
    (count) =>
      costlyLogo(
        Array.from(
          { length: count },
          (_, index) =>
            `<circle cx="500" cy="500" r="${String(490 - (index % 480))}" fill="none" stroke="#000" stroke-width="0.5"/>`,
        ).join(""),
      ),
    "overdraw-too-large",
  ],
  // Chromium strokes a curve whole for every tile, however little of it the image shows.
  ...([1000, 100_000] as const).map(
    (radius) =>
      [
        `thin circles of radius ${radius.toLocaleString("en")} passing through the image`,
        (count: number) =>
          costlyLogo(
            spread(count)
              .map(
                (x) =>
                  `<circle cx="${String(x)}" cy="${String(500 - radius)}" r="${String(radius)}" fill="none" stroke="#000" stroke-width="0.5"/>`,
              )
              .join(""),
          ),
        "overdraw-too-large",
      ] as const,
  ),
  [
    "thin large arcs of radius 1,000 from points across the image",
    (count) =>
      costlyLogo(
        spread(count)
          .map(
            (x) =>
              `<path d="M${String(x)} 500A1000 1000 0 1 1 ${String(x + 1)} 500" fill="none" stroke="#000" stroke-width="0.5"/>`,
          )
          .join(""),
      ),
    "overdraw-too-large",
  ],
  [
    "a thin rosette of quadratics in 37 turns",
    (count) =>
      costlyLogo(`<path d="${rosette(count)}" fill="none" stroke="#000" stroke-width="0.8"/>`),
    "overdraw-too-large",
  ],
  ["full-size solid fills", copies(`<rect id="p" ${FULL} fill="#0f766e"/>`), "overdraw-too-large"],
  [
    `full-size linear gradients of ${String(STOPS)} stops`,
    copies(
      `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${stops(STOPS, false)}</linearGradient><rect id="p" ${FULL} fill="url(#g)"/>`,
    ),
    "overdraw-too-large",
  ],
  [
    `full-size radial gradients of ${String(STOPS)} translucent stops`,
    copies(
      `<radialGradient id="g">${stops(STOPS, true)}</radialGradient><rect id="p" ${FULL} fill="url(#g)"/>`,
    ),
    "overdraw-too-large",
  ],
  [
    "a gradient fill under a gradient stroke twice as wide as the image",
    copies(
      `<radialGradient id="g">${stops(STOPS, true)}</radialGradient><rect id="p" ${FULL} fill="url(#g)" stroke="url(#g)" stroke-width="2000"/>`,
    ),
    "overdraw-too-large",
  ],
  [
    "full-size group opacity layers",
    copies(
      `<g id="p" opacity="0.5"><rect ${FULL} fill="#0f766e"/><rect width="10" height="10"/></g>`,
    ),
    "overdraw-too-large",
  ],
  [
    `full-size masks nested ${String(SVG_LOGO_LIMITS.maskDepth)} deep`,
    (count) => {
      let body = "<defs>";
      for (let index = 0; index < SVG_LOGO_LIMITS.maskDepth; index += 1) {
        const inner = index === 0 ? "" : ` mask="url(#m${String(index - 1)})"`;
        body += `<mask id="m${String(index)}"><rect ${FULL} fill="#fff"${inner}/></mask>`;
      }
      body += `<rect id="p" ${FULL} mask="url(#m${String(SVG_LOGO_LIMITS.maskDepth - 1)})"/></defs>`;
      return costlyLogo(body + '<use href="#p"/>'.repeat(count));
    },
    "overdraw-too-large",
  ],
  [
    "a view box a thousand times wider than tall, of radial gradients, asked to stretch",
    (count) =>
      costlyLogo(
        `<defs><radialGradient id="g">${stops(STOPS, true)}</radialGradient><rect id="p" width="1000" height="1" fill="url(#g)"/><g id="q">${'<use href="#p"/>'.repeat(10)}</g></defs>${'<use href="#q"/>'.repeat(count)}`,
        'viewBox="0 0 1000 1" preserveAspectRatio="none"',
      ),
    "drawing-too-costly",
  ],
  ...(["butt", "round"] as const).map(
    (cap) =>
      [
        `${cap} dashes on a stroke as wide as the image`,
        (count: number) =>
          costlyLogo(
            `<path d="M0 500H1000" fill="none" stroke="#000" stroke-width="1000" stroke-linecap="${cap}" stroke-dasharray="${(500 / count).toFixed(6)}"/>`,
          ),
        "overdraw-too-large",
      ] as const,
  ),
  [
    "dashes on a stroke a tenth as wide as the image",
    (count) =>
      costlyLogo(
        `<path d="M0 500H1000" fill="none" stroke="#000" stroke-width="100" stroke-dasharray="${(500 / count).toFixed(6)}"/>`,
      ),
    "overdraw-too-large",
  ],
  [
    "dashes of four lengths on a stroke as wide as the image",
    (count) =>
      costlyLogo(
        `<path d="M0 500H1000" fill="none" stroke="#000" stroke-width="1000" stroke-dasharray="${Array(
          4,
        )
          .fill((250 / count).toFixed(6))
          .join(" ")}"/>`,
      ),
    "overdraw-too-large",
  ],
  [
    "short segments meeting in round joins as wide as the image",
    (count) =>
      costlyLogo(
        `<path d="${zigzag(count, (index) => (index % 2 === 0 ? "l1 0.5" : "l-1 0.5")).replace("M0 0", "M500 500")}" fill="none" stroke="#000" stroke-width="1000" stroke-linejoin="round"/>`,
      ),
    "overdraw-too-large",
  ],
  [
    "subpaths of no length, each a round dot as wide as the image",
    (count) =>
      costlyLogo(
        `<path d="${Array.from({ length: count }, (_, index) => `M${((index * 1000) / count).toFixed(3)} 500h0`).join("")}" fill="none" stroke="#000" stroke-width="1000" stroke-linecap="round"/>`,
      ),
    "overdraw-too-large",
  ],
  ...(
    [
      [
        "two near-coincident zigzags",
        30000,
        (n: number) => nearZigzag(n, 30000, 0.001) + nearZigzag(n, 30000, 0.001, 0.000333),
        "overdraw-too-large",
      ],
      [
        "a zigzag crossing itself, beside a square",
        100000,
        (n: number) =>
          nearZigzag(n, 100000, 0.003).replace('"/>', "") +
          nearZigzag(n, 100000, 0.003, 0.001).replace('<path d="', "") +
          SQUARE,
        "overdraw-too-large",
      ],
      [
        "five near-coincident zigzags",
        100000,
        (n: number) =>
          [0, 1, 2, 3, 4].map((k) => nearZigzag(n, 100000, 0.003, k * 0.0006)).join(""),
        "drawing-too-costly",
      ],
    ] as const
  ).map(
    ([shapes, base, clip, code]) =>
      [
        `a clip path of ${shapes}, drawn as a mask`,
        clipCopies(SHAPE_SEGMENTS / 2, clip, base),
        code,
      ] as const,
  ),
  ...ONE_SHAPE_CLIPS.flatMap(([form, clip, code]) =>
    [30000, 100000].map(
      (base) =>
        [
          `a clip path of one near-coincident zigzag at ${base.toLocaleString("en")}, ${form}`,
          (count: number) =>
            costlyLogo(
              `<defs>${clip(base)}</defs>${'<use href="#p"/>'.repeat(count)}`,
              `viewBox="0 0 ${String(2 * base)} ${String(2 * base)}"`,
            ),
          code,
        ] as const,
    ),
  ),
  [
    "a clip path of one near-coincident zigzag in the box of a unit square drawn at full size",
    copies(
      `<clipPath id="c" clipPathUnits="objectBoundingBox">${nearZigzag(9000, 0.5, 0.000001, 0, 0.1)}</clipPath><rect id="p" width="1" height="1" transform="scale(1000)" fill="#0f766e" fill-opacity="0.5" clip-path="url(#c)"/>`,
    ),
    "overdraw-too-large",
  ],
  [
    "a clip path of a shape clipped in turn, drawn as a mask",
    copies(
      `<clipPath id="c0"><circle cx="500" cy="500" r="499"/></clipPath><rect id="r" ${FULL} clip-path="url(#c0)"/><clipPath id="c1"><use href="#r"/></clipPath><rect id="p" ${FULL} fill="#0f766e" fill-opacity="0.5" clip-path="url(#c1)"/>`,
    ),
    "overdraw-too-large",
  ],
  [
    "a clip path of 43 shapes, drawn as a mask",
    copies(
      `<clipPath id="c">${Array.from({ length: 43 }, (_, index) => `<polygon points="${String(index * 23)},0 ${String(index * 23 + 10)},0 ${String(index * 23 + 5)},1000"/>`).join("")}</clipPath><rect id="p" ${FULL} fill="#0f766e" fill-opacity="0.5" clip-path="url(#c)"/>`,
    ),
    "overdraw-too-large",
  ],
  [
    "a mask holding a clipped shape",
    copies(
      `<clipPath id="c"><circle cx="500" cy="500" r="499"/></clipPath><mask id="m"><rect ${FULL} fill="#fff" clip-path="url(#c)"/></mask><rect id="p" ${FULL} fill="#0f766e" fill-opacity="0.5" mask="url(#m)"/>`,
    ),
    "overdraw-too-large",
  ],
  [
    "a shape scaled a million million times, under full-size radial gradients",
    (count) =>
      costlyLogo(
        `<defs><radialGradient id="g">${stops(STOPS, true)}</radialGradient><rect id="p" ${FULL} fill="url(#g)"/></defs><g transform="scale(999999) scale(999999)"><rect width="1" height="1"/></g>${'<use href="#p"/>'.repeat(count)}`,
      ),
    "overdraw-too-large",
  ],
  [
    "a clip path of 1,500 crowded edges, even-odd",
    copies(
      `<clipPath id="c"><path d="${zigzag(1500, (index) => `L${(index * 0.666).toFixed(3)} ${index % 2 === 0 ? "0" : "1000"}`)}Z" clip-rule="evenodd"/></clipPath><rect id="p" ${FULL} fill="#0f766e" clip-path="url(#c)"/>`,
    ),
    "overdraw-too-large",
  ],
];

/** The largest member of the family the sanitiser accepts; the next is refused with `code`. */
function costliest(family: (count: number) => string, code: SvgLogoErrorCode): Logo {
  const accepts = (count: number): boolean => sanitiseSvgLogo(family(count)).ok;
  if (!accepts(1)) throw new Error("the smallest member of the family is refused");
  let low = 1;
  let high = 2;
  while (accepts(high)) {
    low = high;
    high *= 2;
    if (high > 100_000) throw new Error("nothing in the family is refused");
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (accepts(middle)) low = middle;
    else high = middle;
  }
  const over = sanitiseSvgLogo(family(high));
  if (over.ok || over.errors[0]?.code !== code) {
    throw new Error(
      `one more is refused for ${over.ok ? "nothing" : String(over.errors[0]?.code)}`,
    );
  }
  const result = sanitiseSvgLogo(family(low));
  if (!result.ok) throw new Error("the costliest member was refused");
  return { name: `${String(low)} of them`, svg: result.svg, dataUrl: logoDataUrl(result.svg) };
}

/**
 * Draws a logo's data URL onto a canvas `size` CSS pixels square at the page's device scale
 * factor, and reads a pixel back: the whole raster, on the main thread, as the page pays for it.
 * Returns the milliseconds that took.
 */
async function rasterise(page: Page, logo: Logo, size: number): Promise<number> {
  await render(page, [], LOGO_POLICY);
  return page.evaluate(
    async ({ dataUrl, size }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const pixels = size * window.devicePixelRatio;
      const canvas = document.createElement("canvas");
      canvas.width = pixels;
      canvas.height = pixels;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (context === null) throw new Error("no 2D context");
      const started = performance.now();
      context.drawImage(image, 0, 0, pixels, pixels);
      context.getImageData(0, 0, 1, 1);
      return performance.now() - started;
    },
    { dataUrl: logo.dataUrl ?? "", size },
  );
}

/**
 * Shows a logo's data URL as an `<img>` `size` CSS pixels square in a page as large, at the page's
 * device scale factor, and returns the milliseconds until a screenshot shows it. An image this
 * large is rasterised in tiles, each tile replaying every path whose box it touches, so this is
 * timed apart from the single raster a canvas makes. The page must already be that size: resizing
 * it here left a screenshot taken straight after racing the resize, which a loaded runner lost
 * ("Unable to capture screenshot").
 */
async function showImage(page: Page, logo: Logo, size: number): Promise<number> {
  expect(page.viewportSize(), "the page is as large as the image").toEqual({
    width: size,
    height: size,
  });
  await page.setContent(
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{margin:0}img{display:block}</style>`,
  );
  const loaded = await page.evaluate(async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    Object.assign(window, { pendingLogo: image });
    return image.naturalWidth;
  }, logo.dataUrl ?? "");
  // An image that failed to load would draw nothing, and so be timed as fast.
  expect(loaded, `${logo.name} loads as an image`).toBeGreaterThan(0);
  // Waits for a frame of the empty page, so the drawing alone is timed; a corner of it is enough,
  // and spares a loaded runner encoding a page of 4000 pixels square that shows nothing.
  await page.screenshot({ clip: { x: 0, y: 0, width: 1, height: 1 } });
  const started = Date.now();
  await page.evaluate((size) => {
    const image = (window as unknown as { pendingLogo: HTMLImageElement }).pendingLogo;
    image.style.width = `${String(size)}px`;
    image.style.height = `${String(size)}px`;
    document.body.append(image);
  }, size);
  await page.screenshot({ timeout: RENDER_BUDGET_MS });
  return Date.now() - started;
}

/**
 * Puts a logo inline in a box `SIZE` CSS pixels square, at the page's device scale factor, and
 * returns the milliseconds until a screenshot shows it: inline, a large logo is drawn tile by tile,
 * each tile walking every path it touches again, so this is timed apart from the image.
 */
async function drawInline(page: Page, logo: Logo): Promise<number> {
  await page.setViewportSize({ width: SIZE + 50, height: SIZE + 50 });
  await page.setContent(
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:0}div{width:${String(SIZE)}px;height:${String(SIZE)}px}svg{width:100%;height:100%}</style><div></div>`,
  );
  await page.screenshot();
  const started = Date.now();
  await page.evaluate((svg) => {
    const box = document.querySelector("div");
    if (box === null) throw new Error("no box");
    box.innerHTML = svg;
  }, logo.svg ?? "");
  await page.screenshot({ timeout: RENDER_BUDGET_MS });
  return Date.now() - started;
}

// A kept logo is always drawn to fit: the sanitiser drops a preserveAspectRatio that would stretch
// or crop it. The overdraw counts on that, so a page must not stretch it either; sizing an image or
// an inline logo with CSS does not, while object-fit: cover, or drawing it on a canvas of another
// shape, would.
test.describe("a logo far wider than tall", () => {
  const bar = sanitiseSvgLogo(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1" width="1000" height="1" preserveAspectRatio="none"><rect width="1000" height="1"/></svg>',
  );
  if (!bar.ok) throw new Error("the bar was refused");
  const url = logoDataUrl(bar.svg);
  const inline = bar.svg.replace('width="1000" height="1"', 'style="width:100%;height:100%"');

  async function darkPixels(page: Page, html: string): Promise<number> {
    await page.setViewportSize({ width: 700, height: 700 });
    await page.setContent(`<!doctype html><body style="margin:0;background:#fff">${html}</body>`);
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 600, height: 600 } });
    return page.evaluate(async (png) => {
      const image = new Image();
      image.src = `data:image/png;base64,${png}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 600;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no 2D context");
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, 600, 600).data;
      let dark = 0;
      for (let index = 0; index < data.length; index += 4)
        if ((data[index] ?? 255) < 250) dark += 1;
      return dark;
    }, shot.toString("base64"));
  }

  test("is drawn to fit in a square image or inline logo sized by CSS, at most a thin bar", async ({
    page,
  }) => {
    for (const html of [
      `<img src="${url}" style="width:600px;height:600px">`,
      `<img src="${url}" style="width:600px;height:600px;object-fit:fill">`,
      `<img src="${url}" style="width:600px;height:600px;object-fit:contain">`,
      `<div style="width:600px;height:600px">${inline}</div>`,
    ]) {
      // A bar 600 pixels long and under a pixel thick touches at most two rows.
      expect(await darkPixels(page, html), html.slice(0, 60)).toBeLessThanOrEqual(1200);
    }
  });

  test("fills the image only when the page itself crops it", async ({ page }) => {
    expect(
      await darkPixels(
        page,
        `<img src="${url}" style="width:600px;height:600px;object-fit:cover">`,
      ),
    ).toBe(360_000);
  });
});

test.describe("the costliest logos the sanitiser accepts", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [label, family, code] of FAMILIES) {
    test(`draws ${label}, as an image and inline, within the budget`, async ({ page }) => {
      const logo = costliest(family, code);
      const started = Date.now();
      await render(page, [logo], LOGO_POLICY);
      // A screenshot waits for the frame that paints both, so the drawing itself is timed.
      await page.screenshot({ timeout: RENDER_BUDGET_MS });
      expect(Date.now() - started, logo.name).toBeLessThan(RENDER_BUDGET_MS);
      expect(await report(page)).toEqual({ violations: [], broken: [] });
    });

    test(`rasterises ${label} at ${String(SIZE)} pixels within the budget`, async ({ page }) => {
      const logo = costliest(family, code);
      expect(await rasterise(page, logo, SIZE), logo.name).toBeLessThan(RASTER_BUDGET_MS);
    });

    test(`draws ${label} inline at ${String(SIZE)} pixels within the budget`, async ({ page }) => {
      const logo = costliest(family, code);
      expect(await drawInline(page, logo), logo.name).toBeLessThan(RASTER_BUDGET_MS);
    });
  }
});

test.describe(`the costliest logos the sanitiser accepts, at ${String(LARGE_SIZE)} pixels and twice the density`, () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ deviceScaleFactor: 2, viewport: { width: LARGE_SIZE, height: LARGE_SIZE } });

  for (const [label, family, code] of FAMILIES) {
    test(`rasterises ${label} within the budget`, async ({ page }) => {
      const logo = costliest(family, code);
      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
      expect(await rasterise(page, logo, LARGE_SIZE), logo.name).toBeLessThan(
        LARGE_RASTER_BUDGET_MS,
      );
    });

    test(`shows ${label} as an image within the budget`, async ({ page }) => {
      const logo = costliest(family, code);
      expect(await showImage(page, logo, LARGE_SIZE), logo.name).toBeLessThan(
        LARGE_RASTER_BUDGET_MS,
      );
    });
  }
});
