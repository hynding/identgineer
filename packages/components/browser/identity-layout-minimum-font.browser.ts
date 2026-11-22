import { existsSync } from "node:fs";
import { settle } from "./axes";
import { expect, test } from "./fixtures";

// A browser minimum font size (a user setting) enlarges any text set smaller than it: the line
// that gives the identity forms their preferred width must keep that width and no height.
const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath =
  process.env.IDG_CHROMIUM_PATH ?? (existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined);

test.use({
  launchOptions: {
    ...(executablePath === undefined ? {} : { executablePath }),
    args: ["--blink-settings=minimumFontSize=24,minimumLogicalFontSize=24"],
  },
});

const FORMS = "idg-sign-in, idg-register, idg-password-reset";

test("identity forms keep the measure as their width and gain no height under a minimum font size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/fixtures/identity-layout.html");
  await expect(page.locator("html[data-identity-ready]")).toHaveCount(1);
  await expect(page.locator(`:is(${FORMS}):not(.hydrated)`)).toHaveCount(0);
  await page.evaluate(() => {
    (document.getElementById("dialog") as HTMLDialogElement).showModal();
    document.getElementById("popover")?.showPopover();
  });
  await settle(page);
  const forms = await page.evaluate((selector) => {
    const probe = document.createElement("div");
    probe.style.inlineSize = "var(--idg-identity-measure, var(--idg-size-m))";
    probe.style.position = "absolute";
    document.body.append(probe);
    const measure = probe.getBoundingClientRect().width;
    probe.remove();
    return Array.from(document.querySelectorAll(selector), (form) => {
      const content = form.shadowRoot?.querySelector(".identity")?.getBoundingClientRect();
      const box = form.getBoundingClientRect();
      return {
        name: `${form.closest("[data-case]")?.getAttribute("data-case") ?? "?"} ${form.localName}`,
        width: box.width,
        extraHeight: box.height - (content?.height ?? 0),
        measure,
      };
    });
  }, FORMS);
  expect(forms).toHaveLength(6);
  for (const form of forms) {
    expect(Math.abs(form.width - form.measure), form.name).toBeLessThanOrEqual(form.measure * 0.02);
    expect(form.extraHeight, form.name).toBe(0);
  }
});
