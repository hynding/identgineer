import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export const IDENTITY_PAGE = "/fixtures/identity.html";
export const PASSWORD = "correct horse battery staple";

const TAGS = [
  "idg-sign-in",
  "idg-register",
  "idg-password-reset",
  "idg-session-guard",
  "idg-profile",
  "idg-user-menu",
];

/** Opens the identity fixture, `query` added to its address, once its client is wired. */
export async function openIdentity(page: Page, query = ""): Promise<void> {
  await page.goto(`${IDENTITY_PAGE}${query}`);
  await expect(page.locator("html[data-identity-ready]")).toHaveCount(1);
  await expect(page.locator(TAGS.map((tag) => `${tag}:not(.hydrated)`).join(", "))).toHaveCount(0);
}

/** The native input of the idg-input named `name` inside the component `host` selects. */
export function inputOf(page: Page, host: string, name: string) {
  return page.locator(host).locator(`idg-input[name="${name}"] input`);
}

/** Signs in through the page's idg-sign-in, as a user would. */
export async function signInThroughForm(page: Page): Promise<void> {
  await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
  await inputOf(page, "#sign-in", "password").fill(PASSWORD);
  await inputOf(page, "#sign-in", "password").press("Enter");
  await expect(page.locator("#menu").locator('[part="trigger"]')).toBeVisible();
}

/** The events the fixture recorded from the identity components, in order. */
export function recordedEvents(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { identityFixture: { events: { type: string; detail: unknown }[] } })
        .identityFixture.events,
  );
}
