import type { Page } from "@playwright/test";
import { accessibleNode } from "./accessible-node";
import { DESIGNS, SCHEMES, UX_MODES, applyAxes, settle } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { expect, test } from "./fixtures";
import { events, focusIsWithin, focusedId, openOverlays, recordEvents, wire } from "./overlay-page";

// The host's own dialog, not the one of a dialog nested in its content.
const dialog = (page: Page, id: string) => page.locator(`#${id}`).locator("dialog").first();

async function openWithClick(page: Page, triggerId: string, dialogId: string): Promise<void> {
  await wire(page, triggerId, dialogId, "showModal");
  await page.locator(`#${triggerId}`).click();
  await expect(dialog(page, dialogId)).toBeVisible();
}

test.describe("idg-dialog semantics", () => {
  test("a modal dialog is in the top layer and named by its heading across the shadow boundary", async ({
    page,
  }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "basic");
    expect(await dialog(page, "basic").evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect
      .poll(() => accessibleNode(page, "basic", "dialog"))
      .toMatchObject({
        role: "dialog",
        name: "Invite teammates",
      });
  });

  test("an alert dialog is an alertdialog named by its heading and described by its body", async ({
    page,
  }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "confirm");
    await expect
      .poll(() => accessibleNode(page, "confirm", "dialog"))
      .toMatchObject({
        role: "alertdialog",
        name: "Delete project?",
        description: "Atlas and its 14 files are deleted for everyone. This cannot be undone.",
      });
  });

  test("the close button is a named button at least 24px square", async ({ page }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "basic");
    await expect
      .poll(() => accessibleNode(page, "basic", '[part="close"]'))
      .toMatchObject({
        role: "button",
        name: "Close",
      });
    const box = await page.locator("#basic").locator('[part="close"]').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  });
});

