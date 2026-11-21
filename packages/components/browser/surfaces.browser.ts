import type { Page } from "@playwright/test";
import { DESIGNS, SCHEMES, THEMES, UX_MODES, applyAxes } from "./axes";
import { accessibleDescendants, accessibleNode } from "./accessible-node";
import { expectNoAxeViolations } from "./accessibility";
import { contrastRatio } from "./contrast";
import { expect, test } from "./fixtures";

const PAGE = "/fixtures/surfaces.html";

async function open(page: Page): Promise<void> {
  await page.goto(PAGE);
  await expect(
    page.locator(
      "idg-icon:not(.hydrated), idg-link:not(.hydrated), idg-card:not(.hydrated), idg-badge:not(.hydrated), idg-avatar:not(.hydrated), idg-avatar-group:not(.hydrated), idg-alert:not(.hydrated), idg-progress:not(.hydrated), idg-skeleton:not(.hydrated), idg-stat:not(.hydrated), idg-divider:not(.hydrated), idg-button:not(.hydrated)",
    ),
  ).toHaveCount(0);
}

test.describe("surface components hydrate under the strict policy", () => {
  test("every component hydrates and draws", async ({ page }) => {
    await open(page);
    const total = await page
      .locator(
        "idg-icon, idg-link, idg-card, idg-badge, idg-avatar, idg-avatar-group, idg-alert, idg-progress, idg-skeleton, idg-stat, idg-divider, idg-button",
      )
      .count();
    await expect(page.locator(".hydrated")).toHaveCount(total);
    for (const selector of ["#card-plain", "#info-alert", "#progress-upload", "#stat-up"]) {
      const box = await page.locator(selector).boundingBox();
      expect(box?.height, selector).toBeGreaterThan(16);
    }
  });

  test("the icons draw as svg paths", async ({ page }) => {
    await open(page);
    const drawn = await page
      .locator("#icons .swatch idg-icon")
      .evaluateAll((icons) =>
        icons.map((icon) => icon.shadowRoot?.querySelectorAll("svg path").length ?? 0),
      );
    expect(drawn).toHaveLength(37);
    expect(drawn.every((count) => count > 0)).toBe(true);
  });
});

