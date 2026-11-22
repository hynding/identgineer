import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  PASSWORD,
  focusPath,
  inputOf,
  openIdentity,
  recordedEvents,
  signInThroughForm,
} from "./identity-page";

const trigger = (page: Page) => page.locator("#menu").locator('[part="trigger"] button');

interface FixtureHandle {
  api: { respondNext: (method: string, path: string, answer: unknown) => void };
  makeClient: () => {
    restore: () => Promise<unknown>;
    signOut: () => Promise<unknown>;
    dispose: () => void;
  };
  releaseRestore: () => void;
}

/** Runs `script` in the page with the fixture's API and client. */
function withFixture(page: Page, script: (fixture: FixtureHandle) => unknown): Promise<unknown> {
  return page.evaluate(`(${script.toString()})(window.identityFixture)`);
}

test.describe("idg-session-guard", () => {
  test("shows the pending slot while the state is unknown, then the fallback, never the content", async ({
    page,
  }) => {
    await openIdentity(page, "?hold-restore");
    await expect(page.locator("#guard-pending")).toBeVisible();
    await expect(page.locator("#guard-fallback")).toBeHidden();
    await expect(page.locator("#profile")).toBeHidden();
    await expect(page.locator("#menu").locator('[part="trigger"]')).toHaveCount(0);
    await withFixture(page, (fixture) => {
      fixture.releaseRestore();
    });
    await expect(page.locator("#guard-fallback")).toBeVisible();
    await expect(page.locator("#guard-pending")).toBeHidden();
    await expect(page.locator("#profile")).toBeHidden();
    const changes = (await recordedEvents(page)).filter(
      (event) => event.type === "idgSessionChange",
    );
    expect(changes.at(-1)).toEqual({
      type: "idgSessionChange",
      detail: { status: "signed-out", reason: "no-session" },
    });
  });

  test("says so when the restore cannot reach the server, and Try again recovers", async ({
    page,
  }) => {
    await openIdentity(page, "?restore-fail");
    const notice = page.locator("#guard").locator('[part="unreachable"]');
    await expect(notice).toContainText("The service could not be reached.");
    await expect(page.locator("#guard-pending")).toBeHidden();
    await expect(page.locator("#profile")).toBeHidden();
    await notice.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator("#guard-fallback")).toBeVisible();
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  });

  test("shows the content once signed in, and says so with an event", async ({ page }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    await expect(page.locator("#profile")).toBeVisible();
    const changes = (await recordedEvents(page)).filter(
      (event) => event.type === "idgSessionChange",
    );
    expect(changes.at(-1)).toEqual({ type: "idgSessionChange", detail: { status: "signed-in" } });
  });
});

