import { readFileSync } from "node:fs";
import {
  generateBrandTheme,
  parseBrandKit,
  type BrandKit,
  type BrandTheme,
} from "@identgineer/brand";
import type { Page } from "@playwright/test";
import { CONTENT_SECURITY_POLICY, LOGO_CONTENT_SECURITY_POLICY } from "./content-security-policy";
import { expect } from "./fixtures";
import { BROWSER_PORT } from "./port";

export const BRAND_PAGE = "/fixtures/brand.html";
const BRAND_DATA = "/fixtures/brand-data.json";
const ORIGIN = `http://127.0.0.1:${String(BROWSER_PORT)}`;
const FIXTURES = new URL("../../brand/src/__fixtures__/", import.meta.url);

/** Text a hostile or careless owner could store as a logo: none of it is sanitiser output. */
export const HOSTILE_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="window.__pwned = 1"><script>window.__pwned = 1</script><foreignObject><iframe src="https://example.com/frame"></iframe></foreignObject><image href="https://example.com/track.png"/></svg>';

function kitOf(fields: unknown): BrandKit {
  const result = parseBrandKit(fields);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.kit;
}

const HARBOUR = kitOf(
  JSON.parse(readFileSync(new URL("harbour-lights.kit.json", FIXTURES), "utf8")),
);
// A kit whose light colours are all but the page's own, so a chip is as light as what it sits on.
const PALE = kitOf({
  id: "pale-paper",
  name: "Pale Paper",
  colors: { primary: "#ffffff", neutralTint: "#fdfdfd" },
  typography: "book",
  corners: "soft",
  tone: "calm",
});

export const HARBOUR_THEME: BrandTheme = generateBrandTheme(HARBOUR);

if (HARBOUR.logo === undefined || HARBOUR.mark === undefined) {
  throw new Error("the fixture kit has no logo and mark");
}
export const HARBOUR_LOGO: string = HARBOUR.logo;
export const HARBOUR_MARK: string = HARBOUR.mark;

/** A theme whose colours are text a hostile writer chose: the swatches must leave them out. */
const HOSTILE_THEME = {
  light: {
    color: {
      ...HARBOUR_THEME.document.light.color,
      text: { $value: "red; background: url(https://example.com/colour.png)" },
      bg: { $value: '#ffffff" onerror="window.__pwned = 1' },
    },
  },
  dark: HARBOUR_THEME.document.dark,
};

const DATA = {
  harbour: { logo: HARBOUR_LOGO, mark: HARBOUR_MARK },
  hostile: { logo: HOSTILE_LOGO },
  themes: { harbour: HARBOUR_THEME, pale: generateBrandTheme(PALE), hostile: HOSTILE_THEME },
};

export interface Watch {
  /** Every request the page made, data URLs left out (they fetch nothing). */
  readonly requests: string[];
  /** The `securitypolicyviolation` events the page fired. */
  violations: () => Promise<string[]>;
}

export interface OpenOptions {
  /** `strict` is the policy every browser test runs under; `logo` also allows `img-src data:`. */
  readonly policy?: "strict" | "logo";
}

/**
 * Opens the brand fixture, serving it with the policy asked for (`logo` by default: the policy
 * the brand package's README tells a page to use) and answering its data. Requests to any other
 * origin are recorded and then refused, so nothing leaves the machine.
 */
export async function openBrand(page: Page, options: OpenOptions = {}): Promise<Watch> {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("data:")) requests.push(request.url());
  });
  await page.addInitScript(() => {
    const record: string[] = [];
    (window as unknown as { __violations: string[] }).__violations = record;
    document.addEventListener("securitypolicyviolation", (event) => {
      record.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  await page.route(
    (url) => url.origin !== ORIGIN,
    (route) => route.abort(),
  );
  await page.route(`**${BRAND_PAGE}`, async (route) => {
    const response = await route.fetch();
    const policy =
      options.policy === "strict" ? CONTENT_SECURITY_POLICY : LOGO_CONTENT_SECURITY_POLICY;
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": policy },
    });
  });
  await page.route(`**${BRAND_DATA}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(DATA) }),
  );
  await page.goto(BRAND_PAGE);
  await expect(page.locator("html[data-brand-ready]")).toHaveCount(1);
  await expect(
    page.locator("idg-brand-logo:not(.hydrated), idg-brand-swatches:not(.hydrated)"),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  return {
    requests,
    violations: () =>
      page.evaluate(() => (window as unknown as { __violations: string[] }).__violations),
  };
}