test.describe("idg-card", () => {
  test("a linked card exposes exactly one link, the heading's, in the accessibility tree", async ({
    page,
  }) => {
    await open(page);
    const roles = async (role: string) =>
      (await accessibleDescendants(page, "card-linked")).filter((node) => node.role === role);
    await expect.poll(() => roles("link")).toEqual([{ role: "link", name: "One link" }]);
    await expect.poll(() => roles("heading")).toHaveLength(1);
    await expect.poll(() => roles("button")).toEqual([{ role: "button", name: "Share" }]);
  });

  test("a card whose link was unsafe exposes no link", async ({ page }) => {
    await open(page);
    const roles = async (role: string) =>
      (await accessibleDescendants(page, "card-unsafe")).filter((node) => node.role === role);
    // The heading is there first, so the tree is complete when no link is found.
    await expect.poll(() => roles("heading")).toHaveLength(1);
    expect(await roles("link")).toEqual([]);
  });

  test("a click anywhere on a linked card follows the heading's link", async ({ page }) => {
    await open(page);
    const card = page.locator("#card-linked");
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    if (!box) throw new Error("no card");
    await page.mouse.click(box.x + box.width - 8, box.y + 24);
    await expect(page).toHaveURL(/#linked$/);
  });

  test("the footer's controls stay clickable above the stretched link", async ({ page }) => {
    await open(page);
    await page.locator("#card-footer-button").locator("button").click();
    expect(new URL(page.url()).hash).toBe("");
  });

  test("keyboard focus on the link rings the whole card", async ({ page }) => {
    await open(page);
    await page.locator("#card-linked").locator("a").focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const ring = await page.locator("#card-linked").evaluate((host) => {
      const card = host.shadowRoot?.querySelector(".card");
      return card ? getComputedStyle(card).outlineStyle : "";
    });
    expect(ring).not.toBe("none");
  });

  test("hovering an interactive card lifts it by the UX mode's lift and not at all when movement is off", async ({
    page,
  }) => {
    await open(page);
    const lift = async (ux: string) => {
      await applyAxes(page, { design: "flat", ux });
      await page.locator("#card-interactive").hover();
      await page.waitForTimeout(400);
      return page.locator("#card-interactive").evaluate((host) => {
        const card = host.shadowRoot?.querySelector(".card");
        return card ? getComputedStyle(card).transform : "";
      });
    };
    expect(await lift("playful")).toMatch(/matrix\(1, 0, 0, 1, 0, -\d/);
    expect(await lift("calm")).toMatch(/^none$|matrix\(1, 0, 0, 1, 0, -?0\)/);
  });

  test("a card of every design draws a surface of its own", async ({ page }) => {
    await open(page);
    const signatures = new Set<string>();
    for (const design of DESIGNS) {
      await applyAxes(page, { design });
      const signature = await page.locator("#card-plain").evaluate((host) => {
        const style = getComputedStyle(host.shadowRoot?.querySelector(".card") ?? host);
        return [
          style.borderTopStyle,
          style.borderTopWidth,
          style.borderBottomWidth,
          style.borderTopLeftRadius,
          style.boxShadow,
          style.backdropFilter,
        ].join(" | ");
      });
      signatures.add(signature);
    }
    expect(signatures.size).toBe(DESIGNS.length);
  });
});

test.describe("idg-avatar", () => {
  test("shows the picture when it loads", async ({ page }) => {
    await open(page);
    const image = page.locator("#avatar-picture").locator("img");
    await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect(image).toHaveAttribute("loading", "lazy");
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
  });

  test("falls back to the initials when the image fails", async ({ page }) => {
    await open(page);
    const avatar = page.locator("#avatar-broken");
    await expect(avatar.locator(".initials")).toHaveText("GH");
    await expect(avatar.locator("img")).toHaveCount(0);
    await expect
      .poll(() => accessibleNode(page, "avatar-broken", '[part="avatar"]'))
      .toMatchObject({ role: "image", name: "Grace Hopper" });
  });

  test("never loads an unsafe source", async ({ page }) => {
    await open(page);
    const avatar = page.locator("#avatar-unsafe");
    await expect(avatar.locator("img")).toHaveCount(0);
    await expect(avatar.locator(".initials")).toHaveText("AT");
  });

  test("a group counts the avatars past its limit and hides them", async ({ page }) => {
    await open(page);
    const group = page.locator("#avatar-group");
    await expect(group.locator('[part="more"]')).toHaveText("+2");
    const hidden = await group
      .locator("idg-avatar")
      .evaluateAll((avatars) => avatars.map((avatar) => avatar.hasAttribute("hidden")));
    expect(hidden).toEqual([false, false, false, true, true]);
    await expect
      .poll(() => accessibleNode(page, "avatar-group", '[part="more"]'))
      .toMatchObject({ role: "image", name: "2 more" });
  });
});

test.describe("idg-alert", () => {
  test("announces by variant: a danger alert interrupts and an info alert waits", async ({
    page,
  }) => {
    await open(page);
    await expect
      .poll(() => accessibleNode(page, "dismissible-alert", '[part="alert"]'))
      .toMatchObject({
        role: "alert",
      });
    await expect
      .poll(() => accessibleNode(page, "info-alert", '[part="alert"]'))
      .toMatchObject({
        role: "status",
      });
  });

  test("dismissing emits idgDismiss and hides the alert", async ({ page }) => {
    await open(page);
    const received = await page.evaluate(() => {
      const alert = document.querySelector("#dismissible-alert");
      let count = 0;
      alert?.addEventListener("idgDismiss", () => (count += 1));
      alert?.shadowRoot?.querySelector<HTMLElement>('button[part="dismiss"]')?.click();
      return count;
    });
    expect(received).toBe(1);
    await expect(page.locator("#dismissible-alert")).toBeHidden();
  });

  test("the dismiss button is a named button", async ({ page }) => {
    await open(page);
    await expect
      .poll(() => accessibleNode(page, "dismissible-alert", "button"))
      .toMatchObject({
        role: "button",
        name: "Dismiss",
      });
  });
});

test.describe("idg-progress, idg-skeleton and idg-stat", () => {
  test("progress is a named progress bar with its value, or none while indeterminate", async ({
    page,
  }) => {
    await open(page);
    await expect
      .poll(() => accessibleNode(page, "progress-upload", "progress"))
      .toMatchObject({
        role: "progressbar",
        name: "Uploading",
        properties: { valuemin: 0, valuemax: 100 },
        value: 40,
      });
    await expect
      .poll(() => accessibleNode(page, "progress-syncing", "progress"))
      .toMatchObject({ role: "progressbar", name: "Syncing", value: undefined });
  });

  test("a skeleton is left out of the accessibility tree", async ({ page }) => {
    await open(page);
    await expect.poll(() => accessibleDescendants(page, "skeleton-text")).toEqual([]);
    await expect
      .poll(
        async () =>
          new Set(
            (await accessibleDescendants(page, "loading-region"))
              .map((node) => node.name)
              .filter(Boolean),
          ),
      )
      .toEqual(new Set(["Loading profile"]));
  });

  test("a skeleton shimmers only where movement is on", async ({ page }) => {
    await open(page);
    const gradient = () =>
      page.locator("#skeleton-text").evaluate((host) => {
        const shape = host.shadowRoot?.querySelector(".shape");
        const style = shape ? getComputedStyle(shape) : undefined;
        return { image: style?.backgroundImage ?? "", animation: style?.animationName ?? "" };
      });
    const colours = (image: string) => image.match(/(?:rgba?|color)\([^)]*\)/g) ?? [];

    await applyAxes(page, { ux: "comfortable" });
    const moving = await gradient();
    expect(moving.animation).not.toBe("none");
    expect(new Set(colours(moving.image)).size).toBeGreaterThan(1);

    await applyAxes(page, { ux: "calm" });
    const still = await gradient();
    expect(colours(still.image).length).toBeGreaterThan(0);
    expect(new Set(colours(still.image)).size).toBe(1);
  });

  test("progress does not animate for a user who prefers reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const animation = await page
      .locator("#progress-syncing")
      .evaluate(
        (host) =>
          getComputedStyle(host.shadowRoot?.querySelector("progress") ?? host).animationName,
      );
    expect(animation).toBe("none");
  });

  test("a change is spoken with its direction, and the visible text is hidden from the reader", async ({
    page,
  }) => {
    await open(page);
    const up = await page.locator("#stat-up").ariaSnapshot();
    expect(up).toContain("Increased by 12.4%");
    const down = await page.locator("#stat-down").ariaSnapshot();
    expect(down).toContain("Decreased by 3.0%");
    // The spoken change is there first, so the tree is complete when the visible one is not found.
    const nodes = () => accessibleDescendants(page, "stat-up");
    await expect
      .poll(async () => (await nodes()).some((node) => node.name.includes("Increased by 12.4%")))
      .toBe(true);
    expect((await nodes()).filter((node) => node.name === "12.4%")).toEqual([]);
  });
});

