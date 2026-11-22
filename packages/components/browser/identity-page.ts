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

/**
 * The element focus is on, through every shadow root, as the chain of hosts that leads to it:
 * `["idg-sign-in#sign-in", "idg-input[name=password]", "input"]`.
 */
export function focusPath(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const describe = (element: Element) => {
      const name = element.getAttribute("name");
      if (element.id) return `${element.localName}#${element.id}`;
      return name === null ? element.localName : `${element.localName}[name=${name}]`;
    };
    const chain: string[] = [];
    let element = document.activeElement === document.body ? null : document.activeElement;
    while (element) {
      chain.push(describe(element));
      element = element.shadowRoot?.activeElement ?? null;
    }
    return chain;
  });
}

/**
 * The composed tree under `selector`, shadow roots included, as markup of tags, attributes and
 * text: what a comparison of two renders, or a search for a secret, needs to see.
 */
export function composedMarkup(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((host) => {
    const write = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (!(node instanceof Element)) return "";
      const attributes = [...node.attributes]
        .map((attribute) => ` ${attribute.name}="${attribute.value}"`)
        .join("");
      const shadow = node.shadowRoot
        ? `<#shadow>${[...node.shadowRoot.childNodes].map(write).join("")}</#shadow>`
        : "";
      const children = [...node.childNodes].map(write).join("");
      return `<${node.localName}${attributes}>${shadow}${children}</${node.localName}>`;
    };
    return write(host);
  });
}
