import { accessibleNode } from "./accessible-node";
import { applyAxes, DESIGNS, SCHEMES, UX_MODES } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const PAGE = "/fixtures/forms.html";

test.beforeEach(async ({ page }) => {
  await page.goto(PAGE);
  await expect(
    page.locator(
      ":is(idg-field, idg-input, idg-textarea, idg-select, idg-checkbox, idg-switch, idg-radio-group, idg-radio):not(.hydrated)",
    ),
  ).toHaveCount(0);
});

test.describe("accessible names and descriptions computed by the browser", () => {
  test("a field names and describes its input across the shadow boundary", async ({ page }) => {
    await expect
      .poll(() => accessibleNode(page, "email", "input"))
      .toMatchObject({
        role: "textbox",
        name: "Email",
        description: "We never share it",
        properties: { required: true },
      });
  });

  eachControlHasAName();

  test("an invalid field is described by its hint and error and marked invalid", async ({
    page,
  }) => {
    await expect
      .poll(() => accessibleNode(page, "bad-name", "input"))
      .toMatchObject({
        role: "textbox",
        name: "Username",
        description: "Letters only That name is taken",
        properties: { invalid: "true" },
      });
  });

  test("a radio group is named and described, and each radio knows its place", async ({ page }) => {
    await expect
      .poll(() => accessibleNode(page, "billing", '[role="radiogroup"]'))
      .toMatchObject({
        role: "radiogroup",
        name: "Billing",
        description: "You can change this later",
      });
    const radios = await page.locator("#billing idg-radio").evaluateAll((elements) =>
      elements.map((element) => {
        const input = element.shadowRoot?.querySelector("input");
        return [input?.getAttribute("aria-posinset"), input?.getAttribute("aria-setsize")];
      }),
    );
    expect(radios).toEqual([
      ["1", "3"],
      ["2", "3"],
      ["3", "3"],
    ]);
  });

  test("checkboxes and switches are named by their text", async ({ page }) => {
    await expect
      .poll(() => accessibleNode(page, "terms", "input"))
      .toMatchObject({
        role: "checkbox",
        name: "Accept the terms",
      });
    await expect
      .poll(() => accessibleNode(page, "alerts", "input"))
      .toMatchObject({
        role: "switch",
        name: "Email alerts",
      });
    await expect
      .poll(async () => (await accessibleNode(page, "partial", "input")).properties)
      .toMatchObject({
        checked: "mixed",
      });
  });

  test("a changed error reaches the control's description", async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById("empty-name")?.parentElement?.setAttribute("error", "Required");
    });
    await expect
      .poll(async () => (await accessibleNode(page, "empty-name", "input")).description)
      .toBe("As on your card Required");
  });
});

test.describe("the live error", () => {
  test("is a single alert region that is empty until an error exists", async ({ page }) => {
    const field = page.locator("idg-field").filter({ has: page.locator("#empty-name") });
    const alert = field.locator('[role="alert"]');
    await expect(alert).toHaveCount(1);
    await expect(alert).toHaveText("");
    await field.evaluate((element) => {
      element.setAttribute("error", "Too short");
    });
    await expect(alert).toHaveText(/Too short/);
    await expect(field.locator("[aria-live]")).toHaveCount(0);
  });
});

