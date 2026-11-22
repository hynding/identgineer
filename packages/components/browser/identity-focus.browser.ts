import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PASSWORD, focusPath, inputOf } from "./identity-page";

// The documented page: the guard shows idg-profile once signed in and idg-sign-in as its
// fallback, between a link before it and one after it, so a Tab cycle can be followed through.
const GUARD_PAGE = "/fixtures/identity-guard.html";

const guard = (page: Page) => page.locator("#guard");
const region = (page: Page) => guard(page).locator('[part="region"]');
const guardNotice = (page: Page) => guard(page).locator('[part="sign-out-outcome"]');
const menuTrigger = (page: Page) => page.locator("#menu").locator('[part="trigger"] button');

interface FixtureHandle {
  api: { respondNext: (method: string, path: string, answer: unknown) => void };
}

function withFixture(page: Page, script: (fixture: FixtureHandle) => unknown): Promise<unknown> {
  return page.evaluate(`(${script.toString()})(window.identityFixture)`);
}

async function openGuardPage(page: Page, query = ""): Promise<void> {
  await page.goto(`${GUARD_PAGE}${query}`);
  await expect(page.locator("html[data-identity-ready]")).toHaveCount(1);
  await expect(
    page.locator(
      "idg-session-guard:not(.hydrated), idg-profile:not(.hydrated), idg-sign-in:not(.hydrated), idg-user-menu:not(.hydrated)",
    ),
  ).toHaveCount(0);
}

/** Signs in through the guard's fallback by keyboard, as a user would. */
async function signInThroughFallback(page: Page): Promise<void> {
  await expect(inputOf(page, "#sign-in", "identifier")).toBeVisible();
  await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
  await inputOf(page, "#sign-in", "password").fill(PASSWORD);
  await inputOf(page, "#sign-in", "password").press("Enter");
  await expect(page.locator("#profile").locator('[part="session"]')).toHaveCount(1);
}

/**
 * Tabs from where focus is until the link after the guard has been passed twice, and returns the
 * second full lap: every stop from the first visit to that link to the second.
 */
async function secondTabLap(page: Page): Promise<string[]> {
  const stops: string[] = [];
  let visits = 0;
  for (let press = 0; press < 150 && visits < 2; press += 1) {
    await page.keyboard.press("Tab");
    const stop = (await focusPath(page)).join(" > ");
    if (stop === "a#after") visits += 1;
    if (visits >= 1) stops.push(stop);
  }
  expect(visits, "the Tab cycle never came round to the link after the guard twice").toBe(2);
  return stops;
}

/** Each of `expected` is a Tab stop, by the start of its focus path, in both laps of a cycle. */
async function expectReachableByTab(page: Page, expected: string[]): Promise<void> {
  const lap = await secondTabLap(page);
  for (const stop of ["a#before", ...expected]) {
    expect(
      lap.some((path) => path.startsWith(stop)),
      `${stop} is not reached by Tab: ${lap.join(" | ")}`,
    ).toBe(true);
  }
}

/** No element of the page, and no custom element host in the guard or menu, was given a tabindex. */
async function expectNoTabindexWritten(page: Page): Promise<void> {
  const written = await page.evaluate(() => {
    const found = Array.from(
      document.querySelectorAll("[tabindex]"),
      (element) => element.localName,
    );
    for (const id of ["guard", "menu"]) {
      const root = document.getElementById(id)?.shadowRoot;
      for (const element of root?.querySelectorAll("[tabindex]") ?? []) {
        if (element.localName.includes("-")) found.push(`${id} > ${element.localName}`);
      }
    }
    return found;
  });
  expect(written).toEqual([]);
}

/** Records where focus goes from now on, as focus paths. */
async function recordFocusSteps(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const steps: string[] = [];
    (window as unknown as { focusSteps: string[] }).focusSteps = steps;
    document.addEventListener("focusin", () => {
      const chain: string[] = [];
      let element: Element | null = document.activeElement;
      while (element) {
        chain.push(element.id ? `${element.localName}#${element.id}` : element.localName);
        element = element.shadowRoot?.activeElement ?? null;
      }
      steps.push(chain.join(" > "));
    });
  });
  return () => page.evaluate(() => [...(window as unknown as { focusSteps: string[] }).focusSteps]);
}

/** What the guard's own polite status says, not that of the content it shows. */
function guardStatus(page: Page): Promise<string> {
  return guard(page).evaluate(
    (host) => host.shadowRoot?.querySelector('p[role="status"]')?.textContent ?? "",
  );
}

/** Whether focus is on an element of the guard's own that holds its notice. */
function focusHoldsGuardNotice(page: Page): Promise<boolean> {
  return guard(page).evaluate((host) => {
    const active = host.shadowRoot?.activeElement;
    const notice = host.shadowRoot?.querySelector('[part="sign-out-outcome"]');
    return Boolean(active && notice && active.contains(notice));
  });
}

const PROFILE_STOPS = [
  "idg-profile#profile > idg-input[name=displayName] > input",
  "idg-profile#profile > idg-button",
];
const SIGN_IN_STOPS = [
  "idg-sign-in#sign-in > idg-input[name=identifier] > input",
  "idg-sign-in#sign-in > idg-input[name=password] > input",
];

