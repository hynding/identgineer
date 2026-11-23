import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  activeName,
  banner,
  bannerButton,
  bannerRegion,
  bannerStatus,
  consentState,
  inlinePanel,
  modalPanel,
  openConsent,
  recordedEvents,
  switchIn,
  trackAndFlush,
} from "./consent-page";

const GRANTED = "idg.tracking.consent.v1";

/** The consent record the tracker keeps, or null. */
const storedConsent = (page: Page) => page.evaluate((key) => localStorage.getItem(key), GRANTED);

test.describe("the consent banner asks, and sends nothing until it is told to", () => {
  test("is a non-modal region, takes no focus, and nothing is sent while it asks", async ({
    page,
  }) => {
    const { collected } = await openConsent(page);
    await expect(bannerRegion(page)).toBeVisible();
    await expect(page.getByRole("region", { name: "Analytics choice" })).toBeVisible();
    expect(await activeName(page)).toBe("body");
    await trackAndFlush(page);
    expect(collected).toHaveLength(0);
    expect(await consentState(page)).toMatchObject({ state: "unknown" });
    expect(await storedConsent(page)).toBeNull();
    // Not a modal: the page behind it is not inert and still takes clicks.
    await expect(page.locator("main")).not.toHaveAttribute("inert", /.*/);
    await page.locator("#before").click();
    expect(await activeName(page)).toBe("Open menu");
  });

  test("Accept analytics grants, confirms it politely and lets the tracker send", async ({
    page,
  }) => {
    const { collected } = await openConsent(page);
    await bannerButton(page, "accept").click();
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect(bannerStatus(page)).toHaveText("Analytics accepted.");
    expect(await consentState(page)).toMatchObject({ state: "granted" });
    await trackAndFlush(page);
    expect(collected.length).toBeGreaterThan(0);
    expect(await recordedEvents(page)).toEqual([
      { type: "idgConsentChange", detail: { state: "granted" } },
    ]);
  });

  test("Decline denies, and no request is made after it, however much is tracked", async ({
    page,
  }) => {
    const { collected } = await openConsent(page);
    await bannerButton(page, "decline").click();
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect(bannerStatus(page)).toHaveText("Analytics declined.");
    expect(await consentState(page)).toMatchObject({ state: "denied" });
    await trackAndFlush(page);
    await page.reload();
    await expect(page.locator("html[data-consent-ready]")).toHaveCount(1);
    await trackAndFlush(page);
    expect(collected).toHaveLength(0);
    await expect(bannerRegion(page)).toHaveCount(0);
  });

  test("a choice is remembered: the banner does not come back after a reload", async ({ page }) => {
    await openConsent(page);
    await bannerButton(page, "accept").click();
    await page.reload();
    await expect(page.locator("html[data-consent-ready]")).toHaveCount(1);
    await expect(bannerRegion(page)).toHaveCount(0);
  });

  test("Escape means no consent: the banner stays and nothing is recorded", async ({ page }) => {
    const { collected } = await openConsent(page);
    await bannerButton(page, "accept").focus();
    await page.keyboard.press("Escape");
    await expect(bannerRegion(page)).toBeVisible();
    expect(await consentState(page)).toMatchObject({ state: "unknown" });
    expect(await storedConsent(page)).toBeNull();
    await trackAndFlush(page);
    expect(collected).toHaveLength(0);
  });
});

test.describe("the consent banner and browser privacy signals", () => {
  test("does not ask under Global Privacy Control, and nothing is sent", async ({ page }) => {
    const { collected } = await openConsent(page, { gpc: true });
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect(banner(page).locator("idg-button")).toHaveCount(0);
    await trackAndFlush(page);
    expect(collected).toHaveLength(0);
    expect(await consentState(page)).toMatchObject({ state: "denied", reason: "gpc" });
  });

  test("says in one polite line that the signal is respected when asked to", async ({ page }) => {
    const { collected } = await openConsent(page, { gpc: true, query: "?announce" });
    const note = banner(page).locator('[part="signal-note"]');
    await expect(note).toContainText("Global Privacy Control");
    await expect(note).toContainText("analytics are off");
    await expect(note).toHaveAttribute("role", "status");
    await trackAndFlush(page);
    expect(collected).toHaveLength(0);
  });

  test("does not ask under Do Not Track either, and names it", async ({ page }) => {
    const { collected } = await openConsent(page, { dnt: true, query: "?announce" });
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect(banner(page).locator('[part="signal-note"]')).toContainText("Do Not Track");
    await trackAndFlush(page);
    expect(collected).toHaveLength(0);
    expect(await consentState(page)).toMatchObject({ state: "denied", reason: "dnt" });
  });

  test("the preferences name the signal, keep analytics off and cannot grant", async ({ page }) => {
    const { collected } = await openConsent(page, { gpc: true });
    const analytics = switchIn(inlinePanel(page), "analytics");
    await expect(analytics).toBeDisabled();
    await expect(analytics).not.toBeChecked();
    await expect(inlinePanel(page).locator('[part="signal"]')).toContainText(
      "Global Privacy Control",
    );
    await inlinePanel(page).locator("idg-button.save button").click();
    expect(await consentState(page)).toMatchObject({ state: "denied", reason: "gpc" });
    await trackAndFlush(page);
    expect(collected).toHaveLength(0);
  });
});