test.describe("idg-user-menu", () => {
  test("opens by keyboard on the user's name, with the page's items and sign-out", async ({
    page,
  }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    await expect(trigger(page)).toHaveAccessibleName("Account menu for ada");
    await trigger(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#menu")).toMatchAriaSnapshot(`
      - button "Account menu for ada"
      - menu:
        - group "Signed in as ada":
          - text: Signed in as ada
          - menuitem "Your profile"
          - menuitem "Help"
        - separator
        - menuitem "Sign out"
    `);
    const item = (name: string) => page.locator("#menu").getByRole("menuitem", { name });
    await expect(item("Your profile")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(item("Help")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await recordedEvents(page)).filter((event) => event.type === "idgSelect"))
      .toEqual([{ type: "idgSelect", detail: { value: "help" } }]);
    expect(await focusPath(page)).toContain("idg-user-menu#menu");
  });

  test("signs out from the menu, says so politely, and shows the signed-out slot", async ({
    page,
  }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    await trigger(page).click();
    await page.locator("#menu").getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.locator("#menu").getByRole("status")).toHaveText("You are signed out.");
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.locator("#guard-fallback")).toBeVisible();
    await expect(page.locator("#menu").locator('[part="outcome"]')).toHaveCount(0);
    expect((await recordedEvents(page)).filter((event) => event.type === "idgSignedOut")).toEqual([
      { type: "idgSignedOut", detail: { outcome: "signed-out" } },
    ]);
  });

  test("tells the user plainly when the server could not be reached", async ({ page }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    await withFixture(page, (fixture) => {
      fixture.api.respondNext("POST", "/api/auth/logout", "network-error");
    });
    await trigger(page).click();
    await page.locator("#menu").getByRole("menuitem", { name: "Sign out" }).click();
    const outcome = page.locator("#menu").locator('[part="outcome"]');
    await expect(outcome).toHaveText(
      "You are signed out on this device, but the server could not be reached. Your session may stay active there until it expires.",
    );
    await expect(outcome).toHaveAttribute("variant", "warning");
    await outcome.getByRole("button", { name: "Dismiss" }).click();
    await expect(outcome).toHaveCount(0);
  });
});

test.describe("identity components across tabs", () => {
  test("a sign-out in another tab takes every component back to signed out", async ({ page }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    await expect(page.locator("#profile")).toBeVisible();
    // A second client on the page's channel stands in for another tab of the same site.
    await withFixture(page, async (fixture) => {
      const other = fixture.makeClient();
      await other.restore();
      await other.signOut();
      other.dispose();
    });
    await expect(page.locator("#menu").locator('[part="trigger"]')).toHaveCount(0);
    await expect(page.locator("#guard-fallback")).toBeVisible();
    await expect(page.locator("#profile")).toBeHidden();
    const events = await recordedEvents(page);
    expect(events.filter((event) => event.type === "idgSignedOut")).toEqual([]);
    expect(events.filter((event) => event.type === "idgSessionChange").at(-1)).toEqual({
      type: "idgSessionChange",
      detail: { status: "signed-out", reason: "other-tab" },
    });
  });
});

test.describe("idg-profile", () => {
  test("saves the profile by keyboard and says so", async ({ page }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    const displayName = inputOf(page, "#profile", "displayName");
    await expect(displayName).toHaveValue("ada");
    await displayName.fill("Ada Lovelace");
    await displayName.press("Enter");
    await expect(page.locator("#profile").locator('[part="details-saved"]')).toHaveText(
      "Profile saved.",
    );
    expect(
      (await recordedEvents(page)).filter((event) => event.type === "idgProfileSaved"),
    ).toHaveLength(1);
  });

  test("changes the password, then lists this device's session and signs out everywhere", async ({
    page,
  }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    const profile = page.locator("#profile");
    await inputOf(page, "#profile", "currentPassword").fill(PASSWORD);
    await inputOf(page, "#profile", "newPassword").fill("a brand new passphrase");
    await inputOf(page, "#profile", "passwordConfirmation").fill("a brand new passphrase");
    await inputOf(page, "#profile", "passwordConfirmation").press("Enter");
    await expect(profile.locator('[part="password-saved"]')).toContainText("Password changed.");
    await expect(inputOf(page, "#profile", "currentPassword")).toHaveValue("");
    await expect(profile.locator('[part="session"]')).toHaveCount(1);
    await expect(profile.locator('[part="session"]')).toContainText("This device");
    await profile.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page.locator("#guard-fallback")).toBeVisible();
    await expect(page.locator("#menu").locator('[part="trigger"]')).toHaveCount(0);
  });
});

test.describe("a sign-out the server could not confirm", () => {
  test("Sign out everywhere says so above the fallback, though the profile is gone", async ({
    page,
  }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    await withFixture(page, (fixture) => {
      fixture.api.respondNext("POST", "/api/auth/logout", "network-error");
    });
    await page.locator("#profile").getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page.locator("#guard-fallback")).toBeVisible();
    await expect(page.locator("#profile")).toBeHidden();
    const notice = page.locator("#guard").locator('[part="sign-out-outcome"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("your other sessions may stay signed in");
    expect((await recordedEvents(page)).filter((event) => event.type === "idgSignedOut")).toEqual([
      { type: "idgSignedOut", detail: { outcome: "server-unreachable", everywhere: true } },
    ]);
  });
});

test.describe("identity components and browser storage", () => {
  test("a whole session writes nothing to localStorage, sessionStorage, cookies or IndexedDB", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const writes: string[] = [];
      (window as unknown as { storageWrites: string[] }).storageWrites = writes;
      for (const method of ["setItem", "removeItem", "clear"] as const) {
        const original = Object.getOwnPropertyDescriptor(Storage.prototype, method)?.value as (
          this: Storage,
          ...args: unknown[]
        ) => unknown;
        Storage.prototype[method] = function (this: Storage, ...args: unknown[]) {
          writes.push(`${this === localStorage ? "local" : "session"}Storage.${method}`);
          return original.apply(this, args);
        };
      }
      const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
      Object.defineProperty(Document.prototype, "cookie", {
        configurable: true,
        get(this: Document) {
          return cookie?.get?.call(this) as string;
        },
        set(this: Document, value: string) {
          writes.push("document.cookie");
          cookie?.set?.call(this, value);
        },
      });
      const open = IDBFactory.prototype.open.bind(indexedDB);
      IDBFactory.prototype.open = (...args: Parameters<IDBFactory["open"]>) => {
        writes.push("indexedDB.open");
        return open(...args);
      };
    });
    await openIdentity(page);
    await signInThroughForm(page);
    await inputOf(page, "#profile", "displayName").fill("Ada Lovelace");
    await inputOf(page, "#profile", "displayName").press("Enter");
    await expect(page.locator("#profile").locator('[part="details-saved"]')).toBeVisible();
    await trigger(page).click();
    await page.locator("#menu").getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.locator("#guard-fallback")).toBeVisible();
    const state = await page.evaluate(async () => ({
      writes: (window as unknown as { storageWrites: string[] }).storageWrites,
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
      databases: (await indexedDB.databases()).length,
    }));
    expect(state).toEqual({ writes: [], local: 0, session: 0, cookie: "", databases: 0 });
  });
});