test.describe("idg-dialog focus", () => {
  test("goes to the first focusable element, and back to the invoker on close", async ({
    page,
  }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "basic");
    expect(await focusIsWithin(page, "basic")).toBe(true);
    expect(
      await page
        .locator("#basic")
        .locator('[part="close"]')
        .evaluate((button) => {
          return (
            button.getRootNode() instanceof ShadowRoot &&
            (button.getRootNode() as ShadowRoot).activeElement === button
          );
        }),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog(page, "basic")).toBeHidden();
    expect(await focusedId(page)).toBe("open-basic");
  });

  test("goes to the element marked autofocus in slotted content", async ({ page }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "rename");
    await expect(page.locator("#rename-input input")).toBeFocused();
  });

  test("goes to the dialog itself when nothing in it can take focus", async ({ page }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "quiet");
    expect(
      await dialog(page, "quiet").evaluate(
        (element) => (element.getRootNode() as ShadowRoot).activeElement === element,
      ),
    ).toBe(true);
  });

  test("returns to an invoker inside another shadow root", async ({ page }) => {
    await openOverlays(page);
    await wire(page, "shadow-invoker", "rename", "showModal");
    await page.locator("#shadow-invoker").click();
    await expect(page.locator("#rename-input input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page, "rename")).toBeHidden();
    await expect(page.locator("#shadow-invoker button")).toBeFocused();
  });

  test("falls back to a neighbour, not the body, when the invoker was removed", async ({
    page,
  }) => {
    await openOverlays(page);
    await openWithClick(page, "removable", "basic");
    await page.evaluate(() => document.getElementById("removable")?.remove());
    await page.keyboard.press("Escape");
    await expect(dialog(page, "basic")).toBeHidden();
    expect(await focusedId(page)).toBe("before");
  });

  test("stacks nested dialogs and unwinds them one at a time", async ({ page }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "outer");
    await wire(page, "open-inner", "inner", "showModal");
    await page.locator("#open-inner").click();
    await expect(dialog(page, "inner")).toBeVisible();
    expect(await focusIsWithin(page, "inner")).toBe(true);
    // The outer dialog is now behind the inner one and cannot be reached.
    expect(await dialog(page, "outer").evaluate((element) => element.matches(":modal"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog(page, "inner")).toBeHidden();
    await expect(dialog(page, "outer")).toBeVisible();
    expect(await focusedId(page)).toBe("open-inner");
    await page.keyboard.press("Escape");
    await expect(dialog(page, "outer")).toBeHidden();
    expect(await focusedId(page)).toBe("open-basic");
  });
});

test.describe("idg-dialog closed over a nested dialog or moved while open", () => {
  /** Whether any dialog in the page, in any shadow tree, is still modal. */
  const anyModal = (page: Page) =>
    page.evaluate(() => {
      const roots: (Document | ShadowRoot)[] = [document];
      for (const root of roots) {
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) roots.push(element.shadowRoot);
        }
      }
      return roots.some((root) => root.querySelector("dialog:modal") !== null);
    });

  test("closing the outer dialog closes the nested one too and frees the page", async ({
    page,
  }) => {
    await openOverlays(page);
    await recordEvents(page, "inner", ["idgClose"]);
    await openWithClick(page, "open-basic", "outer");
    await wire(page, "open-inner", "inner", "showModal");
    await page.locator("#open-inner").click();
    await expect(dialog(page, "inner")).toBeVisible();
    await page.evaluate(() =>
      (document.getElementById("outer") as unknown as { close: () => Promise<void> }).close(),
    );
    await expect(dialog(page, "outer")).toBeHidden();
    await expect.poll(() => anyModal(page)).toBe(false);
    expect(await events(page, "inner")).toEqual([
      { type: "idgClose", detail: { returnValue: "", reason: "method" } },
    ]);
    await page.locator("#after").click();
    expect(await focusedId(page)).toBe("after");
  });

  test("a modal dialog moved while open closes, reports it, and opens as a modal again", async ({
    page,
  }) => {
    await openOverlays(page);
    await recordEvents(page, "basic", ["idgClose"]);
    await openWithClick(page, "open-basic", "basic");
    await page.evaluate(() => {
      const host = document.getElementById("basic");
      if (host) document.body.append(host);
    });
    await expect.poll(() => anyModal(page)).toBe(false);
    await expect(page.locator("#basic")).not.toHaveAttribute("open");
    expect(await events(page, "basic")).toEqual([
      { type: "idgClose", detail: { returnValue: "", reason: "method" } },
    ]);
    await page.evaluate(() =>
      (
        document.getElementById("basic") as unknown as { showModal: () => Promise<void> }
      ).showModal(),
    );
    await expect(dialog(page, "basic")).toBeVisible();
    expect(await dialog(page, "basic").evaluate((element) => element.matches(":modal"))).toBe(true);
  });

  for (const [label, sequence] of [
    ["moved and opened again", "move"],
    ["closed and opened again", "toggle"],
  ] as const) {
    test(`a modal dialog ${label} in the same task stays open, with one close reported`, async ({
      page,
    }) => {
      await openOverlays(page);
      await openWithClick(page, "open-basic", "basic");
      await recordEvents(page, "basic", ["idgClose"]);
      await page.evaluate((kind) => {
        const host = document.getElementById("basic") as unknown as HTMLElement & {
          open: boolean;
          showModal: () => Promise<void>;
        };
        const native = host.shadowRoot?.querySelector("dialog");
        const scope = window as unknown as { nativeClosed?: Promise<unknown> };
        scope.nativeClosed = new Promise((resolve) => {
          native?.addEventListener("close", resolve, { once: true });
        });
        if (kind === "move") {
          host.remove();
          document.body.append(host);
          void host.showModal();
        } else {
          host.open = false;
          host.open = true;
        }
      }, sequence);
      await expect(dialog(page, "basic")).toBeVisible();
      // The browser's close event for the first close comes a task later.
      await page.evaluate(
        () => (window as unknown as { nativeClosed: Promise<unknown> }).nativeClosed,
      );
      await expect(dialog(page, "basic")).toBeVisible();
      expect(await dialog(page, "basic").evaluate((element) => element.matches(":modal"))).toBe(
        true,
      );
      expect(await events(page, "basic")).toEqual([
        { type: "idgClose", detail: { returnValue: "", reason: "method" } },
      ]);
    });
  }
});

