import { test as base } from "@playwright/test";
import { DESIGNS, SCHEMES, THEMES, UX_MODES, applyAxes } from "./axes";
import { accessibleNode } from "./accessible-node";
import { expectNoAxeViolations } from "./accessibility";
import { logoImage } from "@identgineer/brand/logo";
import { HOSTILE_LOGO, openBrand, sanitisedLogo } from "./brand-page";
import { contrastRatio } from "./contrast";
import { expect, test } from "./fixtures";
import { BROWSER_PORT } from "./port";

const ORIGIN = `http://127.0.0.1:${String(BROWSER_PORT)}`;

const FRAMES = [
  { name: "a logo", attributes: 'viewBox="0 0 120 40" width="120" height="40"' },
  {
    name: "a width and height of another shape than the view box",
    attributes: 'viewBox="0 0 120 40" width="200" height="40"',
  },
  {
    name: "a stretching aspect ratio",
    attributes: 'viewBox="0 0 120 40" width="300" height="40" preserveAspectRatio="none"',
  },
  { name: "a size in millimetres", attributes: 'viewBox="0 0 100 20" width="100mm" height="20mm"' },
  { name: "a fractional view box", attributes: 'viewBox="0 0 1.5 1" width="150" height="100"' },
  {
    name: "a view box under one unit",
    attributes: 'viewBox="0 0 0.5 0.25" width="100" height="50"',
  },
  { name: "a very wide logo", attributes: 'viewBox="0 0 60 3" width="60" height="3"' },
  { name: "a tall logo", attributes: 'viewBox="0 0 10 40" width="10" height="40"' },
];

