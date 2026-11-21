import type { Page } from "@playwright/test";
import { DESIGNS, SCHEMES, applyAxes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { contrastRatio } from "./contrast";
import { expect, test } from "./fixtures";

const PAGE = "/fixtures/forms.html";

async function open(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(page.locator("idg-field:not(.hydrated), idg-input:not(.hydrated)")).toHaveCount(0);
}

async function formData(page: Page, selector: string) {
  return page.evaluate((query) => {
    const form = document.querySelector<HTMLFormElement>(query);
    if (!form) throw new Error(`no form ${query}`);
    return [...new FormData(form)];
  }, selector);
}

test.describe("form controls hydrate under the strict policy", () => {
  test("every control hydrates", async ({ page }) => {
    await open(page);
    const total = await page
      .locator(
        "idg-field, idg-input, idg-textarea, idg-select, idg-checkbox, idg-switch, idg-radio-group, idg-radio, idg-button, idg-icon",
      )
      .count();
    await expect(page.locator(".hydrated")).toHaveCount(total);
  });
});

test.describe("form values", () => {
  test("FormData holds the values the controls start with", async ({ page }) => {
    await open(page);
    await expect(page.locator("idg-input.hydrated").first()).toBeVisible();
    expect(await formData(page, "#values")).toEqual([
      ["email", "ada@example.com"],
      ["password", "correct horse battery"],
      ["age", "36"],
      ["website", "https://example.com"],
      ["about", "Analyst and engineer."],
      ["plan", "pro"],
      ["billing", "yearly"],
      ["terms", "accepted"],
      ["alerts", "on"],
    ]);
  });

  test("FormData follows what the user does", async ({ page }) => {
    await open(page);
    await page.locator("#email input").fill("grace@example.com");
    await page.locator("#about textarea").fill("Rear admiral");
    await page.locator("#plan select").selectOption("team");
    await page.getByText("Monthly", { exact: true }).first().click();
    await page.getByText("Accept the terms").click();
    await page.getByText("Select all").click();
    await page.getByText("Email alerts").click();
    await expect
      .poll(async () => Object.fromEntries(await formData(page, "#values")))
      .not.toHaveProperty("alerts");
    const entries = Object.fromEntries(await formData(page, "#values"));
    expect(entries).toMatchObject({
      email: "grace@example.com",
      about: "Rear admiral",
      plan: "team",
      billing: "monthly",
      partial: "on",
    });
    expect(entries).not.toHaveProperty("terms");
    expect(entries).not.toHaveProperty("alerts");
  });

  test("the reveal toggle shows the password without changing the value", async ({ page }) => {
    await open(page);
    const input = page.locator("#password input");
    const toggle = page.locator("#password button");
    await expect(input).toHaveAttribute("type", "password");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(input).toHaveValue("correct horse battery");
    expect(Object.fromEntries(await formData(page, "#values"))).toMatchObject({
      password: "correct horse battery",
    });
    await toggle.click();
    await expect(input).toHaveAttribute("type", "password");
  });

  test("reset restores every control", async ({ page }) => {
    await open(page);
    const before = await formData(page, "#values");
    await page.locator("#email input").fill("x@example.com");
    await page.locator("#plan select").selectOption("free");
    await page.getByText("Monthly", { exact: true }).first().click();
    await page.getByText("Accept the terms").click();
    await page.getByText("Email alerts").click();
    await page.locator("idg-button[type=reset]").locator("button").click();
    await expect.poll(() => formData(page, "#values")).toEqual(before);
    await expect(page.locator("#email input")).toHaveValue("ada@example.com");
  });

  test("a disabled control submits nothing and a fieldset disables the controls in it", async ({
    page,
  }) => {
    await open(page);
    const entries = await page.evaluate(async () => {
      const form = document.createElement("form");
      const fieldset = document.createElement("fieldset");
      const input = document.createElement("idg-input");
      input.setAttribute("name", "inside");
      input.setAttribute("value", "x");
      fieldset.append(input);
      form.append(fieldset);
      document.body.append(form);
      await (input as unknown as { componentOnReady: () => Promise<void> }).componentOnReady();
      const before = [...new FormData(form)];
      fieldset.disabled = true;
      return { before, after: [...new FormData(form)] };
    });
    expect(entries.before).toEqual([["inside", "x"]]);
    expect(entries.after).toEqual([]);
  });
});

test.describe("constraint validation", () => {
  test("an empty required form is blocked and focus goes to the first invalid control", async ({
    page,
  }) => {
    await open(page);
    await page.locator("#v-submit").locator("button").click();
    expect(new URL(page.url()).search).toBe("");
    const valid = await page.evaluate(() =>
      document.querySelector<HTMLFormElement>("#validation")?.checkValidity(),
    );
    expect(valid).toBe(false);
    await expect(page.locator("#v-name input")).toBeFocused();
  });

  test("every required control is invalid until it is filled, and a valid one is not", async ({
    page,
  }) => {
    await open(page);
    const invalid = (id: string) =>
      page.locator(`#${id}`).evaluate((element) => element.matches(":invalid"));
    const required = ["v-name", "v-note", "v-pick", "v-choice", "v-agree"];
    for (const id of required) await expect.poll(() => invalid(id), id).toBe(true);
    await page.locator("#v-name input").fill("Ada");
    await page.locator("#v-note textarea").fill("Note");
    await page.locator("#v-pick select").selectOption("a");
    await page.getByText("X", { exact: true }).click();
    await page.getByText("Agree", { exact: true }).click();
    for (const id of required) await expect.poll(() => invalid(id), id).toBe(false);
  });

  test("minlength and pattern are enforced as a native input does", async ({ page }) => {
    await open(page);
    const code = page.locator("#v-code input");
    const invalid = () =>
      page.locator("#v-code").evaluate((element) => element.matches(":invalid"));
    await expect.poll(invalid).toBe(false);
    await code.fill("AB");
    await expect.poll(invalid).toBe(true);
    await code.fill("abcd");
    await expect.poll(invalid).toBe(true);
    await code.fill("ABCD");
    await expect.poll(invalid).toBe(false);
  });

  test("a complete form submits its values", async ({ page }) => {
    await open(page);
    await page.locator("#v-name input").fill("Ada");
    await page.locator("#v-note textarea").fill("Note");
    await page.locator("#v-pick select").selectOption("a");
    await page.getByText("X", { exact: true }).click();
    await page.getByText("Agree", { exact: true }).click();
    await page.locator("#v-submit").locator("button").click();
    await expect(page).toHaveURL(/v-name=Ada&v-code=&v-note=Note&v-pick=a&v-choice=x&v-agree=on/);
  });
});

test.describe("keyboard", () => {
  test("the radio group is one tab stop and arrows move and choose", async ({ page }) => {
    await open(page);
    await page.locator("#empty-contact idg-radio").first().locator("input").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#empty-contact")).toHaveJSProperty("value", "phone");
    await expect(page.locator("#empty-contact idg-radio").nth(1).locator("input")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#empty-contact")).toHaveJSProperty("value", "email");
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#empty-contact")).toHaveJSProperty("value", "phone");
    // The group hands the tab stops to its radios when it next renders, a frame after the value.
    await expect
      .poll(() =>
        page
          .locator("#empty-contact idg-radio input")
          .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).tabIndex)),
      )
      .toEqual([-1, 0]);
  });

  test("a disabled radio is skipped", async ({ page }) => {
    await open(page);
    await page.locator("#billing idg-radio").nth(1).locator("input").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#billing")).toHaveJSProperty("value", "monthly");
  });

  test("space toggles the checkbox and the switch", async ({ page }) => {
    await open(page);
    await page.locator("#empty-check input").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#empty-check")).toHaveJSProperty("checked", true);
    await page.locator("#empty-switch input").focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#empty-switch")).toHaveJSProperty("checked", true);
  });
});