test.describe("an error in a narrow field", () => {
  /** Where the error's parts fall against its region and its field, in a field of `width`. */
  function measure(page: Page, dir: "ltr" | "rtl", width: string, error: string) {
    return page.locator("#empty-name").evaluate(
      async (input, [direction, inlineSize, text]) => {
        const field = input.closest("idg-field");
        if (!(field instanceof HTMLElement)) throw new Error("no field");
        field.dir = direction;
        field.style.inlineSize = inlineSize;
        field.setAttribute("error", text);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const root = field.shadowRoot;
        const box = (selector: string) => {
          const found = root?.querySelector(selector)?.getBoundingClientRect();
          if (!found) throw new Error(`no ${selector}`);
          return found;
        };
        const host = field.getBoundingClientRect();
        const region = box(".error");
        const words = box(".error-text");
        const mark = box(".error-mark");
        const node = root?.querySelector(".error-text");
        const range = document.createRange();
        range.selectNodeContents(node ?? field);
        const lines = new Set(
          [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => rect.top),
        ).size;
        const inside = (inner: DOMRect, outer: DOMRect) =>
          inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
        return {
          regionInField: inside(region, host),
          wordsInRegion: inside(words, region),
          belowMark: words.top >= mark.bottom - 0.5,
          lines,
          // Read back, so a rule the browser drops as invalid cannot pass for one it applies.
          sizing: node ? getComputedStyle(node).flexBasis : "",
        };
      },
      [dir, width, error] as const,
    );
  }

  const LONG = "Pneumonoultramicroscopicsilicovolcanoconiosis";

  for (const dir of ["ltr", "rtl"] as const) {
    test(`keeps a word wider than the field inside it, broken, in ${dir}`, async ({ page }) => {
      const found = await measure(page, dir, "10rem", `${LONG} is too long`);
      expect(found).toMatchObject({
        regionInField: true,
        wordsInRegion: true,
        belowMark: true,
        sizing: "min-content",
      });
      expect(found.lines).toBeGreaterThan(1);
    });

    test(`keeps a short error beside its mark, on one line, in ${dir}`, async ({ page }) => {
      const found = await measure(page, dir, "20rem", "Too short");
      expect(found).toEqual({
        regionInField: true,
        wordsInRegion: true,
        belowMark: false,
        lines: 1,
        sizing: "min-content",
      });
    });
  }
});

test.describe("label click", () => {
  for (const [id, inner] of [
    ["email", "input"],
    ["about", "textarea"],
    ["plan", "select"],
  ] as const) {
    test(`clicking the label focuses the ${inner}`, async ({ page }) => {
      await page.locator(`idg-field:has(#${id}) label`).click();
      await expect(page.locator(`#${id} ${inner}`)).toBeFocused();
    });
  }

  test("clicking a radio group's label focuses the group's tab stop", async ({ page }) => {
    await page.locator("idg-field:has(#empty-contact) .label").click();
    await expect(page.locator("#empty-contact idg-radio").first().locator("input")).toBeFocused();
  });
});

test.describe("hints follow the UX mode", () => {
  test("the hint is collapsed when hints are off and shown when they are on", async ({ page }) => {
    const hint = page.locator("idg-field:has(#email)").locator(".hint");
    await applyAxes(page, { ux: "comfortable" });
    expect((await hint.boundingBox())?.height ?? 0).toBe(0);
    await expect(hint).toHaveCSS("opacity", "0");
    await applyAxes(page, { ux: "guided" });
    expect((await hint.boundingBox())?.height ?? 0).toBeGreaterThan(8);
    await expect(hint).toHaveCSS("opacity", "1");
  });

  test("the description is the same whether or not the hint is visible", async ({ page }) => {
    for (const ux of ["comfortable", "guided"]) {
      await applyAxes(page, { ux });
      await expect
        .poll(async () => (await accessibleNode(page, "email", "input")).description)
        .toBe("We never share it");
    }
  });
});

test.describe("accessibility of every control in every state", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }
});

function eachControlHasAName(): void {
  const cases = [
    ["password", "input", "textbox", "Password", "At least 12 characters"],
    ["about", "textarea", "textbox", "About you", "A sentence or two"],
    ["plan", "select", "combobox", "Plan", ""],
    ["off-name", "input", "textbox", "Locked name", ""],
  ] as const;
  for (const [id, inner, role, name, description] of cases) {
    test(`${id} is a ${role} named ${name}`, async ({ page }) => {
      await expect
        .poll(() => accessibleNode(page, id, inner))
        .toMatchObject({ role, name, description });
    });
  }
}
