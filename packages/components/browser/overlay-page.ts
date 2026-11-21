import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export const OVERLAYS_PAGE = "/fixtures/overlays.html";

const TAGS = ["idg-dialog", "idg-button", "idg-input", "idg-field"];

/** Opens the overlays fixture and waits until every component on it has hydrated. */
export async function openOverlays(page: Page): Promise<void> {
  await page.goto(OVERLAYS_PAGE);
  await expect(page.locator(TAGS.map((tag) => `${tag}:not(.hydrated)`).join(", "))).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

/**
 * The id of the element that really has focus: the innermost element with an id on the way out
 * from the focused element, so a control inside a host is told apart from the host.
 */
export function focusedId(page: Page): Promise<string> {
  return page.evaluate(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    for (let node: Node | null = active; node;) {
      if (node instanceof Element && node.id !== "") return node.id;
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
    }
    return document.activeElement?.localName ?? "";
  });
}

/** Whether focus is inside the given host, across shadow roots. */
export function focusIsWithin(page: Page, hostId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const host = document.getElementById(id);
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    for (let node: Node | null = active; node;) {
      if (node === host) return true;
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode;
    }
    return false;
  }, hostId);
}

/** Records the overlay events a host fires, readable with `events()`. */
export async function recordEvents(page: Page, hostId: string, names: string[]): Promise<void> {
  await page.evaluate(
    ([id, eventNames]) => {
      const host = document.getElementById(id);
      const log: { type: string; detail: unknown }[] = [];
      (window as unknown as Record<string, unknown>)[`events:${id}`] = log;
      for (const name of eventNames) {
        host?.addEventListener(name, (event) => {
          log.push({ type: event.type, detail: (event as CustomEvent).detail });
        });
      }
    },
    [hostId, names] as const,
  );
}

export function events(page: Page, hostId: string): Promise<{ type: string; detail: unknown }[]> {
  return page.evaluate(
    (id) =>
      (window as unknown as Record<string, { type: string; detail: unknown }[]>)[`events:${id}`] ??
      [],
    hostId,
  );
}

/** Makes a click on the trigger call a method of the overlay, as a page script would. */
export async function wire(
  page: Page,
  triggerId: string,
  overlayId: string,
  method: string,
): Promise<void> {
  await page.evaluate(
    ([trigger, overlay, name]) => {
      document.getElementById(trigger)?.addEventListener("click", () => {
        const target = document.getElementById(overlay) as unknown as Record<
          string,
          () => Promise<void>
        >;
        void target[name]?.();
      });
    },
    [triggerId, overlayId, method] as const,
  );
}