test.describe("idg-session-guard and idg-user-menu keep every control reachable by Tab", () => {
  test("after a sign-in through the guard's fallback, focus is on the guard and the profile is reachable", async ({
    page,
  }) => {
    await openGuardPage(page);
    await signInThroughFallback(page);
    await expect(region(page)).toBeFocused();
    await expect(region(page)).toHaveAttribute("aria-label", "Account");
    await expect.poll(() => guardStatus(page)).toBe("You are signed in.");
    await expectNoTabindexWritten(page);
    await expectReachableByTab(page, PROFILE_STOPS);
  });

  test("after Sign out in the menu, focus is on its Sign in link and the sign-in form is reachable", async ({
    page,
  }) => {
    await openGuardPage(page);
    await signInThroughFallback(page);
    await menuTrigger(page).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator("#menu").getByRole("menuitem", { name: "Your profile" }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(
      page.locator("#menu").getByRole("link", { name: "Sign in", exact: true }),
    ).toBeFocused();
    await expectNoTabindexWritten(page);
    await expectReachableByTab(page, ["a", ...SIGN_IN_STOPS]);
    // And in again through the fallback: the profile is reachable once more.
    await signInThroughFallback(page);
    await expectReachableByTab(page, PROFILE_STOPS);
  });

  test("after Sign out everywhere, focus is on the guard and the sign-in form is reachable", async ({
    page,
  }) => {
    await openGuardPage(page);
    await signInThroughFallback(page);
    await page.locator("#profile").getByRole("button", { name: "Sign out everywhere" }).focus();
    await page.keyboard.press("Enter");
    await expect(region(page)).toBeFocused();
    await expect.poll(() => guardStatus(page)).toBe("You are signed out.");
    await expectNoTabindexWritten(page);
    await expectReachableByTab(page, SIGN_IN_STOPS);
  });

  test("after a Sign out everywhere the server could not confirm, focus settles once on the notice, which is said once", async ({
    page,
  }) => {
    await openGuardPage(page);
    await signInThroughFallback(page);
    await withFixture(page, (fixture) => {
      fixture.api.respondNext("POST", "/api/auth/logout", "network-error");
    });
    await page.locator("#profile").getByRole("button", { name: "Sign out everywhere" }).focus();
    const focusSteps = await recordFocusSteps(page);
    const statusBefore = await guardStatus(page);
    await page.keyboard.press("Enter");
    await expect(guardNotice(page)).toBeVisible();
    await expect.poll(() => focusHoldsGuardNotice(page)).toBe(true);
    // Read when it takes focus, so neither a live role nor the polite message says it again.
    expect(await guardStatus(page)).toBe(statusBefore);
    await expect(guardNotice(page).getByRole("alert")).toHaveCount(0);
    expect(await focusSteps()).toHaveLength(1);
    await expectNoTabindexWritten(page);
    await expectReachableByTab(page, [
      "idg-session-guard#guard > idg-alert > button",
      ...SIGN_IN_STOPS,
    ]);
  });

  test("dismissing the guard's notice puts focus on the guard, and the sign-in form is reachable", async ({
    page,
  }) => {
    await openGuardPage(page);
    await signInThroughFallback(page);
    await withFixture(page, (fixture) => {
      fixture.api.respondNext("POST", "/api/auth/logout", "network-error");
    });
    await page.locator("#profile").getByRole("button", { name: "Sign out everywhere" }).click();
    await guardNotice(page).getByRole("button", { name: "Dismiss" }).focus();
    await page.keyboard.press("Enter");
    await expect(guardNotice(page)).toHaveCount(0);
    await expect(region(page)).toBeFocused();
    await expectNoTabindexWritten(page);
    await expectReachableByTab(page, SIGN_IN_STOPS);
  });

  test("after a Sign out in the menu the server could not confirm, focus is on its notice and the page is reachable", async ({
    page,
  }) => {
    await openGuardPage(page);
    await signInThroughFallback(page);
    await withFixture(page, (fixture) => {
      fixture.api.respondNext("POST", "/api/auth/logout", "network-error");
    });
    await menuTrigger(page).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.locator("#menu").getByRole("menuitem", { name: "Your profile" }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    const notice = page.locator("#menu").locator('[part="outcome"]');
    await expect(notice).toBeVisible();
    await expect
      .poll(() =>
        page.locator("#menu").evaluate((host) => {
          const active = host.shadowRoot?.activeElement;
          const outcome = host.shadowRoot?.querySelector('[part="outcome"]');
          return Boolean(active && outcome && active.contains(outcome));
        }),
      )
      .toBe(true);
    await expectNoTabindexWritten(page);
    await expectReachableByTab(page, [
      "idg-user-menu#menu > idg-alert > button",
      "a",
      ...SIGN_IN_STOPS,
    ]);
  });

  test("when the restore cannot reach the server, Try again keeps focus on the guard whether it fails again or not", async ({
    page,
  }) => {
    await openGuardPage(page, "?restore-fail");
    const retry = guard(page).getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    await expectNoTabindexWritten(page);
    await expectReachableByTab(page, ["idg-session-guard#guard > idg-button > button"]);
    await withFixture(page, (fixture) => {
      fixture.api.respondNext("POST", "/api/auth/refresh", "network-error");
    });
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(region(page)).toBeFocused();
    await expect(retry).toBeVisible();
    await expect(region(page)).toBeFocused();
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(inputOf(page, "#sign-in", "identifier")).toBeVisible();
    await expect(region(page)).toBeFocused();
    await expectNoTabindexWritten(page);
    await expectReachableByTab(page, SIGN_IN_STOPS);
  });
});