test.describe("the consent banner by keyboard", () => {
  test("Decline, Accept analytics and Choose are the Tab order, with no trap", async ({ page }) => {
    await openConsent(page);
    await expect(page.locator("#policy-link")).toBeVisible();
    await page.locator("#policy-link").focus();
    await expect(page.locator("#policy-link")).toBeFocused();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(page.locator("#policy-link")).toBeFocused();
    const order: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press("Tab");
      order.push(await activeName(page));
    }
    expect(order).toEqual(["Decline", "Accept analytics", "Choose"]);
    await page.keyboard.press("Tab");
    expect(await activeName(page)).not.toBe("Choose");
    await page.keyboard.press("Shift+Tab");
    expect(await activeName(page)).toBe("Choose");
  });

  test("Space and Enter choose, and focus goes back to what had it before the banner", async ({
    page,
  }) => {
    await openConsent(page);
    await page.locator("#before").focus();
    await bannerButton(page, "decline").focus();
    await page.keyboard.press("Enter");
    await expect(bannerRegion(page)).toHaveCount(0);
    expect(await activeName(page)).toBe("Open menu");
    expect(await consentState(page)).toMatchObject({ state: "denied" });
  });

  test("focus goes to the main landmark when nothing had it before, and stays on the page", async ({
    page,
  }) => {
    await openConsent(page);
    await bannerButton(page, "accept").focus();
    await page.keyboard.press("Space");
    await expect(bannerRegion(page)).toHaveCount(0);
    const active = await page.evaluate(() => document.activeElement?.localName);
    expect(active).toBe("main");
    // The landmark keeps no tabindex of the component's once focus leaves it.
    await page.keyboard.press("Tab");
    await expect(page.locator("main")).not.toHaveAttribute("tabindex", /.*/);
  });

  test("the choice is confirmed in a polite live region", async ({ page }) => {
    await openConsent(page);
    await bannerButton(page, "accept").click();
    await expect(bannerStatus(page)).toHaveAttribute("role", "status");
    await expect(bannerStatus(page)).toHaveText("Analytics accepted.");
  });
});