test.describe("idg-dialog keeps the page behind it out of reach", () => {
  test("a click on the page behind a modal does not reach it", async ({ page }) => {
    await openOverlays(page);
    await page.evaluate(() => {
      const after = document.getElementById("after");
      after?.addEventListener("click", () => {
        after.setAttribute("data-clicked", "");
      });
    });
    const box = await page.locator("#after").boundingBox();
    await openWithClick(page, "open-basic", "basic");
    if (!box) throw new Error("no button behind the dialog");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator("#after")).not.toHaveAttribute("data-clicked");
  });

  test("Tab never reaches the page behind a modal", async ({ page }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "basic");
    for (let press = 0; press < 12; press += 1) {
      await page.keyboard.press("Tab");
      const inside = await focusIsWithin(page, "basic");
      const id = await focusedId(page);
      expect(inside || id === "body" || id === "html", `focus on ${id}`).toBe(true);
    }
  });

  test("the page does not scroll and nothing shifts while a modal is open", async ({ page }) => {
    await openOverlays(page);
    await page.evaluate(() => {
      window.scrollTo(0, 200);
    });
    const before = await page
      .locator("h1")
      .evaluate((element) => element.getBoundingClientRect().left);
    await page.evaluate(() =>
      (
        document.getElementById("basic") as unknown as { showModal: () => Promise<void> }
      ).showModal(),
    );
    await page.evaluate(() => {
      const scope = window as unknown as { wheeled?: boolean };
      document.addEventListener("wheel", () => (scope.wheeled = true), { passive: true });
    });
    await page.mouse.wheel(0, 600);
    // Once the wheel has been delivered and two frames have passed, an unlocked page has scrolled.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { wheeled?: boolean }).wheeled))
      .toBe(true);
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }),
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(200);
    const during = await page
      .locator("h1")
      .evaluate((element) => element.getBoundingClientRect().left);
    expect(during).toBe(before);
    await page.keyboard.press("Escape");
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });

  test("a non-modal dialog leaves the page usable", async ({ page }) => {
    await openOverlays(page);
    await wire(page, "open-basic", "panel", "show");
    await page.locator("#open-basic").click();
    await expect(dialog(page, "panel")).toBeVisible();
    expect(await dialog(page, "panel").evaluate((element) => element.matches(":modal"))).toBe(
      false,
    );
    await page.locator("#after").click();
    expect(await focusedId(page)).toBe("after");
  });
});

