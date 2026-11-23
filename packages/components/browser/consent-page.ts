import type { Page, Request } from "@playwright/test";
import { expect } from "./fixtures";

export const CONSENT_PAGE = "/fixtures/consent.html";
const TAGS = ["idg-consent-banner", "idg-consent-preferences"];

export interface ConsentPage {
  /** Every request the page made to the collector, in order. */
  readonly collected: Request[];
}

export interface OpenOptions {
  /** Navigator signals set before any page script runs, as a browser with the setting would. */
  readonly gpc?: boolean;
  readonly dnt?: boolean;
  /** Query string for the fixture: `?granted`, `?denied`, `?announce`, `?fake-collector`. */
  readonly query?: string;
}

/**
 * Opens the consent fixture: a real tracker on the page, posting to /collect, which the test
 * answers itself, so every request the tracker makes is seen at the network level.
 */
export async function openConsent(page: Page, options: OpenOptions = {}): Promise<ConsentPage> {
  const collected: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/collect") collected.push(request);
  });
  await page.route("**/collect", (route) => route.fulfill({ status: 202, body: "" }));
  await page.addInitScript(
    ({ gpc, dnt }) => {
      if (gpc) Object.defineProperty(navigator, "globalPrivacyControl", { value: true });
      if (dnt) Object.defineProperty(navigator, "doNotTrack", { value: "1" });
    },
    { gpc: options.gpc === true, dnt: options.dnt === true },
  );
  await page.goto(`${CONSENT_PAGE}${options.query ?? ""}`);
  await expect(page.locator("html[data-consent-ready]")).toHaveCount(1);
  await expect(page.locator(TAGS.map((tag) => `${tag}:not(.hydrated)`).join(", "))).toHaveCount(0);
  await expectRendered(page, options);
  return { collected };
}

export interface ConsentSnapshot {
  state: string;
  reason?: string;
  decidedAt: number | null;
}

/**
 * Waits until the banner has drawn what the state calls for, so a test never starts from a page
 * that is about to change: the question while it is asked, the one-line note under a signal when
 * `?announce` is set, and otherwise a frame in which nothing is drawn. The controls they draw
 * (buttons, switches, alerts, the dialog) are lazy components of their own, so they must have
 * hydrated too: a press or a Tab before that reaches an element that is not yet a control.
 */
async function expectRendered(page: Page, options: OpenOptions): Promise<void> {
  const state = await page.evaluate<{ state: string; reason?: string }>(
    `window.consentFixture.tracker.consent.get()`,
  );
  const banner = page.locator("#banner");
  if (state.reason === undefined && state.state === "unknown") {
    await expect(banner.locator('[part="banner"]')).toBeVisible();
  } else if (state.reason !== undefined && (options.query ?? "").includes("announce")) {
    await expect(banner.locator('[part="signal-note"]')).toBeVisible();
  } else {
    await expect(banner.locator('[part="banner"], [part="signal-note"]')).toHaveCount(0);
  }
  await expect(
    page.locator(
      "idg-button:not(.hydrated), idg-switch:not(.hydrated), idg-alert:not(.hydrated), idg-dialog:not(.hydrated)",
    ),
  ).toHaveCount(0);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

interface Fixture {
  tracker: {
    consent: { get: () => ConsentSnapshot; reset: () => boolean };
    track: (name: string) => void;
    page: () => void;
    flush: () => Promise<void>;
  };
  events: { type: string; detail: unknown }[];
}

type Handle = (fixture: Fixture) => unknown;

/** Runs `script` in the page with the fixture's tracker and recorded events. */
export function withFixture<T = unknown>(page: Page, script: Handle): Promise<T> {
  return page.evaluate<T>(`(${script.toString()})(window.consentFixture)`);
}

/** What the tracker would do for a page that tracks: an event and a page view, then a flush. */
export async function trackAndFlush(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const { tracker } = window.consentFixture;
    tracker.track("clicked");
    tracker.page();
    await tracker.flush();
  })()`);
}

export function consentState(page: Page): Promise<ConsentSnapshot> {
  return withFixture(page, (fixture) => fixture.tracker.consent.get());
}

export function recordedEvents(page: Page): Promise<{ type: string; detail: unknown }[]> {
  return withFixture(page, (fixture) => fixture.events);
}

export const banner = (page: Page) => page.locator("#banner");
export const bannerRegion = (page: Page) => banner(page).locator('[part="banner"]');
export const bannerButton = (page: Page, name: "decline" | "accept" | "choose") =>
  banner(page).locator(`idg-button.${name} button`);
export const bannerStatus = (page: Page) => banner(page).locator('[part="status"]');

export const inlinePanel = (page: Page) => page.locator("#prefs");
export const modalPanel = (page: Page) => page.locator("#prefs-dialog");
export const switchIn = (host: ReturnType<typeof inlinePanel>, name: "analytics" | "necessary") =>
  host.locator(`idg-switch.${name} input`);

/**
 * The element focus is on, through every shadow root, as its accessible name where it has one
 * (a button's text, a link's text) and its tag otherwise.
 */
export function activeName(page: Page): Promise<string> {
  return page.evaluate(() => {
    let element: Element | null = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    if (!element || element === document.body) return "body";
    // A button inside idg-button has its words in the host's light DOM, so look outward through
    // the shadow roots for the first words there are.
    for (let current: Element | null = element; current;) {
      const label = (current.getAttribute("aria-label") ?? current.textContent)
        .replace(/\s+/g, " ")
        .trim();
      if (label !== "") return label;
      const root: Node = current.getRootNode();
      current = root instanceof ShadowRoot ? root.host : null;
    }
    return element.localName;
  });
}