test.describe("the consent banner and the preferences", () => {
  test("Choose opens the modal preferences, which hold focus and give it back on Escape", async ({
    page,
  }) => {
    await openConsent(page);
    await bannerButton(page, "choose").focus();
    await page.keyboard.press("Enter");
    const dialog = modalPanel(page).locator("idg-dialog dialog");
    await expect(dialog).toBeVisible();
    expect(await recordedEvents(page)).toEqual([{ type: "idgConsentChoose", detail: null }]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(await activeName(page)).toBe("Choose");
    expect(await consentState(page)).toMatchObject({ state: "unknown" });
  });

  test("nothing changes until Save, and Save grants what the switch says", async ({ page }) => {
    const { collected } = await openConsent(page);
    const analytics = switchIn(inlinePanel(page), "analytics");
    await expect(analytics).not.toBeChecked();
    await analytics.check();
    expect(await consentState(page)).toMatchObject({ state: "unknown" });
    await trackAndFlush(page);
    expect(collected).toHaveLength(0);
    await inlinePanel(page).locator("idg-button.save button").click();
    expect(await consentState(page)).toMatchObject({ state: "granted" });
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect(inlinePanel(page).locator('[part="status"]')).toHaveText(
      "Preferences saved. Analytics are on.",
    );
  });

  test("Necessary is a plain always-on row, with no control, and its explanation shown", async ({
    page,
  }) => {
    await openConsent(page);
    const panel = inlinePanel(page);
    await expect(panel.locator(".necessary-state")).toHaveText("Always on");
    await expect(panel.locator(".necessary-description")).toContainText("not tracked");
    await expect(panel.locator("idg-switch.necessary")).toHaveCount(0);
    const colours = await panel.locator(".necessary-state").evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: style.opacity, colour: style.color };
    });
    expect(colours.opacity).toBe("1");
  });

  test("Withdraw consent and erase asks inline first, then forgets everything", async ({
    page,
  }) => {
    await openConsent(page, { query: "?granted" });
    let nativeDialogs = 0;
    page.on("dialog", (dialog) => {
      nativeDialogs += 1;
      void dialog.dismiss();
    });
    await inlinePanel(page).locator("idg-button.erase button").click();
    await expect(inlinePanel(page).locator('[part="confirm"]')).toBeVisible();
    expect(await activeName(page)).toBe("Keep my choice");
    expect(await consentState(page)).toMatchObject({ state: "granted" });
    await inlinePanel(page).locator("idg-button.confirm-yes button").click();
    expect(await consentState(page)).toMatchObject({ state: "unknown" });
    expect(await storedConsent(page)).toBeNull();
    await expect(bannerRegion(page)).toBeVisible();
    expect(nativeDialogs).toBe(0);
  });

  test("shows an inline error, not an exception, when the consent object throws", async ({
    page,
  }) => {
    await openConsent(page);
    await page.evaluate(`(() => {
      const broken = { ...window.consentFixture.tracker.consent, deny() { throw new Error("no"); } };
      document.getElementById("banner").consent = broken;
    })()`);
    await bannerButton(page, "decline").click();
    await expect(banner(page).locator('[part="error"]')).toContainText("could not be saved");
    await expect(bannerRegion(page)).toBeVisible();
  });
});

test.describe("the consent components in more than one tab", () => {
  test("a choice in one tab hides the banner in the other, and its preferences follow", async ({
    context,
  }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await openConsent(first);
    await openConsent(second);
    await bannerButton(first, "accept").click();
    await expect(bannerRegion(second)).toHaveCount(0);
    await expect(switchIn(inlinePanel(second), "analytics")).toBeChecked();
  });

  test("a change in another tab drops an unsaved edit and says so", async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await openConsent(first);
    await openConsent(second);
    await switchIn(inlinePanel(second), "analytics").check();
    await first.evaluate(`window.consentFixture.tracker.consent.deny()`);
    await expect(inlinePanel(second).locator('[part="changed"]')).toContainText("discarded");
    await expect(switchIn(inlinePanel(second), "analytics")).not.toBeChecked();
    expect(await consentState(second)).toMatchObject({ state: "denied" });
  });
});

