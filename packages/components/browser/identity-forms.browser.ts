import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  PASSWORD,
  composedMarkup,
  focusPath,
  inputOf,
  openIdentity,
  recordedEvents,
  signInThroughForm,
} from "./identity-page";

const NEW_PASSWORD = "a brand new passphrase";

/** The summary alert above the form in `host`, not a field's own error. */
const summaryOf = (page: Page, host: string) =>
  page.locator(host).locator('idg-alert[part="error"]');

/** Answers the next request to `path` with a 429 that asks for `seconds` of wait. */
async function throttleNext(page: Page, path: string, seconds: number): Promise<void> {
  await page.evaluate(
    ({ route, wait }) => {
      const fixture = (
        window as unknown as {
          identityFixture: { api: { respondNext: (m: string, p: string, a: unknown) => void } };
        }
      ).identityFixture;
      fixture.api.respondNext("POST", route, {
        status: 429,
        headers: { "Retry-After": String(wait) },
        body: {
          data: null,
          error: {
            status: 429,
            name: "RateLimitError",
            message: "Too Many Attempts.",
            details: {},
          },
        },
      });
    },
    { route: path, wait: seconds },
  );
}

/** Makes the next request to `path` fail as an unreachable server would. */
async function failNext(page: Page, path: string): Promise<void> {
  await page.evaluate((route) => {
    const fixture = (
      window as unknown as {
        identityFixture: { api: { respondNext: (m: string, p: string, a: unknown) => void } };
      }
    ).identityFixture;
    fixture.api.respondNext("POST", route, "network-error");
  }, path);
}

test.describe("identity forms and password managers", () => {
  test("the real inputs carry the autofill hints a password manager reads", async ({ page }) => {
    await openIdentity(page);
    const expected: [string, string, string, string][] = [
      ["#sign-in", "identifier", "username webauthn", "text"],
      ["#sign-in", "password", "current-password", "password"],
      ["#register", "username", "username", "text"],
      ["#register", "email", "email", "email"],
      ["#register", "password", "new-password", "password"],
      ["#reset-request", "email", "email", "email"],
      ["#reset-complete", "password", "new-password", "password"],
      ["#reset-complete", "passwordConfirmation", "new-password", "password"],
    ];
    for (const [host, name, autocomplete, type] of expected) {
      const input = inputOf(page, host, name);
      await expect(input, `${host} ${name}`).toHaveAttribute("autocomplete", autocomplete);
      await expect(input, `${host} ${name}`).toHaveAttribute("type", type);
      await expect(input, `${host} ${name}`).toHaveAttribute("autocapitalize", "none");
      await expect(input, `${host} ${name}`).toHaveAttribute("spellcheck", "false");
    }
    await expect(inputOf(page, "#sign-in", "identifier")).toHaveAttribute("inputmode", "email");
  });

  test("each password field is in a form with its account name, so a manager pairs them", async ({
    page,
  }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    const pairs = await page.evaluate(() => {
      const found: string[] = [];
      const visit = (root: Document | ShadowRoot) => {
        for (const form of root.querySelectorAll("form")) {
          const names: string[] = [];
          const walk = (node: ParentNode) => {
            for (const element of node.querySelectorAll("*")) {
              if (element instanceof HTMLInputElement) names.push(element.autocomplete);
              if (element.shadowRoot) walk(element.shadowRoot);
            }
          };
          walk(form);
          if (names.length > 0) found.push(names.join(" | "));
        }
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) visit(element.shadowRoot);
        }
      };
      visit(document);
      return found;
    });
    expect(pairs).toContain("username webauthn | current-password");
    expect(pairs).toContain("username | email | new-password");
    expect(pairs).toContain("username | current-password | new-password | new-password");
  });
});

test.describe("identity forms and form association", () => {
  test("every field is an idg-input that submits its value, its native input has no form owner", async ({
    page,
  }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    await inputOf(page, "#profile", "currentPassword").fill(PASSWORD);
    const form = await page.locator("#profile").evaluate((host) => {
      const element = host.shadowRoot?.querySelector('form[part="password"]');
      if (!(element instanceof HTMLFormElement)) throw new Error("no password form");
      const natives = [...element.querySelectorAll("idg-input")].map(
        (control) => control.shadowRoot?.querySelector("input")?.form ?? null,
      );
      return {
        entries: [...new FormData(element).keys()],
        ownedNatives: natives.filter((owner) => owner !== null).length,
        plainInputs: element.querySelectorAll("input").length,
      };
    });
    expect(form).toEqual({
      entries: ["username", "currentPassword", "newPassword", "passwordConfirmation"],
      ownedNatives: 0,
      plainInputs: 0,
    });
  });

  test("the profile's username companion is laid out but out of sight and out of the tab order", async ({
    page,
  }) => {
    await openIdentity(page);
    await signInThroughForm(page);
    const companion = inputOf(page, "#profile", "username");
    await expect(companion).toHaveValue("ada");
    await expect(companion).toHaveAttribute("autocomplete", "username");
    const box = await companion.boundingBox();
    expect(box).not.toBeNull();
    expect(await companion.evaluate((input) => getComputedStyle(input).display)).not.toBe("none");
    await inputOf(page, "#profile", "bio").focus();
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Tab");
      expect(await focusPath(page)).not.toContain("input[name=username]");
    }
  });
});