test.describe("idg-brand-logo under the strict policy with img-src data:", () => {
  test("draws the logo and the mark through an image of the data url, and nothing is blocked or fetched", async ({
    page,
  }) => {
    const watch = await openBrand(page);
    for (const id of ["logo-lg", "logo-mark", "logo-xs", "logo-sm", "logo-md", "logo-xl"]) {
      const image = page.locator(`#${id}`).locator("img");
      await expect(image).toHaveCount(1);
      await expect(image).toHaveAttribute("src", /^data:image\/svg\+xml;charset=utf-8,/);
      await expect
        .poll(
          () =>
            image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth),
          id,
        )
        .toBeGreaterThan(0);
    }
    expect(await watch.violations()).toEqual([]);
    expect(watch.requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
  });

  test("puts the logo's markup nowhere in the page: the only thing it becomes is an image source", async ({
    page,
  }) => {
    await openBrand(page);
    const found = await page.evaluate(() => {
      const hosts = [...document.querySelectorAll("idg-brand-logo")];
      return hosts.map((host) => ({
        id: host.id,
        inLight: host.querySelector("svg, img, use") !== null,
        elements: [...(host.shadowRoot?.querySelectorAll("*") ?? [])].map(
          (element) => element.localName,
        ),
      }));
    });
    for (const { id, inLight, elements } of found) {
      expect(inLight, id).toBe(false);
      expect(
        elements.filter((name) => name !== "img" && name !== "span"),
        id,
      ).toEqual([]);
    }
    expect(await page.locator("svg").count()).toBe(0);
  });

  test("never draws a logo that is not the sanitiser's output, and runs nothing it holds", async ({
    page,
  }) => {
    const watch = await openBrand(page);
    for (const id of ["logo-hostile", "logo-hostile-mark"]) {
      await expect(page.locator(`#${id}`).locator("img")).toHaveCount(0);
    }
    await expect(page.locator("#logo-hostile").locator('[part="wordmark"]')).toHaveText(
      "Harbour Lights",
    );
    await expect(page.locator("#logo-hostile-mark").locator('[part="monogram"]')).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
    ).toBeUndefined();
    expect(watch.requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
    expect(await watch.violations()).toEqual([]);
    expect(HOSTILE_LOGO).toContain("onload");
  });

  // The image's natural size is the root's width and height, which the sanitiser writes and which
  // may be another shape than the view box, in units, or under one unit across. The box the
  // component reserves must be that shape before anything is decoded, or the page jumps on load.
  for (const { name, attributes } of FRAMES) {
    test(`reserves the frame of ${name} before it is decoded, and nothing moves when it loads`, async ({
      page,
    }) => {
      await openBrand(page);
      const logo = sanitisedLogo(attributes);
      const natural = logoImage(logo);
      if (!natural) throw new Error("not a logo");
      const measured = await page.evaluate(async (svg) => {
        let shifted = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            shifted += (entry as PerformanceEntry & { value: number }).value;
          }
        }).observe({ type: "layout-shift", buffered: false });
        const host = document.createElement("idg-brand-logo");
        host.setAttribute("name", "Harbour Lights");
        host.setAttribute("size", "lg");
        host.logo = svg;
        const probe = document.createElement("p");
        probe.textContent = "after the logo";
        const container = document.createElement("div");
        container.append(host, probe);
        // Read synchronously when the image is put in the shadow root: that is the one moment it is
        // laid out before it has loaded, and a layout read forces the box to be worked out then.
        interface First {
          width: number;
          height: number;
          probeTop: number;
          complete: boolean;
          image: HTMLImageElement;
        }
        const seen: { first?: First } = {};
        // Called back with the node they were taken from as `this`.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const insert = Node.prototype.insertBefore;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const append = Node.prototype.appendChild;
        const watch = (node: Node) => {
          const image =
            node instanceof HTMLImageElement
              ? node
              : node instanceof Element
                ? node.querySelector("img")
                : null;
          if (seen.first || !image?.isConnected || image.getRootNode() !== host.shadowRoot) return;
          const box = image.getBoundingClientRect();
          seen.first = {
            width: box.width,
            height: box.height,
            probeTop: probe.getBoundingClientRect().top,
            complete: image.complete,
            image,
          };
        };
        Node.prototype.insertBefore = function <T extends Node>(
          this: Node,
          node: T,
          ref: Node | null,
        ): T {
          const result = insert.call(this, node, ref) as T;
          watch(node);
          return result;
        };
        Node.prototype.appendChild = function <T extends Node>(this: Node, node: T): T {
          const result = append.call(this, node) as T;
          watch(node);
          return result;
        };
        document.querySelector("main")?.append(container);
        await host.componentOnReady();
        Node.prototype.insertBefore = insert;
        Node.prototype.appendChild = append;
        if (!seen.first) throw new Error("the image was never put in the page");
        const { image, ...before } = seen.first;
        await image.decode();
        const box = image.getBoundingClientRect();
        const after = {
          width: box.width,
          height: box.height,
          probeTop: probe.getBoundingClientRect().top,
        };
        await new Promise((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(resolve);
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
        return { before, after, shifted };
      }, logo);

      // The first read is of the image as it is first laid out, unloaded: the box is already the
      // one the decoded image fills.
      expect(measured.before.complete).toBe(false);
      expect(measured.before.width).toBeCloseTo(measured.after.width, 1);
      expect(measured.before.height).toBeCloseTo(measured.after.height, 1);
      expect(measured.before.probeTop).toBeCloseTo(measured.after.probeTop, 1);
      expect(measured.shifted).toBe(0);
      // And that size is the logo's own shape at the height asked for (lg is 3.5rem).
      expect(measured.after.height).toBeCloseTo(56, 0);
      expect(measured.after.width / measured.after.height).toBeCloseTo(
        natural.width / natural.height,
        1,
      );
    });
  }

  test("reports no layout shift once the page is ready", async ({ page }) => {
    await openBrand(page);
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const shifted = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              total += (entry as PerformanceEntry & { value: number }).value;
            }
          }).observe({ type: "layout-shift", buffered: false });
          setTimeout(() => {
            resolve(total);
          }, 500);
        }),
    );
    expect(shifted).toBe(0);
  });

  test("keeps the logo's proportions at each size, whole, and never wider than its container", async ({
    page,
  }) => {
    await openBrand(page);
    const heights = new Map<string, number>();
    for (const [id, size] of [
      ["logo-xs", 20],
      ["logo-sm", 28],
      ["logo-md", 40],
      ["logo-lg", 56],
      ["logo-xl", 80],
    ] as const) {
      const box = await page.locator(`#${id}`).locator("img").boundingBox();
      heights.set(id, box?.height ?? 0);
      expect(box?.height, id).toBeCloseTo(size, 0);
      expect((box?.width ?? 0) / (box?.height ?? 1), id).toBeCloseTo(3, 1);
    }
    const mark = await page.locator("#logo-mark").locator("img").boundingBox();
    expect((mark?.width ?? 0) / (mark?.height ?? 1)).toBeCloseTo(1, 2);

    // In a container narrower than the logo the box shrinks and the logo is drawn whole inside it.
    const narrow = await page.locator("#logo-xl").evaluate((host) => {
      const wrapper = document.createElement("div");
      wrapper.style.inlineSize = "100px";
      host.before(wrapper);
      wrapper.append(host);
      const image = host.shadowRoot?.querySelector("img");
      if (!image) throw new Error("no image");
      const style = getComputedStyle(image);
      return {
        width: image.getBoundingClientRect().width,
        fit: style.objectFit,
        overflow: wrapper.scrollWidth - wrapper.clientWidth,
      };
    });
    expect(narrow.width).toBeLessThanOrEqual(100);
    expect(narrow.fit).toBe("contain");
    expect(narrow.overflow).toBeLessThanOrEqual(0);
  });

  test("names the image after the brand, and leaves a decorative one out of the accessibility tree", async ({
    page,
  }) => {
    await openBrand(page);
    await expect
      .poll(() => accessibleNode(page, "logo-lg", "img"))
      .toMatchObject({ role: "image", name: "Harbour Lights" });
    await expect
      .poll(() => accessibleNode(page, "logo-monogram", '[part="monogram"]'))
      .toMatchObject({ role: "image", name: "Acme Rockets" });
    const decorative = await page.locator("#logo-decorative").locator("img").getAttribute("alt");
    expect(decorative).toBe("");
    expect(
      await page
        .locator("#logo-decorative")
        .locator("img")
        .evaluate((image) => image.getAttribute("src")),
    ).toMatch(/^data:/);
    expect(
      (await page.locator("p:has(#logo-decorative)").ariaSnapshot()).replaceAll(/\s+/g, " "),
    ).toBe("- paragraph: Harbour Lights");
  });

  test("draws nothing at all for no name and no logo", async ({ page }) => {
    await openBrand(page);
    expect(
      await page
        .locator("#logo-empty")
        .evaluate((host) => host.shadowRoot?.querySelectorAll("*").length),
    ).toBe(0);
    expect(await page.locator("#logo-empty").boundingBox()).toMatchObject({ width: 0 });
  });
});

