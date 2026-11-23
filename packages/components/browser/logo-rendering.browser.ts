import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { logoDataUrl, parseBrandKit, sanitiseSvgLogo } from "@identgineer/brand";
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
