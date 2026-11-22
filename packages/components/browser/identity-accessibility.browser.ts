import type { Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, SCHEMES, THEMES, UX_MODES, applyAxes, settle, type Axes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { inputOf, openIdentity, signInThroughForm } from "./identity-page";

const trigger = (page: Page) => page.locator("#menu").locator('[part="trigger"] button');
const menuSurface = (page: Page) => page.locator("#menu").locator('idg-menu [part="surface"]');

/** Every signed-out form showing its field errors and summary, as after an empty submit. */
async function showFormErrors(page: Page): Promise<void> {
  for (const host of ["#sign-in", "#register", "#reset-request", "#reset-complete"]) {
    await page.locator(host).locator("idg-button.submit button").click();
    await expect(page.locator(host).locator('idg-alert[part="error"]')).toBeVisible();
  }
}

/** Signed in, with the profile drawn and the account menu open. */
async function showAccount(page: Page): Promise<void> {
  await signInThroughForm(page);
  await expect(page.locator("#profile").locator('[part="session"]')).toHaveCount(1);
  await trigger(page).click();
  await expect(menuSurface(page)).toBeVisible();
}

/** Checks the signed-out forms with their errors, then the signed-in account, under `axes`. */
async function expectAccessibleUnder(page: Page, axes: Axes): Promise<void> {
  await openIdentity(page);
  await applyAxes(page, axes);
  await showFormErrors(page);
  await settle(page);
  await expectNoAxeViolations(page);
  await showAccount(page);
  await settle(page);
  await expectNoAxeViolations(page);
}

test.describe("identity components meet WCAG 2.2 AA", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`${design} ${scheme}`, async ({ page }) => {
        await expectAccessibleUnder(page, { design, scheme });
      });
    }
  }
  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      test(`the ${theme} theme, ${scheme}`, async ({ page }) => {
        await expectAccessibleUnder(page, { theme, scheme });
      });
    }
  }
  for (const ux of UX_MODES) {
    test(`the ${ux} UX mode`, async ({ page }) => {
      await expectAccessibleUnder(page, { ux });
    });
  }
  for (const layout of LAYOUTS) {
    test(`the ${layout} layout`, async ({ page }) => {
      await expectAccessibleUnder(page, { layout });
    });
  }

  test("a throttled form and a registration confirmation", async ({ page }) => {
    await openIdentity(page, "?confirm");
    // The registration first: the client holds back every credential request while throttled.
    await inputOf(page, "#register", "username").fill("grace");
    await inputOf(page, "#register", "email").fill("grace@example.com");
    await inputOf(page, "#register", "password").fill("a brand new passphrase");
    await inputOf(page, "#register", "password").press("Enter");
    await expect(page.locator("#register").locator('[part="confirmation"]')).toBeVisible();
    await page.evaluate(() => {
      const fixture = (
        window as unknown as {
          identityFixture: { api: { respondNext: (m: string, p: string, a: unknown) => void } };
        }
      ).identityFixture;
      fixture.api.respondNext("POST", "/api/auth/local", {
        status: 429,
        headers: { "Retry-After": "60" },
        body: {
          data: null,
          error: { status: 429, name: "RateLimitError", message: "", details: {} },
        },
      });
    });
    await inputOf(page, "#sign-in", "identifier").fill("ada@example.com");
    await inputOf(page, "#sign-in", "password").fill("a password");
    await inputOf(page, "#sign-in", "password").press("Enter");
    await expect(page.locator("#sign-in").locator('[part="throttle"]')).toBeVisible();
    await settle(page);
    await expectNoAxeViolations(page);
  });
});

test.describe("identity components right to left", () => {
  test("the forms start at the right and the account menu opens from its trigger's end", async ({
    page,
  }) => {
    await openIdentity(page);
    await page.locator("html").evaluate((element) => {
      element.setAttribute("dir", "rtl");
    });
    await showFormErrors(page);
    const field = await page.locator("#sign-in").locator("idg-field").first().boundingBox();
    const label = await page
      .locator("#sign-in")
      .locator("idg-field")
      .first()
      .locator("label")
      .boundingBox();
    if (!field || !label) throw new Error("the sign-in field is not laid out");
    expect(Math.abs(field.x + field.width - (label.x + label.width))).toBeLessThan(1.5);
    expect(label.x).toBeGreaterThan(field.x + 1);
    await showAccount(page);
    await settle(page);
    const button = await trigger(page).boundingBox();
    const surface = await menuSurface(page).boundingBox();
    if (!button || !surface) throw new Error("the account menu is not laid out");
    expect(Math.abs(surface.x - button.x)).toBeLessThan(1.5);
    await expectNoAxeViolations(page);
  });
});