test.describe("the consent banner stays out of the way", () => {
  test("a bottom bar sticks to the bottom of the window and keeps focused content clear of it", async ({
    page,
  }) => {
    await openConsent(page);
    const box = async () => {
      const found = await bannerRegion(page).boundingBox();
      if (!found) throw new Error("the banner is not laid out");
      return found;
    };
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const atTop = await box();
    expect(Math.abs(atTop.y + atTop.height - viewport.height)).toBeLessThan(1.5);
    await page.evaluate(() => {
      window.scrollTo(0, 400);
    });
    const scrolled = await box();
    expect(Math.abs(scrolled.y + scrolled.height - viewport.height)).toBeLessThan(1.5);
    // The root's scroll padding is as tall as the bar, so a focused link is scrolled clear of it.
    const padding = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollPaddingBlockEnd,
    );
    expect(Math.abs(Number.parseFloat(padding) - scrolled.height)).toBeLessThan(1.5);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.locator("#low-link").focus();
    const link = await page.locator("#low-link").boundingBox();
    const bar = await box();
    if (!link) throw new Error("the link is not laid out");
    expect(link.y + link.height).toBeLessThanOrEqual(bar.y + 0.5);
  });

  test("the page's own scroll padding is given back once a choice is made", async ({ page }) => {
    await openConsent(page);
    await bannerButton(page, "decline").click();
    await expect(bannerRegion(page)).toHaveCount(0);
    const padding = await page.evaluate(() => document.documentElement.style.scrollPaddingBlockEnd);
    expect(padding).toBe("");
  });

  test("a top bar sits in the page's flow at the top, scrolls away and reserves nothing", async ({
    page,
  }) => {
    await openConsent(page);
    await banner(page).evaluate((element) => {
      document.body.prepend(element);
      element.setAttribute("placement", "top");
    });
    await expect
      .poll(() => banner(page).evaluate((e) => getComputedStyle(e).position))
      .toBe("static");
    await page.evaluate(() => {
      window.scrollTo(0, 400);
    });
    const box = await bannerRegion(page).boundingBox();
    if (!box) throw new Error("the banner is not laid out");
    expect(box.y + box.height).toBeLessThan(0);
    const padding = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return [style.scrollPaddingBlockStart, style.scrollPaddingBlockEnd];
    });
    expect(padding.map((value) => Number.parseFloat(value) || 0)).toEqual([0, 0]);
  });

  test("a bottom bar adds to the scroll padding a stylesheet gives the page, and gives it back", async ({
    page,
  }) => {
    await openConsent(page, { query: "?stylesheet-padding" });
    const bar = (await bannerRegion(page).boundingBox())?.height ?? 0;
    const padding = () =>
      page.evaluate(() =>
        Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockEnd),
      );
    expect(Math.abs((await padding()) - (30 + bar))).toBeLessThan(1.5);
    await page.setViewportSize({ width: 500, height: 700 });
    await expect
      .poll(async () =>
        Math.abs(
          (await padding()) - (30 + ((await bannerRegion(page).boundingBox())?.height ?? 0)),
        ),
      )
      .toBeLessThan(1.5);
    await bannerButton(page, "decline").click();
    await expect(bannerRegion(page)).toHaveCount(0);
    expect(await padding()).toBe(30);
  });

  test("a bottom bar adds to an inline scroll padding too", async ({ page }) => {
    await openConsent(page, { query: "?inline-padding" });
    const bar = (await bannerRegion(page).boundingBox())?.height ?? 0;
    const padding = await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingBlockEnd),
    );
    expect(Math.abs(padding - (12 + bar))).toBeLessThan(1.5);
    await bannerButton(page, "decline").click();
    await expect(bannerRegion(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.style.scrollPaddingBlockEnd)).toBe(
      "12px",
    );
  });

  test("an inline banner is in the page's flow and reserves nothing", async ({ page }) => {
    await openConsent(page);
    await banner(page).evaluate((element) => {
      element.setAttribute("placement", "inline");
    });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.scrollPaddingBlockEnd))
      .toBe("");
    const position = await banner(page).evaluate((element) => getComputedStyle(element).position);
    expect(position).toBe("static");
  });

  test("moved elsewhere in the page, it still works and speaks once", async ({ page }) => {
    await openConsent(page);
    await page.evaluate(() => {
      const target = document.getElementById("move-target");
      const element = document.getElementById("banner");
      if (target && element) target.append(element);
    });
    await expect(bannerRegion(page)).toBeVisible();
    await bannerButton(page, "decline").click();
    expect(await recordedEvents(page)).toEqual([
      { type: "idgConsentChange", detail: { state: "denied" } },
    ]);
  });

  test("a consent object taken away leaves nothing behind, and its space is given back", async ({
    page,
  }) => {
    await openConsent(page);
    await banner(page).evaluate((element) => {
      (element as unknown as { consent?: unknown }).consent = undefined;
    });
    await expect(bannerRegion(page)).toHaveCount(0);
    const padding = await page.evaluate(() => document.documentElement.style.scrollPaddingBlockEnd);
    expect(padding).toBe("");
  });
});