test.describe("idg-dialog closing", () => {
  test("Escape closes it with reason escape after an idgCancel", async ({ page }) => {
    await openOverlays(page);
    await recordEvents(page, "basic", ["idgOpen", "idgCancel", "idgClose"]);
    await openWithClick(page, "open-basic", "basic");
    await page.keyboard.press("Escape");
    await expect(dialog(page, "basic")).toBeHidden();
    expect(await events(page, "basic")).toEqual([
      { type: "idgOpen", detail: { modal: true } },
      { type: "idgCancel", detail: { reason: "escape" } },
      { type: "idgClose", detail: { returnValue: "", reason: "escape" } },
    ]);
    await expect(page.locator("#basic")).not.toHaveAttribute("open");
  });

  test("a prevented idgCancel keeps it open on Escape", async ({ page }) => {
    await openOverlays(page);
    await page.evaluate(() => {
      document.getElementById("basic")?.addEventListener("idgCancel", (event) => {
        event.preventDefault();
      });
    });
    await openWithClick(page, "open-basic", "basic");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await expect(dialog(page, "basic")).toBeVisible();
  });

  test("a click on the backdrop closes it with reason backdrop", async ({ page }) => {
    await openOverlays(page);
    await recordEvents(page, "basic", ["idgClose"]);
    await openWithClick(page, "open-basic", "basic");
    await page.mouse.click(4, 4);
    await expect(dialog(page, "basic")).toBeHidden();
    expect(await events(page, "basic")).toEqual([
      { type: "idgClose", detail: { returnValue: "", reason: "backdrop" } },
    ]);
  });

  test("a click inside it does not count as the backdrop", async ({ page }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "basic");
    await page.locator("#basic").getByText("People you invite").click();
    await expect(dialog(page, "basic")).toBeVisible();
  });

  test("the close button closes it with reason close-button", async ({ page }) => {
    await openOverlays(page);
    await recordEvents(page, "basic", ["idgClose"]);
    await openWithClick(page, "open-basic", "basic");
    await page.locator("#basic").locator('[part="close"]').click();
    await expect(dialog(page, "basic")).toBeHidden();
    expect(await events(page, "basic")).toEqual([
      { type: "idgClose", detail: { returnValue: "", reason: "close-button" } },
    ]);
  });

  test("a slotted form with method=dialog closes it with the button's value", async ({ page }) => {
    await openOverlays(page);
    await recordEvents(page, "confirm", ["idgClose"]);
    await openWithClick(page, "open-basic", "confirm");
    await page.locator("#confirm-delete").click();
    await expect(dialog(page, "confirm")).toBeHidden();
    expect(await events(page, "confirm")).toEqual([
      { type: "idgClose", detail: { returnValue: "delete", reason: "form" } },
    ]);
    expect(new URL(page.url()).search).toBe("");
  });

  test("a dialog that is not dismissible ignores Escape and has no close button", async ({
    page,
  }) => {
    await openOverlays(page);
    await openWithClick(page, "open-basic", "locked");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await expect(dialog(page, "locked")).toBeVisible();
    await expect(page.locator("#locked").locator('[part="close"]')).toHaveCount(0);
  });

  test("setting open and calling close() open and close it", async ({ page }) => {
    await openOverlays(page);
    await page.evaluate(() => document.getElementById("basic")?.setAttribute("open", ""));
    await expect(dialog(page, "basic")).toBeVisible();
    await recordEvents(page, "basic", ["idgClose"]);
    await page.evaluate(() =>
      (
        document.getElementById("basic") as unknown as { close: (value: string) => Promise<void> }
      ).close("done"),
    );
    await expect(dialog(page, "basic")).toBeHidden();
    expect(await events(page, "basic")).toEqual([
      { type: "idgClose", detail: { returnValue: "done", reason: "method" } },
    ]);
  });
});

test.describe("idg-dialog appearance", () => {
  test("rises into place where movement is on, and only fades where it is off", async ({
    page,
  }) => {
    await openOverlays(page);
    const transitions = async (ux: string) => {
      await applyAxes(page, { ux });
      await page.evaluate(() =>
        (
          document.getElementById("basic") as unknown as { showModal: () => Promise<void> }
        ).showModal(),
      );
      const names = await dialog(page, "basic").evaluate((element) =>
        element.getAnimations().map((animation) => (animation as CSSTransition).transitionProperty),
      );
      await page.evaluate(() =>
        (document.getElementById("basic") as unknown as { close: () => Promise<void> }).close(),
      );
      await settle(page);
      return names;
    };
    const moving = await transitions("comfortable");
    expect(moving).toEqual(expect.arrayContaining(["opacity", "translate"]));
    const still = await transitions("calm");
    expect(still).toContain("opacity");
    expect(still).not.toContain("translate");
  });

  test("fits a 320px-wide viewport", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openOverlays(page);
    await openWithClick(page, "open-basic", "basic");
    await settle(page);
    const box = await dialog(page, "basic").boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
    const overflow = await page.locator("#basic").evaluate((host) => {
      const body = host.shadowRoot?.querySelector(".body");
      return body ? body.scrollWidth - body.clientWidth : 0;
    });
    expect(overflow).toBe(0);
  });

  test("shows a visible boundary in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await openOverlays(page);
    await openWithClick(page, "open-basic", "basic");
    const border = await dialog(page, "basic").evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.borderTopStyle, style.borderTopWidth];
    });
    expect(border[0]).toBe("solid");
    expect(parseFloat(border[1] ?? "0")).toBeGreaterThanOrEqual(1);
  });
});

test.describe("idg-dialog accessibility while open", () => {
  const openConfirm = async (page: Page) => {
    await openOverlays(page);
    await page.evaluate(() =>
      (
        document.getElementById("confirm") as unknown as { showModal: () => Promise<void> }
      ).showModal(),
    );
    await settle(page);
  };

  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openConfirm(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await openConfirm(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }
});