test.describe("identity components with large text on a narrow screen", () => {
  /** How far the page scrolls sideways; 0 when it does not. */
  const overflow = (page: Page) =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

  /**
   * What no longer fits, across every identity element's shadow tree: a password's reveal button
   * past its field's edge, and a word broken across lines although it is well narrower than the
   * column, as when padding squeezes a line to a few letters. A word about as wide as the whole
   * column may break: at 320px with doubled text, some are wider than the screen allows.
   */
  const misfits = (page: Page) =>
    page.evaluate(() => {
      const found: string[] = [];
      const hosts = document.querySelectorAll(
        "idg-sign-in, idg-register, idg-password-reset, idg-profile, idg-session-guard, idg-user-menu",
      );
      const column = Math.max(...Array.from(hosts, (host) => host.getBoundingClientRect().width));
      const roots: ShadowRoot[] = [];
      for (const host of hosts) if (host.shadowRoot) roots.push(host.shadowRoot);
      for (const root of roots) {
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }
      const range = document.createRange();
      for (const root of roots) {
        const reveal = root.querySelector(".reveal");
        const box = root.querySelector(".box");
        if (reveal && box) {
          const inner = box.getBoundingClientRect();
          const button = reveal.getBoundingClientRect();
          if (button.left < inner.left - 0.5 || button.right > inner.right + 0.5) {
            found.push(
              `a reveal button sticks out of its field by ${String(Math.round(Math.max(inner.left - button.left, button.right - inner.right)))}px`,
            );
          }
        }
        // An alert's text that runs past its box, as a word does that cannot break.
        for (const content of root.querySelectorAll(".alert .content")) {
          const over = content.scrollWidth - content.clientWidth;
          if (over > 1) found.push(`an alert's text runs ${String(over)}px past its box`);
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent ?? "";
          for (const match of text.matchAll(/\S+/g)) {
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            const pieces = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
            const lines = new Set(pieces.map((rect) => Math.round(rect.top)));
            const width = pieces.reduce((sum, rect) => sum + rect.width, 0);
            if (lines.size > 1 && width < column * 0.75)
              found.push(`"${match[0]}" is broken over ${String(lines.size)} lines`);
          }
        }
      }
      return found;
    });

  UX_MODES.forEach((ux, index) => {
    // Every UX mode, each with a different design and layout, so all eight of those are sampled too.
    const design = DESIGNS[(index + 3) % DESIGNS.length] ?? "flat";
    const layout = LAYOUTS[(index + 5) % LAYOUTS.length] ?? "top-bar";
    test(`nothing scrolls sideways or is squeezed at 320px with the text doubled, in the ${ux} UX mode (${design}, ${layout})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await openIdentity(page);
      await applyAxes(page, { ux, design, layout });
      await page.locator("html").evaluate((element) => {
        element.style.fontSize = "200%";
      });
      await page.evaluate(() => document.fonts.ready);
      await showFormErrors(page);
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await misfits(page)).toEqual([]);
      await showAccount(page);
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await misfits(page)).toEqual([]);
      const surface = await menuSurface(page).boundingBox();
      if (!surface) throw new Error("the account menu is not laid out");
      expect(surface.x).toBeGreaterThanOrEqual(0);
      expect(surface.x + surface.width).toBeLessThanOrEqual(320);
      // The guard's warning after a Sign out everywhere the server could not confirm.
      await page.keyboard.press("Escape");
      await page.evaluate(`window.identityFixture.api.respondNext(
        "POST", "/api/auth/logout", "network-error")`);
      await page.locator("#profile").getByRole("button", { name: "Sign out everywhere" }).click();
      await expect(page.locator("#guard").locator('[part="sign-out-outcome"]')).toBeVisible();
      await settle(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(await misfits(page)).toEqual([]);
    });
  });
});

test.describe("identity components keep the UX mode's padding at normal text size", () => {
  /** Inline padding found on the fields, submit buttons and summaries, and what the tokens say. */
  const paddings = (page: Page) =>
    page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.append(probe);
      const resolve = (value: string) => {
        probe.style.paddingInlineStart = value;
        return getComputedStyle(probe).paddingInlineStart;
      };
      const control = resolve("var(--idg-density-control-padding-inline)");
      const surface = resolve("calc(var(--idg-space-s) * var(--idg-density-gap-scale))");
      probe.remove();
      const found: string[] = [];
      const expected: string[] = [];
      for (const host of document.querySelectorAll("#sign-in, #register")) {
        const root = host.shadowRoot;
        const box = root?.querySelector("idg-input")?.shadowRoot?.querySelector(".box");
        const button = root
          ?.querySelector("idg-button.submit")
          ?.shadowRoot?.querySelector('[part="control"]');
        const alert = root
          ?.querySelector('idg-alert[part="error"]')
          ?.shadowRoot?.querySelector(".alert");
        for (const [name, element, value] of [
          ["field", box, control],
          ["button", button, control],
          ["summary", alert, surface],
        ] as const) {
          if (!element) throw new Error(`no ${name} in #${host.id}`);
          const style = getComputedStyle(element);
          found.push(`#${host.id} ${name} ${style.paddingInlineStart} ${style.paddingInlineEnd}`);
          expected.push(`#${host.id} ${name} ${value} ${value}`);
        }
      }
      return { found, expected };
    });

  for (const ux of UX_MODES) {
    test(`the ${ux} UX mode's inline padding holds from 320px to 1280px`, async ({ page }) => {
      await openIdentity(page);
      await applyAxes(page, { ux });
      await showFormErrors(page);
      for (const width of [320, 375, 414, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await settle(page);
        const { found, expected } = await paddings(page);
        expect(found, `${String(width)}px`).toEqual(expected);
      }
    });
  }
});