test.describe("focus is never dropped on the body", () => {
  const onPage = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      let element: Element | null = document.activeElement;
      while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
      return element !== null && element !== document.body && element !== document.documentElement;
    });

  test("Save in the modal preferences opened from Choose, whose opener goes with the banner", async ({
    page,
  }) => {
    await openConsent(page);
    await page.locator("#before").focus();
    await bannerButton(page, "choose").focus();
    await page.keyboard.press("Enter");
    await expect(modalPanel(page).locator("idg-dialog dialog")).toBeVisible();
    await switchIn(modalPanel(page), "analytics").check();
    await modalPanel(page).locator("idg-button.save button").click();
    await expect(modalPanel(page).locator("idg-dialog dialog")).toBeHidden();
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect.poll(() => onPage(page)).toBe(true);
    expect(await consentState(page)).toMatchObject({ state: "granted" });
  });

  test("Save in a panel that sits in the banner's own slot", async ({ page }) => {
    await openConsent(page);
    await page.evaluate(() => {
      const panel = document.createElement("idg-consent-preferences");
      panel.setAttribute("slot", "preferences");
      (panel as unknown as { consent: unknown }).consent = (
        window as unknown as { consentFixture: { tracker: { consent: unknown } } }
      ).consentFixture.tracker.consent;
      document.getElementById("banner")?.append(panel);
    });
    await page.locator("#before").focus();
    await bannerButton(page, "choose").click();
    const slotted = banner(page).locator("idg-consent-preferences");
    await expect(slotted.locator("idg-button.save button")).toBeVisible();
    await slotted.locator("idg-button.save button").click();
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect.poll(() => onPage(page)).toBe(true);
  });

  test("the choice is made elsewhere while a banner button has focus: focus goes back, not to the body", async ({
    page,
  }) => {
    await openConsent(page);
    await page.locator("#before").focus();
    await bannerButton(page, "decline").focus();
    await page.evaluate(`window.consentFixture.tracker.consent.grant()`);
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect.poll(() => activeName(page)).toBe("Open menu");
  });

  test("the choice is made elsewhere while nothing was focused before the banner: focus goes to main", async ({
    page,
  }) => {
    await openConsent(page);
    await bannerButton(page, "accept").focus();
    await page.evaluate(`window.consentFixture.tracker.consent.deny()`);
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement?.localName)).toBe("main");
  });

  test("focus is not taken from a field the visitor is typing in when the choice is made elsewhere", async ({
    page,
  }) => {
    await openConsent(page);
    await page.evaluate(() => {
      const field = document.createElement("input");
      field.id = "typing";
      document.querySelector("main")?.append(field);
    });
    await page.locator("#typing").focus();
    await page.keyboard.type("abc");
    await page.evaluate(`window.consentFixture.tracker.consent.grant()`);
    await expect(bannerRegion(page)).toHaveCount(0);
    await expect(page.locator("#typing")).toBeFocused();
    await page.keyboard.type("d");
    await expect(page.locator("#typing")).toHaveValue("abcd");
  });

  test("the banner is left by the visitor to something else, and a later change elsewhere does not pull focus back", async ({
    page,
  }) => {
    await openConsent(page);
    await bannerButton(page, "decline").focus();
    await page.locator("#before").focus();
    await page.evaluate(`window.consentFixture.tracker.consent.grant()`);
    await expect(bannerRegion(page)).toHaveCount(0);
    expect(await activeName(page)).toBe("Open menu");
  });

  test("the choice changes elsewhere while the erase confirmation has focus", async ({ page }) => {
    await openConsent(page, { query: "?granted" });
    await inlinePanel(page).locator("idg-button.erase button").click();
    await expect(inlinePanel(page).locator("idg-button.confirm-no button")).toBeFocused();
    await page.evaluate(() => {
      (
        window as unknown as { consentFixture: { tracker: { consent: { deny: () => boolean } } } }
      ).consentFixture.tracker.consent.deny();
    });
    await expect(inlinePanel(page).locator('[part="confirm"]')).toHaveCount(0);
    await expect.poll(() => activeName(page)).toBe("Withdraw consent and erase");
    await expect(inlinePanel(page).locator('[part="status"]')).toContainText("changed elsewhere");
  });
});

test.describe("a double press", () => {
  test("on Accept analytics grants once, tells the page once and announces once", async ({
    page,
  }) => {
    await openConsent(page);
    await bannerButton(page, "accept").dblclick();
    await expect(bannerRegion(page)).toHaveCount(0);
    expect(await recordedEvents(page)).toEqual([
      { type: "idgConsentChange", detail: { state: "granted" } },
    ]);
    await expect(banner(page).locator('[part="status"]')).toContainText("Analytics accepted");
  });
});

test.describe("printing", () => {
  test("the banner is not printed", async ({ page }) => {
    await openConsent(page);
    await expect(bannerRegion(page)).toBeVisible();
    await page.emulateMedia({ media: "print" });
    expect(await banner(page).evaluate((element) => getComputedStyle(element).display)).toBe(
      "none",
    );
    await expect(bannerRegion(page)).toBeHidden();
  });
});
