import { readFileSync } from "node:fs";
import {
  emitBrandThemeCss,
  emitBrandThemeTokens,
  generateBrandTheme,
  parseBrandKit,
  sanitiseSvgLogo,
  type BrandKit,
  type BrandTheme,
} from "@identgineer/brand";
import type { Page } from "@playwright/test";
import { CONTENT_SECURITY_POLICY, LOGO_CONTENT_SECURITY_POLICY } from "./content-security-policy";
import { expect } from "./fixtures";
import { BROWSER_PORT } from "./port";

export const BRAND_PAGE = "/fixtures/brand.html";
/** The export element's page: it draws no image, so it is served under the strict policy and no looser. */
export const EXPORT_PAGE = "/fixtures/brand-export.html";
/** The editor's page: it draws the logos it is given and uploaded, so it is served with the logo policy. */
export const EDITOR_PAGE = "/fixtures/brand-editor.html";
/** The brand elements the fixtures hold, each of which must be hydrated before a test reads it. */
export const BRAND_TAGS = [
  "idg-brand-logo",
  "idg-brand-swatches",
  "idg-brand-guidelines",
  "idg-brand-export",
  "idg-brand-editor",
] as const;
const BRAND_DATA = "/fixtures/brand-data.json";
const ORIGIN = `http://127.0.0.1:${String(BROWSER_PORT)}`;
const FIXTURES = new URL("../../brand/src/__fixtures__/", import.meta.url);

/** Text a hostile or careless owner could store as a logo: none of it is sanitiser output. */
export const HOSTILE_LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="window.__pwned = 1"><script>window.__pwned = 1</script><foreignObject><iframe src="https://example.com/frame"></iframe></foreignObject><image href="https://example.com/track.png"/></svg>';

