import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const PAGE = "/fixtures/implicit-submission.html";

interface Outcome {
  submits: number;
  submitter: string | null;
  clicks: number;
}

async function open(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.locator("idg-input:not(.hydrated), idg-button:not(.hydrated)")).toHaveCount(0);
  // Every form counts its submits and names the submitter; every button counts its clicks.
  await page.evaluate(() => {
    const record = window as unknown as { outcomes: Record<string, Outcome> };
    record.outcomes = {};
    for (const form of document.querySelectorAll("form")) {
      const outcome: Outcome = { submits: 0, submitter: null, clicks: 0 };
      record.outcomes[form.id] = outcome;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        outcome.submits += 1;
        const submitter = event.submitter;
        outcome.submitter = submitter ? submitter.textContent.trim() : null;
      });
      for (const button of form.querySelectorAll("button, idg-button")) {
        button.addEventListener("click", () => {
          outcome.clicks += 1;
        });
      }
    }
  });
}

/** Presses Enter, as a user does, in the form's first idg-input, or its first native field. */
async function pressEnter(page: Page, id: string): Promise<Outcome> {
  const form = page.locator(`#${id}`);
  const field = id.startsWith("idg-")
    ? form.locator("idg-input input").first()
    : form.locator("input:not([type=checkbox])").first();
  await field.focus();
  await page.keyboard.press("Enter");
  // Implicit submission is decided once the keydown has been dispatched to every listener.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 50)));
  return page.evaluate(
    (form) => (window as unknown as { outcomes: Record<string, Outcome> }).outcomes[form],
    id,
  ) as Promise<Outcome>;
}

test.describe("Enter in an idg-input submits as Enter in a native input does", () => {
  test("a form with a submit button: it is clicked and is the submitter", async ({ page }) => {
    await open(page);
    const native = await pressEnter(page, "native-button");
    expect(native).toEqual({ submits: 1, submitter: "Go", clicks: 1 });
    expect(await pressEnter(page, "idg-button")).toEqual(native);
  });

  test("an idg-button that submits is the default button and is clicked", async ({ page }) => {
    await open(page);
    expect(await pressEnter(page, "idg-idg-button")).toMatchObject({ submits: 1, clicks: 1 });
  });

  test("a disabled default button stops the submission", async ({ page }) => {
    await open(page);
    const native = await pressEnter(page, "native-disabled");
    expect(native.submits).toBe(0);
    expect(await pressEnter(page, "idg-disabled")).toEqual(native);
    expect(await pressEnter(page, "idg-idg-disabled")).toEqual(native);
    expect(await pressEnter(page, "idg-idg-loading")).toEqual(native);
  });

  test("the default button is the first submit button, even when it is disabled", async ({
    page,
  }) => {
    await open(page);
    const native = await pressEnter(page, "native-first-disabled");
    expect(native.submits).toBe(0);
    expect(await pressEnter(page, "idg-first-disabled")).toEqual(native);
  });

  test("a button that does not submit is no default button", async ({ page }) => {
    await open(page);
    const native = await pressEnter(page, "native-plain-button");
    expect(native).toEqual({ submits: 1, submitter: null, clicks: 0 });
    expect(await pressEnter(page, "idg-plain-button")).toEqual(native);
  });

  test("two text fields and no submit button: nothing", async ({ page }) => {
    await open(page);
    const native = await pressEnter(page, "native-two");
    expect(native.submits).toBe(0);
    expect(await pressEnter(page, "idg-two")).toEqual(native);
    expect(await pressEnter(page, "idg-two-mixed")).toEqual(native);
  });

  test("one text field and no submit button: the form is submitted", async ({ page }) => {
    await open(page);
    const native = await pressEnter(page, "native-alone");
    expect(native).toEqual({ submits: 1, submitter: null, clicks: 0 });
    expect(await pressEnter(page, "idg-alone")).toEqual(native);
    const withCheckbox = await pressEnter(page, "native-with-checkbox");
    expect(withCheckbox.submits).toBe(1);
    expect(await pressEnter(page, "idg-with-checkbox")).toEqual(withCheckbox);
  });

  test("an ancestor that handles Enter itself keeps the form from being submitted", async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => {
      for (const combo of document.querySelectorAll(".combo")) {
        combo.addEventListener("keydown", (event) => {
          if ((event as KeyboardEvent).key === "Enter") event.preventDefault();
        });
      }
    });
    const native = await pressEnter(page, "native-combo");
    expect(native.submits).toBe(0);
    expect(await pressEnter(page, "idg-combo")).toEqual(native);
  });
});
