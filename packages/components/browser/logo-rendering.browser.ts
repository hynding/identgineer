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
  readonly svg: string;
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
// passing tests above would prove nothing.
base.describe("the checks themselves", () => {
  // Only the files the sanitiser accepts (after removing their payload): those it refuses include
  // the resource attacks (billions of drawn copies), which would only hang the page.
  const expectations = JSON.parse(
    readFileSync(new URL("hostile-svg/expectations.json", BRAND_FIXTURES), "utf8"),
  ) as Record<string, string>;
  const raw = corpus("hostile-svg")
    .filter(({ name }) => expectations[name.replace("hostile-svg/", "")] === "accept")
    .map(({ name, bytes }) => ({ name, svg: new TextDecoder().decode(bytes) }));

  base("catch a script and an external load in the unsanitised corpus", async ({ page }) => {
    const watch = await render(page, raw, undefined);
    expect(await canary(page)).toBeGreaterThan(0);
    expect(watch.requests.some((url) => new URL(url).hostname === "attacker.invalid")).toBe(true);
  });

  base(
    "catch a policy violation in the unsanitised corpus under the strict policy",
    async ({ page }) => {
      await render(page, raw, LOGO_POLICY);
      expect((await report(page)).violations).not.toEqual([]);
    },
  );
});

// The costliest logos the sanitiser still accepts, one for each kind of work a renderer does: long
// paths, curves, copies through use, masks inside masks, and dashes. Each is the largest of its
// family that is accepted (the next one up is refused for its cost), and must be drawn, as an image
// and inline, well within the budget. The 120 KB path the review found drawn a thousand times
// took over 40 seconds to the next frame.
const SIZE = 600;
const RENDER_BUDGET_MS = 15_000;

function costlyLogo(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="${String(SIZE)}" height="${String(SIZE)}">${body}</svg>`;
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

const FAMILIES: readonly (readonly [string, (count: number) => string, SvgLogoErrorCode])[] = [
  [
    "a stroked path of 15,000 lines",
    copies(
      `<path id="p" d="${zigzag(15_000, (index) => `L${point(index)}`)}" fill="#0f766e" stroke="#000" stroke-width="3" stroke-linejoin="round"/>`,
    ),
    "drawing-too-costly",
  ],
  [
    "a stroked path of 4,000 arcs",
    copies(
      `<path id="p" d="${zigzag(4_000, (index) => `A400 300 ${String(index % 90)} 1 ${String(index % 2)} ${point(index)}`)}" fill="none" stroke="#000" stroke-width="30"/>`,
    ),
    "drawing-too-costly",
  ],
  [
    "a hundred gradient circles in each of many copies",
    (count) =>
      costlyLogo(
        '<defs><radialGradient id="r"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></radialGradient>' +
          '<circle id="c" cx="500" cy="500" r="500" fill="url(#r)" stroke="#000" stroke-width="20"/>' +
          `<g id="g1">${'<use href="#c"/>'.repeat(10)}</g><g id="p">${'<use href="#g1"/>'.repeat(10)}</g></defs>` +
          '<use href="#p"/>'.repeat(count),
      ),
    "drawing-too-costly",
  ],
  [
    `masks nested ${String(SVG_LOGO_LIMITS.maskDepth)} deep`,
    (count) => {
      let body = "<defs>";
      for (let index = 0; index < SVG_LOGO_LIMITS.maskDepth; index += 1) {
        const inner = index === 0 ? "" : ` mask="url(#m${String(index - 1)})"`;
        body += `<mask id="m${String(index)}"><rect width="1000" height="1000" fill="#fff"${inner}/></mask>`;
      }
      body += `<rect id="p" width="1000" height="1000" mask="url(#m${String(SVG_LOGO_LIMITS.maskDepth - 1)})"/></defs>`;
      return costlyLogo(body + '<use href="#p"/>'.repeat(count));
    },
    "too-many-masks",
  ],
  [
    "dashes a tenth of a unit long, round-capped",
    copies(
      '<path id="p" d="M0 0L1000 1000L0 1000L1000 0" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1"/>',
    ),
    "drawing-too-costly",
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
  return { name: `${String(low)} copies`, svg: result.svg, dataUrl: logoDataUrl(result.svg) };
}

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
  }
});