test.describe("idg-link", () => {
  test("an external link opens a new tab without the opener and names its indicator", async ({
    page,
  }) => {
    await open(page);
    const anchor = page.locator("#external-link").locator("a");
    await expect(anchor).toHaveAttribute("target", "_blank");
    await expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
    await expect
      .poll(async () =>
        (await accessibleDescendants(page, "external-link")).some(
          (node) => node.role === "image" && node.name === "External link",
        ),
      )
      .toBe(true);
  });

  test("an unsafe link renders inert", async ({ page }) => {
    await open(page);
    const anchor = page.locator("#unsafe-link").locator("a");
    await expect(anchor).not.toHaveAttribute("href", /.*/);
    await expect(anchor).toHaveAttribute("aria-disabled", "true");
  });
});

// The text pair of every badge, alert, avatar and change in every theme and scheme, taken from what
// the browser computes, so a token that fell below 4.5:1 or a rule that read the wrong one fails.
test.describe("text contrast", () => {
  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      test(`badges, alerts, avatars and changes in ${theme} ${scheme} are at least 4.5:1`, async ({
        page,
      }) => {
        await open(page);
        await applyAxes(page, { theme, scheme });
        const measured = await page.evaluate(() => {
          const read = (selector: string, part: string) =>
            [...document.querySelectorAll(selector)].flatMap((host) => {
              const element = host.shadowRoot?.querySelector(part);
              if (!element) return [];
              const style = getComputedStyle(element);
              return [
                {
                  host: host.id || host.tagName,
                  color: style.color,
                  background: style.backgroundColor,
                },
              ];
            });
          return [
            ...read("idg-badge", '[part="badge"]'),
            ...read("idg-alert", '[part="alert"]'),
            ...read("idg-avatar", '[part="avatar"]'),
            ...read("idg-stat", '[part="delta"]'),
          ];
        });
        expect(measured.length).toBeGreaterThan(40);
        for (const { host, color, background } of measured) {
          expect(
            contrastRatio(color, background),
            `${host} ${color} on ${background}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});

test.describe("accessibility", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await open(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await open(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }
});