test.describe("identity forms by keyboard", () => {
  test("Tab walks the sign-in form in reading order and Enter signs in", async ({ page }) => {
    await openIdentity(page);
    await inputOf(page, "#sign-in", "identifier").focus();
    await page.keyboard.type("ada@example.com");
    await page.keyboard.press("Tab");
    expect(await focusPath(page)).toEqual([
      "idg-sign-in#sign-in",
      "idg-input[name=password]",
      "input[name=password]",
    ]);
    await page.keyboard.type(PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page.locator("#menu").locator('[part="trigger"]')).toBeVisible();
    expect((await recordedEvents(page)).filter((event) => event.type === "idgSignedIn")).toEqual([
      { type: "idgSignedIn", detail: { user: { id: 1, username: "ada" } } },
    ]);
  });

  test("a missing field is marked, described and focused, under a summary alert", async ({
    page,
  }) => {
    await openIdentity(page);
    await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
    await page.locator("#sign-in").locator("idg-button.submit button").click();
    const password = inputOf(page, "#sign-in", "password");
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(password).toHaveAccessibleDescription(/Enter your password\./);
    await expect(summaryOf(page, "#sign-in").getByRole("alert")).toHaveCount(1);
    await expect(summaryOf(page, "#sign-in")).toHaveText(
      "Some details are missing or not valid. Check the marked fields.",
    );
    await expect(inputOf(page, "#sign-in", "identifier")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("a wrong password says one thing for every cause, and the password is cleared", async ({
    page,
  }) => {
    await openIdentity(page);
    const messages: string[] = [];
    for (const identifier of ["ada@example.com", "nobody@example.com"]) {
      await inputOf(page, "#sign-in", "identifier").fill(identifier);
      await inputOf(page, "#sign-in", "password").fill("not the password");
      await inputOf(page, "#sign-in", "password").press("Enter");
      const alert = summaryOf(page, "#sign-in");
      await expect(alert).toBeVisible();
      messages.push((await alert.textContent()) ?? "");
      await expect(inputOf(page, "#sign-in", "password")).toHaveValue("");
    }
    expect(messages).toEqual([
      "The email, username or password is not correct.",
      "The email, username or password is not correct.",
    ]);
  });

  test("a network failure keeps what was typed and offers a retry that works", async ({ page }) => {
    await openIdentity(page);
    await failNext(page, "/api/auth/local");
    await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
    await inputOf(page, "#sign-in", "password").fill(PASSWORD);
    await inputOf(page, "#sign-in", "password").press("Enter");
    const retry = page.locator("#sign-in").locator("idg-button.retry button");
    await expect(retry).toBeVisible();
    await expect(summaryOf(page, "#sign-in").getByRole("alert")).toHaveCount(1);
    await expect(summaryOf(page, "#sign-in")).toContainText("The service could not be reached.");
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#menu").locator('[part="trigger"]')).toBeVisible();
  });

  test("a registration the network failed keeps the password, and Try again sends it", async ({
    page,
  }) => {
    await openIdentity(page, "?confirm");
    await failNext(page, "/api/auth/local/register");
    await inputOf(page, "#register", "username").fill("grace");
    await inputOf(page, "#register", "email").fill("grace@example.com");
    await inputOf(page, "#register", "password").fill(NEW_PASSWORD);
    await inputOf(page, "#register", "password").press("Enter");
    await expect(summaryOf(page, "#register")).toContainText("The service could not be reached.");
    await expect(inputOf(page, "#register", "password")).toHaveValue(NEW_PASSWORD);
    await page.locator("#register").locator("idg-button.retry button").click();
    await expect(page.locator("#register").locator('[part="confirmation"]')).toBeVisible();
    await expect(inputOf(page, "#register", "password")).toHaveCount(0);
  });

  test("a new password the network failed is kept, and Try again sets it", async ({ page }) => {
    await openIdentity(page);
    const code = await page.evaluate(() => {
      const fixture = (
        window as unknown as {
          identityFixture: {
            client: { requestPasswordReset: (input: { email: string }) => Promise<unknown> };
            api: { findUser: (email: string) => { resetCode?: string } | undefined };
          };
        }
      ).identityFixture;
      return fixture.client
        .requestPasswordReset({ email: "ada@example.com" })
        .then(() => fixture.api.findUser("ada@example.com")?.resetCode ?? "");
    });
    await page.locator("#reset-complete").evaluate((host, value) => {
      (host as HTMLElement & { code: string }).code = value;
    }, code);
    await failNext(page, "/api/auth/reset-password");
    await inputOf(page, "#reset-complete", "password").fill(NEW_PASSWORD);
    await inputOf(page, "#reset-complete", "passwordConfirmation").fill(NEW_PASSWORD);
    await inputOf(page, "#reset-complete", "passwordConfirmation").press("Enter");
    await expect(summaryOf(page, "#reset-complete")).toContainText(
      "The service could not be reached.",
    );
    await expect(inputOf(page, "#reset-complete", "password")).toHaveValue(NEW_PASSWORD);
    await expect(inputOf(page, "#reset-complete", "passwordConfirmation")).toHaveValue(
      NEW_PASSWORD,
    );
    await page.locator("#reset-complete").locator("idg-button.retry button").click();
    await expect(page.locator("#reset-complete").locator('[part="confirmation"]')).toBeVisible();
  });

  test("registering moves focus to the confirmation", async ({ page }) => {
    await openIdentity(page, "?confirm");
    await inputOf(page, "#register", "username").fill("grace");
    await inputOf(page, "#register", "email").fill("grace@example.com");
    await inputOf(page, "#register", "password").fill(NEW_PASSWORD);
    await inputOf(page, "#register", "password").press("Enter");
    const confirmation = page.locator("#register").locator('[part="confirmation"]');
    await expect(confirmation).toBeFocused();
    await expect(confirmation).toContainText("Check your email.");
  });

  test("the password's length is counted in bytes as it is typed", async ({ page }) => {
    await openIdentity(page);
    const count = page.locator("#register").locator('[part="byte-count"]');
    await inputOf(page, "#register", "password").fill("é".repeat(36));
    await expect(count).toHaveText("72 of 72 bytes used");
    await inputOf(page, "#register", "password").fill(`${"é".repeat(36)}a`);
    await expect(count).toHaveText("73 of 72 bytes used");
    await expect(inputOf(page, "#register", "password")).toHaveAttribute("aria-invalid", "true");
  });
});

test.describe("identity forms and secrets", () => {
  test("a shown password is hidden again when the form is sent, and stays hidden", async ({
    page,
  }) => {
    await openIdentity(page);
    const password = inputOf(page, "#sign-in", "password");
    // The type the native input has while the form's submit event runs.
    await page.locator("#sign-in").evaluate((host) => {
      const record = window as unknown as { typesAtSubmit: string[] };
      record.typesAtSubmit = [];
      const form = host.shadowRoot?.querySelector("form");
      const input = host.shadowRoot
        ?.querySelector('idg-input[name="password"]')
        ?.shadowRoot?.querySelector("input");
      form?.addEventListener("submit", () => record.typesAtSubmit.push(input?.type ?? ""));
    });
    const reveal = page.locator("#sign-in").locator('idg-input[name="password"] button.reveal');
    await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
    await password.fill("not the password");
    await reveal.click();
    await expect(password).toHaveAttribute("type", "text");
    await password.press("Enter");
    await expect(summaryOf(page, "#sign-in")).toBeVisible();
    await expect(password).toHaveAttribute("type", "password");
    await password.fill(PASSWORD);
    await reveal.click();
    await password.press("Enter");
    await expect(page.locator("#menu").locator('[part="trigger"]')).toBeVisible();
    await expect(password).toHaveAttribute("type", "password");
    expect(
      await page.evaluate(() => (window as unknown as { typesAtSubmit: string[] }).typesAtSubmit),
    ).toEqual(["password", "password"]);
  });

  test("no password reaches an attribute, a text node or an event", async ({ page }) => {
    await openIdentity(page);
    await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
    await inputOf(page, "#sign-in", "password").fill(PASSWORD);
    await inputOf(page, "#register", "password").fill(NEW_PASSWORD);
    await inputOf(page, "#reset-complete", "password").fill(NEW_PASSWORD);
    const typed = await composedMarkup(page, "body");
    expect(typed).not.toContain(PASSWORD);
    expect(typed).not.toContain(NEW_PASSWORD);
    await inputOf(page, "#sign-in", "password").press("Enter");
    await expect(page.locator("#menu").locator('[part="trigger"]')).toBeVisible();
    const signedIn = await composedMarkup(page, "body");
    expect(signedIn).not.toContain(PASSWORD);
    await expect(inputOf(page, "#sign-in", "password")).toHaveValue("");
    expect(JSON.stringify(await recordedEvents(page))).not.toContain(PASSWORD);
  });
});

test.describe("identity forms and account enumeration", () => {
  /** Registers `email` on a fresh page and returns what the form then shows and says. */
  async function registerOutcome(page: Page, email: string) {
    await openIdentity(page, "?confirm");
    await inputOf(page, "#register", "username").fill("grace");
    await inputOf(page, "#register", "email").fill(email);
    await inputOf(page, "#register", "password").fill(NEW_PASSWORD);
    await inputOf(page, "#register", "password").press("Enter");
    await expect(page.locator("#register").locator('[part="confirmation"]')).toBeVisible();
    return {
      markup: await composedMarkup(page, "#register"),
      tree: await page.locator("#register").ariaSnapshot(),
    };
  }

  /** Asks for a reset of `email` on a fresh page and returns what the form then shows and says. */
  async function resetOutcome(page: Page, email: string) {
    await openIdentity(page);
    await inputOf(page, "#reset-request", "email").fill(email);
    await inputOf(page, "#reset-request", "email").press("Enter");
    await expect(page.locator("#reset-request").locator('[part="confirmation"]')).toBeVisible();
    return {
      markup: await composedMarkup(page, "#reset-request"),
      tree: await page.locator("#reset-request").ariaSnapshot(),
    };
  }

  test("registering a taken address looks and reads as registering a new one", async ({ page }) => {
    const taken = await registerOutcome(page, "ada@example.com");
    const fresh = await registerOutcome(page, "grace@example.com");
    expect(fresh.markup).toBe(taken.markup);
    expect(fresh.tree).toBe(taken.tree);
  });

  test("a reset for an unknown address looks and reads as one for a known address", async ({
    page,
  }) => {
    const known = await resetOutcome(page, "ada@example.com");
    const unknown = await resetOutcome(page, "nobody@example.com");
    expect(unknown.markup).toBe(known.markup);
    expect(unknown.tree).toBe(known.tree);
    expect(known.tree).toContain("If an account uses this address");
  });
});

test.describe("identity forms when throttled", () => {
  test("the wait counts down on screen, said politely once at the start and once at the end", async ({
    page,
  }) => {
    await openIdentity(page);
    await throttleNext(page, "/api/auth/local", 3);
    await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
    await inputOf(page, "#sign-in", "password").fill(PASSWORD);
    await inputOf(page, "#sign-in", "password").press("Enter");
    const notice = page.locator("#sign-in").locator('[part="throttle"]');
    const status = page.locator("#sign-in").getByRole("status");
    await expect(notice).toContainText(/Too many attempts\. You can try again in 0:0[23]\./);
    await expect(notice.getByRole("alert")).toHaveCount(0);
    await expect(summaryOf(page, "#sign-in")).toHaveCount(0);
    const said = (await status.textContent()) ?? "";
    expect(said).toMatch(/^Too many attempts\. You can try again in 0:0[23]\.$/);
    await expect(notice).toContainText("0:01");
    expect(await status.textContent()).toBe(said);
    await expect(notice).toBeHidden({ timeout: 5000 });
    await expect(status).toHaveText("You can try again now.");
    await inputOf(page, "#sign-in", "password").fill(PASSWORD);
    await inputOf(page, "#sign-in", "password").press("Enter");
    await expect(page.locator("#menu").locator('[part="trigger"]')).toBeVisible();
  });
});

test.describe("provider sign-in", () => {
  test("goes to the provider's address by default", async ({ page }) => {
    await page.route("https://cms.example.test/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<p>Provider</p>" }),
    );
    await openIdentity(page);
    await page.locator("#sign-in").getByRole("button", { name: "Continue with GitHub" }).click();
    await page.waitForURL(/^https:\/\/cms\.example\.test\/api\/connect\/github/);
  });

  test("stays put when the page cancels the event, which carries the address", async ({ page }) => {
    await openIdentity(page);
    await page.evaluate(() => {
      document.addEventListener("idgProviderSignIn", (event) => {
        event.preventDefault();
      });
    });
    const before = page.url();
    await page.locator("#sign-in").getByRole("button", { name: "Continue with GitHub" }).click();
    await expect
      .poll(async () => (await recordedEvents(page)).map((event) => event.type))
      .toContain("idgProviderSignIn");
    const [event] = (await recordedEvents(page)).filter(
      (recorded) => recorded.type === "idgProviderSignIn",
    );
    expect(event?.detail).toMatchObject({
      provider: "github",
      url: expect.stringMatching(/^https:\/\/cms\.example\.test\/api\/connect\/github/),
    });
    expect(page.url()).toBe(before);
  });
});
