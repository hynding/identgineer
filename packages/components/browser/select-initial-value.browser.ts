import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// A page that sets a value before it has its options (a list that arrives later) must keep it.
async function open(page: Page): Promise<void> {
  await page.goto("/fixtures/forms.html");
  await expect(page.locator("idg-select:not(.hydrated)")).toHaveCount(0);
}

async function build(
  page: Page,
  steps: { value?: string; before?: boolean; options: string[] },
): Promise<{ value: string; native: string; form: string }> {
  return page.evaluate(async ({ value, before, options }) => {
    const select = document.createElement("idg-select") as HTMLElement & { value: string };
    const form = document.createElement("form");
    select.setAttribute("name", "choice");
    if (value !== undefined && before) select.value = value;
    form.append(select);
    document.body.append(form);
    await customElements.whenDefined("idg-select");
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (value !== undefined && !before) select.value = value;
    for (const text of options) {
      const option = document.createElement("option");
      option.value = text;
      option.textContent = text;
      select.append(option);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const native = select.shadowRoot?.querySelector("select")?.value ?? "none";
    return {
      value: select.value,
      native,
      form: String(new FormData(form).get("choice")),
    };
  }, steps);
}

test.describe("idg-select and a value it is given before its options", () => {
  test("keeps a value set before the options arrive, and shows it", async ({ page }) => {
    await open(page);
    expect(await build(page, { value: "b", before: true, options: ["a", "b", "c"] })).toEqual({
      value: "b",
      native: "b",
      form: "b",
    });
  });

  test("keeps a value set after the select is drawn and before its options arrive", async ({
    page,
  }) => {
    await open(page);
    expect(await build(page, { value: "c", before: false, options: ["a", "b", "c"] })).toEqual({
      value: "c",
      native: "c",
      form: "c",
    });
  });

  test("still takes the first option when no value is given", async ({ page }) => {
    await open(page);
    expect(await build(page, { options: ["a", "b", "c"] })).toEqual({
      value: "a",
      native: "a",
      form: "a",
    });
  });

  test("a value that matches none of the options stays the value and the first option is shown", async ({
    page,
  }) => {
    await open(page);
    const result = await build(page, { value: "zzz", before: true, options: ["a", "b"] });
    expect(result.value).toBe("zzz");
    expect(result.native).toBe("a");
  });
});

test.describe("idg-property-picker and the value it is given with its properties", () => {
  for (const order of ["value first", "properties first", "together after drawing"] as const) {
    test(`shows the chosen property when set ${order}`, async ({ page }) => {
      await page.goto("/fixtures/dashboard.html");
      await expect(page.locator("html[data-dashboard-ready]")).toHaveCount(1);
      const shown = await page.evaluate(async (how) => {
        const picker = document.createElement("idg-property-picker") as HTMLElement & {
          value: string;
          properties: { id: string; name: string }[];
        };
        const properties = [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
          { id: "c", name: "C" },
        ];
        if (how === "value first") {
          picker.value = "c";
          picker.properties = properties;
        } else if (how === "properties first") {
          picker.properties = properties;
          picker.value = "c";
        }
        document.body.append(picker);
        await customElements.whenDefined("idg-property-picker");
        if (how === "together after drawing") {
          await new Promise((resolve) => setTimeout(resolve, 100));
          picker.properties = properties;
          picker.value = "c";
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        const select = picker.shadowRoot
          ?.querySelector("idg-select")
          ?.shadowRoot?.querySelector("select");
        return { value: picker.value, native: select?.value };
      }, order);
      expect(shown).toEqual({ value: "c", native: "c" });
    });
  }
});
