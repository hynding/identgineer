import { expect, test } from "./fixtures";
import { frames, openShell } from "./layout-shell-page";

// Headless Chromium hides scrollbars by default, which hides what a long navigation costs a bar.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("a navigation that scrolls along the top bar, scrollbar included, fits in the bar", async ({
  page,
}) => {
  await openShell(page, { width: 1280, layout: "top-bar" });
  await page.evaluate(() => {
    const host = document.getElementById("shell");
    for (let index = 0; index < 20; index += 1) {
      const link = document.createElement("a");
      link.slot = "navigation";
      link.href = `#item-${String(index)}`;
      link.textContent = `Item ${String(index)}`;
      host?.append(link);
    }
  });
  await frames(page, 3);
  const fit = await page.locator("#shell").evaluate((host) => {
    const navigation = host.shadowRoot?.querySelector<HTMLElement>('[part="navigation"]');
    const header = host.shadowRoot?.querySelector<HTMLElement>('[part="header"]');
    if (!navigation || !header) throw new Error("missing");
    return {
      scrolls: navigation.scrollWidth - navigation.clientWidth,
      scrollbar: navigation.offsetHeight - navigation.clientHeight,
      over: navigation.getBoundingClientRect().height - header.getBoundingClientRect().height,
    };
  });
  expect(fit.scrolls, "the navigation scrolls").toBeGreaterThan(0);
  expect(fit.scrollbar, "the scrollbar is drawn").toBeGreaterThan(0);
  expect(fit.over, "the navigation is taller than the bar").toBeLessThanOrEqual(0);
});
