import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

async function open(page: Page): Promise<void> {
  await page.goto("/fixtures/forms.html");
  await expect(page.locator("idg-select:not(.hydrated)")).toHaveCount(0);
}

/** A form with a required select that has an empty first option, ready in the page. */
async function build(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const form = document.createElement("form");
    form.id = "probe";
    const select = document.createElement("idg-select");
    select.id = "probe-select";
    select.setAttribute("required", "");
    select.setAttribute("name", "s");
    for (const [value, text] of [
      ["", "Choose"],
      ["x", "X"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    form.append(select);
    document.body.append(form);
    await customElements.whenDefined("idg-select");
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
}

const state = (page: Page) =>
  page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const select = document.getElementById("probe-select") as HTMLElement & { value: string };
    const form = document.getElementById("probe") as HTMLFormElement;
    return {
      value: select.value,
      invalid: select.matches(":invalid"),
      formValid: form.checkValidity(),
      submitted: new FormData(form).get("s"),
    };
  });

test.describe("idg-select validity follows a value set from script", () => {
  test("a required select becomes valid when it is given an option's value, and invalid again when emptied", async ({
    page,
  }) => {
    await open(page);
    await build(page);
    expect(await state(page)).toMatchObject({ value: "", invalid: true, formValid: false });
    await page.evaluate(() => {
      (document.getElementById("probe-select") as HTMLElement & { value: string }).value = "x";
    });
    expect(await state(page)).toEqual({
      value: "x",
      invalid: false,
      formValid: true,
      submitted: "x",
    });
    await page.evaluate(() => {
      (document.getElementById("probe-select") as HTMLElement & { value: string }).value = "";
    });
    expect(await state(page)).toMatchObject({ value: "", invalid: true, formValid: false });
  });
});

test.describe("idg-select does not rebuild its options when nothing about them changed", () => {
  test("toggling invalid or disabled changes no option, and a new value keeps the option nodes", async ({
    page,
  }) => {
    await open(page);
    await build(page);
    const result = await page.evaluate(async () => {
      const wait = () => new Promise((resolve) => setTimeout(resolve, 150));
      const select = document.getElementById("probe-select") as HTMLElement & {
        value: string;
        invalid: boolean;
        disabled: boolean;
      };
      const native = select.shadowRoot?.querySelector("select");
      if (!native) throw new Error("no native select");
      const before = Array.from(native.options);
      let mutations = 0;
      new MutationObserver((records) => {
        mutations += records.filter((record) => record.type === "childList").length;
      }).observe(native, { childList: true, subtree: true });
      select.invalid = true;
      await wait();
      select.invalid = false;
      await wait();
      select.disabled = true;
      await wait();
      select.disabled = false;
      await wait();
      select.value = "x";
      await wait();
      select.value = "";
      await wait();
      const after = Array.from(native.options);
      return {
        mutations,
        same: before.length === after.length && before.every((option, i) => option === after[i]),
      };
    });
    expect(result).toEqual({ mutations: 0, same: true });
  });

  test("changed options are still copied: added, removed and re-labelled", async ({ page }) => {
    await open(page);
    await build(page);
    const texts = await page.evaluate(async () => {
      const wait = () => new Promise((resolve) => setTimeout(resolve, 150));
      const select = document.getElementById("probe-select");
      const native = select?.shadowRoot?.querySelector("select");
      if (!select || !native) throw new Error("no native select");
      const option = document.createElement("option");
      option.value = "y";
      option.textContent = "Y";
      select.append(option);
      await wait();
      const first = select.querySelector("option");
      if (first) first.textContent = "Pick one";
      await wait();
      select.querySelector('option[value="x"]')?.remove();
      await wait();
      return Array.from(native.options).map((entry) => entry.textContent);
    });
    expect(texts).toEqual(["Pick one", "Y"]);
  });
});