test.describe("idg-brand-logo under the strict policy without img-src data:", () => {
  // The browser refuses the data url and says so on the console, which every other test treats as
  // a failure; here it is the thing under test.
  base(
    "shows the name where the browser refuses the image, and fetches nothing",
    async ({ page }) => {
      const messages: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") messages.push(message.text());
      });
      const watch = await openBrand(page, { policy: "strict" });
      await expect(page.locator("#logo-lg").locator("img")).toHaveCount(0);
      await expect(page.locator("#logo-lg").locator('[part="wordmark"]')).toHaveText(
        "Harbour Lights",
      );
      expect((await watch.violations()).every((violation) => violation.startsWith("img-src"))).toBe(
        true,
      );
      expect((await watch.violations()).length).toBeGreaterThan(0);
      expect(messages.every((message) => message.includes("Content Security Policy"))).toBe(true);
      expect(watch.requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
    },
  );
});

test.describe("idg-brand-logo across the axes", () => {
  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      test(`the wordmark and the monogram read at 4.5:1 in ${theme} ${scheme}`, async ({
        page,
      }) => {
        await openBrand(page);
        await applyAxes(page, { theme, scheme });
        const colours = await page.evaluate(() => {
          const wordmark = document
            .querySelector("#logo-wordmark")
            ?.shadowRoot?.querySelector('[part="wordmark"]');
          const monogram = document
            .querySelector("#logo-monogram")
            ?.shadowRoot?.querySelector('[part="monogram"]');
          if (!wordmark || !monogram) throw new Error("no fallback");
          const page = getComputedStyle(document.documentElement);
          return {
            wordmark: getComputedStyle(wordmark).color,
            page: page.backgroundColor,
            monogram: getComputedStyle(monogram).color,
            fill: getComputedStyle(monogram).backgroundColor,
          };
        });
        expect(contrastRatio(colours.wordmark, colours.page)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colours.monogram, colours.fill)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openBrand(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await openBrand(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }

  test("a monogram takes the corners of the design, and the wordmark its display type", async ({
    page,
  }) => {
    await openBrand(page);
    const radius = async (design: string) => {
      await applyAxes(page, { design });
      return page
        .locator("#logo-monogram")
        .evaluate(
          (host) =>
            getComputedStyle(host.shadowRoot?.querySelector('[part="monogram"]') ?? host)
              .borderTopLeftRadius,
        );
    };
    expect(new Set([await radius("brutalist"), await radius("soft")]).size).toBe(2);
    await applyAxes(page, { design: "flat" });
    const families = new Set<string>();
    for (const theme of THEMES) {
      await applyAxes(page, { theme });
      families.add(
        await page
          .locator("#logo-wordmark")
          .evaluate(
            (host) =>
              getComputedStyle(host.shadowRoot?.querySelector('[part="wordmark"]') ?? host)
                .fontFamily,
          ),
      );
    }
    expect(families.size).toBeGreaterThan(1);
  });

  test("a wordmark of a long name wraps at 320px with no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openBrand(page);
    await page.locator("#logo-wordmark").evaluate((host) => {
      host.setAttribute(
        "name",
        "The Extraordinarily Long Brand Name Of Antidisestablishmentarianism Limited",
      );
      host.setAttribute("size", "xl");
    });
    // The component re-renders after the attribute changes: measure the new name, not the old one.
    await expect
      .poll(() => page.locator("#logo-wordmark").locator('[part="wordmark"]').textContent())
      .toContain("Antidisestablishment");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