test.describe("events", () => {
  test("idgInput, idgChange, focus and blur reach the host", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const log: string[] = [];
      Object.assign(window, { log });
      const host = document.getElementById("empty-name");
      if (!host) throw new Error("no host");
      for (const type of ["idgInput", "idgChange", "focus", "blur"]) {
        host.addEventListener(type, (event) => {
          const detail = (event as CustomEvent<{ value: string } | undefined>).detail;
          log.push(detail ? `${type}:${detail.value}` : type);
        });
      }
    });
    const input = page.locator("#empty-name input");
    await input.focus();
    await page.keyboard.type("Hi");
    await page.keyboard.press("Tab");
    const log = await page.evaluate(() => (window as unknown as { log: string[] }).log);
    expect(log).toEqual(["focus", "idgInput:H", "idgInput:Hi", "idgChange:Hi", "blur"]);
  });

  test("a checkbox reports idgChange with its state", async ({ page }) => {
    await open(page);
    const detail = page.evaluate(
      () =>
        new Promise((resolve) => {
          document.getElementById("empty-check")?.addEventListener("idgChange", (event) => {
            resolve((event as CustomEvent).detail);
          });
        }),
    );
    await page.getByText("Subscribe").click();
    expect(await detail).toEqual({ checked: true, value: "on" });
  });
});