/** A logo the sanitiser returns for a root with these attributes: a filled square inside. */
export function sanitisedLogo(attributes: string): string {
  const result = sanitiseSvgLogo(
    `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="1" height="1"/></svg>`,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.svg;
}

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

export const HARBOUR_KIT: BrandKit = HARBOUR;
export const HARBOUR_THEME: BrandTheme = generateBrandTheme(HARBOUR);
/** A kit with no logo and no mark, so the guide shows what stands in for them. */
export const ACME_KIT: BrandKit = kitOf(
  JSON.parse(readFileSync(new URL("acme.kit.json", FIXTURES), "utf8")),
);
export const ACME_THEME: BrandTheme = generateBrandTheme(ACME_KIT);
/** What the brand package emits for the harbour theme: the export must show exactly this. */
export const HARBOUR_CSS: string = emitBrandThemeCss(HARBOUR_THEME);
export const HARBOUR_TOKENS: string = emitBrandThemeTokens(HARBOUR_THEME);

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

/**
 * Markup that would run or load something if any component put it in the page as markup: an image
 * with a handler, a script and a style that fetches. Every place it is given must show it as text.
 */
export const CANARY =
  '<img src=x onerror="window.__pwned = 1"><script>window.__pwned = 1</script><style>@import url(https://example.com/canary.css)</style>';

/** A kit in which every field is something a hostile writer chose. */
const HOSTILE_KIT = {
  id: "hostile",
  name: `Hostile ${CANARY}`,
  tagline: `Tagline ${CANARY}`,
  logo: HOSTILE_LOGO,
  mark: HOSTILE_LOGO,
  colors: { primary: [1, 2, 3000], secondary: "red", neutralTint: [27, 42, 74] },
  typography: 'x"; background: url(https://example.com/font.woff)',
  corners: "round; background: url(https://example.com/corners.png)",
  tone: "vivid; background: url(https://example.com/tone.png)",
};

/** A theme in which the colours, gradient, radii, notes and adjustments are all hostile or malformed. */
const HOSTILE_GUIDE_THEME = {
  document: {
    light: {
      color: {
        ...HARBOUR_THEME.document.light.color,
        bg: { $value: "red; background: url(https://example.com/bg.png)" },
      },
      gradient: {
        brand: {
          $value: [
            { color: "#f4c430; background: url(https://example.com/g.png)", position: 0 },
            { color: "#000000", position: 1 },
          ],
        },
      },
    },
    dark: {
      color: HARBOUR_THEME.document.dark.color,
      gradient: HARBOUR_THEME.document.dark.gradient,
    },
  },
  radius: {
    sm: "1rem; background: url(https://example.com/radius.png)",
    md: "calc(100vw)",
    lg: "1e9px",
    pill: "9999px",
  },
  notes: [
    {
      scheme: "light",
      kind: "status-near-accent",
      token: `color.x${CANARY}`,
      against: "color.accent",
      distance: 0.05,
    },
    {
      scheme: "dark",
      kind: "accent-blends-with-page",
      token: "color.accent",
      against: "color.bg",
      contrast: Number.NaN,
    },
    {
      scheme: "dark",
      kind: "status-near-accent",
      token: "color.warning",
      against: "color.accent",
      distance: 0.04,
    },
  ],
  adjustments: [
    {
      scheme: "light",
      token: "color.link",
      origin: "primary",
      requested: "#f4c430",
      used: `#7e6200${CANARY}`,
      against: "color.accent-subtle",
      minimum: 4.5,
      contrastBefore: 1.28,
      contrastAfter: 4.5039,
    },
    {
      scheme: "light",
      token: "color.link",
      origin: "primary",
      requested: "#f4c430",
      used: "#7e6200",
      against: "color.accent-subtle",
      minimum: 4.5,
      contrastBefore: 1.28,
      contrastAfter: 4.5039,
    },
  ],
};

/** The texts and ids the export is given by hand, which a page may take from anywhere. */
const HOSTILE_EXPORT = {
  css: `${CANARY}\n</pre></code>\n[data-theme="x"] { color: red }`,
  tokens: `{"$description": "${CANARY}"}`,
  themeId: `"><img src=x onerror="window.__pwned = 1">`,
  name: `../../etc/passwd${CANARY}`,
};

const DATA = {
  harbour: { logo: HARBOUR_LOGO, mark: HARBOUR_MARK },
  hostile: { logo: HOSTILE_LOGO },
  themes: {
    harbour: HARBOUR_THEME,
    acme: ACME_THEME,
    pale: generateBrandTheme(PALE),
    hostile: HOSTILE_THEME,
    "hostile-guide": HOSTILE_GUIDE_THEME,
  },
  kits: { harbour: HARBOUR_KIT, acme: ACME_KIT, hostile: HOSTILE_KIT },
  alteredTheme: {
    ...HARBOUR_THEME,
    document: { ...HARBOUR_THEME.document, $description: "changed after it was generated" },
  },
  exports: {
    harbour: {
      css: HARBOUR_CSS,
      tokens: HARBOUR_TOKENS,
      themeId: HARBOUR_KIT.id,
      name: HARBOUR_KIT.name,
    },
    hostile: HOSTILE_EXPORT,
  },
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
  /** The fixture to open: the brand page by default. */
  readonly page?: typeof BRAND_PAGE | typeof EXPORT_PAGE | typeof EDITOR_PAGE;
}

/** Opens the export fixture under the strict policy, with nothing allowed beyond it. */
export function openBrandExport(page: Page): Promise<Watch> {
  return openBrand(page, { page: EXPORT_PAGE, policy: "strict" });
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
  const target = options.page ?? BRAND_PAGE;
  await page.route(`**${target}`, async (route) => {
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
  await page.goto(target);
  await expect(page.locator("html[data-brand-ready]")).toHaveCount(1);
  await expect(
    page.locator(BRAND_TAGS.map((tag) => `${tag}:not(.hydrated)`).join(", ")),
  ).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  return {
    requests,
    violations: () =>
      page.evaluate(() => (window as unknown as { __violations: string[] }).__violations),
  };
}