test.describe("select options", () => {
  test("slotted options are mirrored, and follow later changes", async ({ page }) => {
    await open(page);
    const options = page.locator("#plan select option");
    await expect(options).toHaveText(["Free", "Pro", "Team"]);
    await page.evaluate(() => {
      const option = document.createElement("option");
      option.value = "ent";
      option.textContent = "Enterprise <b>";
      document.getElementById("plan")?.append(option);
    });
    await expect(options).toHaveText(["Free", "Pro", "Team", "Enterprise <b>"]);
    await expect(page.locator("#plan select b")).toHaveCount(0);
    await expect(page.locator("#plan select")).toHaveValue("pro");
  });
});

test.describe("textarea", () => {
  test("grows with its content when autogrow is on", async ({ page }) => {
    await open(page);
    const area = page.locator("#about textarea");
    const before = (await area.boundingBox())?.height ?? 0;
    await area.fill("a\nb\nc\nd\ne\nf\ng\nh");
    await expect.poll(async () => (await area.boundingBox())?.height ?? 0).toBeGreaterThan(before);
  });

  test("shows a live character count", async ({ page }) => {
    await open(page);
    await expect(page.locator("#about .counter")).toHaveText("21 / 120");
    await page.locator("#about textarea").fill("abc");
    await expect(page.locator("#about .counter")).toHaveText("3 / 120");
  });
});

test.describe("boundaries", () => {
  for (const design of ["soft", "elevated"]) {
    for (const scheme of SCHEMES) {
      test(`${design} ${scheme} draws a boundary of at least 3:1 around every control`, async ({
        page,
      }) => {
        await open(page);
        await applyAxes(page, { design, scheme });
        const boundaries = await page.evaluate(() => {
          const page = getComputedStyle(document.documentElement).backgroundColor;
          const targets = [
            "#empty-name .box",
            "#empty-notes .box",
            "#empty-country .box",
            "#empty-check .native",
            "#empty-contact idg-radio .native",
            "#empty-switch .native",
          ];
          return targets.map((target) => {
            const [hostId, ...rest] = target.split(" ");
            const host = document.querySelector(
              (hostId ?? "") + (rest.length > 1 ? " idg-radio" : ""),
            );
            const element =
              host?.shadowRoot?.querySelector(rest[rest.length - 1] ?? "") ??
              host?.querySelector("idg-radio")?.shadowRoot?.querySelector(".native");
            const style = element ? getComputedStyle(element) : undefined;
            return {
              target,
              page,
              shadow: style?.boxShadow ?? "",
              fill: style?.backgroundColor ?? "",
            };
          });
        });
        for (const { target, page: background, shadow } of boundaries) {
          const ring = /rgba?\([^)]*\)/.exec(shadow)?.[0];
          expect(ring, `${target} has an inset ring`).toBeDefined();
          expect(shadow, target).toContain("inset");
          expect(contrastRatio(ring ?? "", background), target).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }

  test("forced colors keep a system-colour border on a borderless design", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await open(page);
    await applyAxes(page, { design: "soft" });
    await expect
      .poll(async () =>
        Number.parseFloat(
          await page
            .locator("#empty-name .box")
            .evaluate((box) => getComputedStyle(box).borderTopWidth),
        ),
      )
      .toBeGreaterThanOrEqual(1);
  });
});

test.describe("sizes", () => {
  for (const design of DESIGNS) {
    test(`${design}: every control target is at least 24px`, async ({ page }) => {
      await open(page);
      await applyAxes(page, { design, ux: "power" });
      const boxes = await page
        .locator(
          "#empty-name .box, #empty-check .choice, #empty-switch .choice, #empty-contact idg-radio .choice",
        )
        .evaluateAll((elements) =>
          elements.map((element) => element.getBoundingClientRect().height),
        );
      for (const height of boxes) expect(height).toBeGreaterThanOrEqual(24);
    });
  }
});

test.describe("the demo page", () => {
  test("hydrates the sign-in form under the strict policy and submits it", async ({ page }) => {
    await page.goto("/csp-demo.html");
    await expect(page.locator("idg-field:not(.hydrated), idg-input:not(.hydrated)")).toHaveCount(0);
    await page.locator("#signin idg-input[type=email] input").fill("ada@example.com");
    await page.locator('#signin idg-input[type="password"] input').fill("correct horse battery");
    await expectNoAxeViolations(page);
    await page.locator("#signin idg-button[type=submit]").locator("button").click();
    await expect(page).toHaveURL(
      /email=ada%40example\.com&password=correct\+horse\+battery&workspace=&second-step=app&note=&remember=on/,
    );
  });
});
