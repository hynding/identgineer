import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, SCHEMES, THEMES, UX_MODES, applyAxes } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { CONTENT_SECURITY_POLICY } from "./content-security-policy";
import { HARBOUR_CSS, HARBOUR_TOKENS, openBrandExport } from "./brand-page";
import { measureEdges } from "./chip-edge";
import { contrastRatio } from "./contrast";
import { countDeep, headingsIn, measureReflow } from "./deep";
import { expect, test } from "./fixtures";
import { BROWSER_PORT } from "./port";
import { setTextSize, TEXT_SIZES } from "./text-size";

const ORIGIN = `http://127.0.0.1:${String(BROWSER_PORT)}`;
const EXPORTS = "idg-brand-export";
const SNIPPET = [
  '<link rel="stylesheet" href="/tokens/index.css" />',
  '<link rel="stylesheet" href="/themes/harbour-lights.css" />',
  "",
  '<html data-theme="harbour-lights">',
].join("\n");

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** What each artefact of an export element shows, by artefact. */
async function shown(page: Page, id: string): Promise<Record<string, string>> {
  return page
    .locator(`#${id}`)
    .evaluate((host) =>
      Object.fromEntries(
        [...(host.shadowRoot?.querySelectorAll("[data-artefact]") ?? [])].map((section) => [
          section.getAttribute("data-artefact") ?? "",
          section.querySelector("pre code")?.textContent ?? "",
        ]),
      ),
    );
}

const button = (page: Page, id: string, action: string) =>
  page.locator(`#${id}`).locator(`[data-action="${action}"]`);
const status = (page: Page, id: string) => page.locator(`#${id}`).locator('[role="status"]');

/** Records the events, the blobs and the revoked urls of the page, to be read back by a test. */
async function record(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      events: [] as string[],
      blobs: [] as { url: string; type: string; size: number }[],
      revoked: [] as string[],
    };
    (window as unknown as { __record: typeof state }).__record = state;
    for (const name of ["idgCopy", "idgDownload"]) {
      document.addEventListener(name, (event) => {
        state.events.push(
          `${name} ${JSON.stringify((event as CustomEvent).detail)} ${(event.target as Element).id}`,
        );
      });
    }
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      const url = create(object);
      if (object instanceof Blob) state.blobs.push({ url, type: object.type, size: object.size });
      return url;
    };
    URL.revokeObjectURL = (url: string) => {
      state.revoked.push(url);
      revoke(url);
    };
  });
}

const recorded = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __record: {
            events: string[];
            blobs: { url: string; type: string; size: number }[];
            revoked: string[];
          };
        }
      ).__record,
  );

test.describe("idg-brand-export content", () => {
  test("shows the stylesheet and the tokens exactly as given, and the snippet from the id and the name", async ({
    page,
  }) => {
    await openBrandExport(page);
    expect(await shown(page, "export-text")).toEqual({
      css: HARBOUR_CSS,
      tokens: HARBOUR_TOKENS,
      snippet: SNIPPET,
    });
  });

  test("emits the same stylesheet and tokens in the browser from the theme, byte for byte, as Node does", async ({
    page,
  }) => {
    await openBrandExport(page);
    expect(await shown(page, "export-theme")).toEqual({
      css: HARBOUR_CSS,
      tokens: HARBOUR_TOKENS,
      snippet: SNIPPET,
    });
  });

  test("says so, and shows no file, for a theme altered after it was generated", async ({
    page,
  }) => {
    await openBrandExport(page);
    expect(await shown(page, "export-altered")).toEqual({});
    await expect(page.locator("#export-altered").locator('[part="problem"]')).toHaveText(
      "The theme could not be turned into files: it no longer matches its brand kit.",
    );
  });

  test("says there is nothing to export when it has nothing", async ({ page }) => {
    await openBrandExport(page);
    await expect(page.locator("#export-empty").locator('[part="empty"]')).toHaveText(
      "There is nothing to export yet.",
    );
    expect(await countDeep(page, "#export-empty", "pre")).toBe(0);
  });

  test("heads each artefact, and names each code region and button for assistive technology", async ({
    page,
  }) => {
    await openBrandExport(page);
    expect(await headingsIn(page, "#export-text")).toEqual([
      { level: 3, text: "Stylesheet" },
      { level: 3, text: "Design tokens" },
      { level: 3, text: "Use it" },
    ]);
    const snapshot = await page.locator("#export-text").ariaSnapshot();
    expect(snapshot).toContain('- group "Harbour Lights files"');
    for (const name of ["Stylesheet", "Design tokens", "Use it"]) {
      expect(snapshot).toContain(`- region "${name}"`);
    }
    for (const name of [
      "Copy stylesheet",
      "Download stylesheet",
      "Copy design tokens",
      "Download design tokens",
      "Copy snippet",
    ]) {
      expect(snapshot).toContain(`- button "${name}"`);
    }
    expect(snapshot.match(/- button/g)).toHaveLength(5);
  });

  test("has one polite live region for what follows an action", async ({ page }) => {
    await openBrandExport(page);
    const region = status(page, "export-text");
    await expect(region).toHaveCount(1);
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region).toHaveAttribute("aria-atomic", "true");
  });
});

test.describe("idg-brand-export copying", () => {
  test("puts exactly the text shown on the clipboard when a button is pressed, and says so, once", async ({
    page,
  }) => {
    const watch = await openBrandExport(page);
    await record(page);
    await page.reload();
    await expect(page.locator("html[data-brand-ready]")).toHaveCount(1);
    for (const [action, expected, word] of [
      ["copy-css", HARBOUR_CSS, "stylesheet"],
      ["copy-tokens", HARBOUR_TOKENS, "design tokens"],
      ["copy-snippet", SNIPPET, "snippet"],
    ] as const) {
      await button(page, "export-text", action).click();
      await expect(status(page, "export-text")).toHaveText(`The ${word} was copied.`);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    }
    expect((await recorded(page)).events).toEqual([
      'idgCopy {"artefact":"css"} export-text',
      'idgCopy {"artefact":"tokens"} export-text',
      'idgCopy {"artefact":"snippet"} export-text',
    ]);
    expect(await watch.violations()).toEqual([]);
  });

  test("copies with the keyboard alone: Tab to the button, then Enter or Space", async ({
    page,
  }) => {
    await openBrandExport(page);
    await page.locator("#export-text").locator('[data-action="copy-css"] button').focus();
    await page.keyboard.press("Enter");
    await expect(status(page, "export-text")).toHaveText("The stylesheet was copied.");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(HARBOUR_CSS);
    await page.evaluate(() => navigator.clipboard.writeText("something else"));
    await page.locator("#export-text").locator('[data-action="copy-tokens"] button').focus();
    await page.keyboard.press("Space");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(HARBOUR_TOKENS);
  });

  test("reaches every control by Tab in reading order, each region before its buttons", async ({
    page,
  }) => {
    await openBrandExport(page);
    await page.locator("#export-text").evaluate((host) => {
      (host.previousElementSibling as HTMLElement | null)?.focus();
    });
    await page.evaluate(() => {
      const probe = document.createElement("button");
      probe.id = "probe";
      probe.textContent = "probe";
      document.querySelector("#export-text")?.before(probe);
      probe.focus();
    });
    const names: string[] = [];
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press("Tab");
      names.push(
        await page.evaluate(() => {
          let active: Element | null = document.activeElement;
          while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
          // A button's name is the text its idg-button host holds; a region is named by its title.
          const host = (active?.getRootNode() as ShadowRoot | undefined)?.host;
          const label =
            active?.localName === "button"
              ? (host?.textContent.trim().replaceAll(/\s+/g, " ") ?? "")
              : "";
          return `${active?.localName ?? ""}:${label.slice(0, 24)}`;
        }),
      );
    }
    expect(names.slice(0, 8)).toEqual([
      "div:",
      "button:Copy stylesheet",
      "button:Download stylesheet",
      "div:",
      "button:Copy design tokens",
      "button:Download design tokens",
      "div:",
      "button:Copy snippet",
    ]);
  });

  test("selects the text and says so when the clipboard refuses, and fires no copy event", async ({
    page,
  }) => {
    await openBrandExport(page);
    await record(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () => Promise.reject(new DOMException("denied", "NotAllowedError")),
      });
    });
    await page.reload();
    await expect(page.locator("html[data-brand-ready]")).toHaveCount(1);
    await button(page, "export-text", "copy-css").click();
    await expect(status(page, "export-text")).toHaveText(
      "The stylesheet could not be copied. Its text is selected: copy it yourself.",
    );
    const selection = await page.evaluate(() => {
      const host = document.querySelector("#export-text");
      const root: (ShadowRoot & { getSelection?: () => Selection | null }) | null | undefined =
        host?.shadowRoot;
      return {
        document: document.getSelection()?.toString() ?? "",
        shadow: root?.getSelection?.()?.toString() ?? "",
        focused: host?.shadowRoot?.activeElement?.getAttribute("aria-labelledby") ?? "",
      };
    });
    // The browser leaves out the newline that ends the last line of a block of preformatted text.
    expect([selection.document, selection.shadow].map((text) => text.trimEnd())).toContain(
      HARBOUR_CSS.trimEnd(),
    );
    expect(selection.focused).toBe("title-css");
    expect((await recorded(page)).events).toEqual([]);
  });

  test("says the same, with the text selected, when the page has no clipboard api at all", async ({
    page,
  }) => {
    await openBrandExport(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    });
    await page.reload();
    await expect(page.locator("html[data-brand-ready]")).toHaveCount(1);
    await button(page, "export-text", "copy-tokens").click();
    await expect(status(page, "export-text")).toHaveText(
      "The design tokens could not be copied. Its text is selected: copy it yourself.",
    );
    const selected = await page.evaluate(() => document.getSelection()?.toString() ?? "");
    expect(selected.trimEnd()).toBe(HARBOUR_TOKENS.trimEnd());
  });
});

test.describe("idg-brand-export downloading", () => {
  test("downloads the stylesheet as the named file with exactly the text, from a text/css blob, and revokes the url", async ({
    page,
  }) => {
    const watch = await openBrandExport(page);
    await record(page);
    await page.reload();
    await expect(page.locator("html[data-brand-ready]")).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button(page, "export-text", "download-css").click(),
    ]);
    expect(download.suggestedFilename()).toBe("harbour-lights.css");
    expect(await readFile(await download.path(), "utf8")).toBe(HARBOUR_CSS);
    await expect(status(page, "export-text")).toHaveText(
      "The stylesheet was downloaded as harbour-lights.css.",
    );
    const state = await recorded(page);
    expect(state.blobs).toEqual([
      {
        url: expect.stringMatching(/^blob:/) as unknown as string,
        type: "text/css",
        size: Buffer.byteLength(HARBOUR_CSS),
      },
    ]);
    expect(state.events).toEqual(['idgDownload {"artefact":"css"} export-text']);
    await expect.poll(async () => (await recorded(page)).revoked).toEqual([state.blobs[0]?.url]);
    expect(watch.requests.filter((url) => url.startsWith("blob:"))).toEqual([]);
    expect(await watch.violations()).toEqual([]);
  });

  test("downloads the tokens as application/json, byte for byte", async ({ page }) => {
    await openBrandExport(page);
    await record(page);
    await page.reload();
    await expect(page.locator("html[data-brand-ready]")).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button(page, "export-text", "download-tokens").click(),
    ]);
    expect(download.suggestedFilename()).toBe("harbour-lights.json");
    const bytes = await readFile(await download.path());
    expect(bytes.equals(Buffer.from(HARBOUR_TOKENS, "utf8"))).toBe(true);
    expect(JSON.parse(bytes.toString("utf8"))).toMatchObject({ light: {}, dark: {} });
    expect((await recorded(page)).blobs[0]?.type).toBe("application/json");
  });

  test("downloads with the keyboard alone, the page theme's own emission included", async ({
    page,
  }) => {
    await openBrandExport(page);
    await page.locator("#export-theme").locator('[data-action="download-css"] button').focus();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.keyboard.press("Enter"),
    ]);
    expect(download.suggestedFilename()).toBe("harbour-lights.css");
    expect(await readFile(await download.path(), "utf8")).toBe(HARBOUR_CSS);
  });

  test("names a file from a hostile brand name by letters, digits and hyphens alone", async ({
    page,
  }) => {
    await openBrandExport(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      button(page, "export-hostile", "download-css").click(),
    ]);
    const name = download.suggestedFilename();
    expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*\.css$/);
    expect(name.length).toBeLessThanOrEqual(40 + ".css".length);
    expect(name.startsWith("etc-passwd")).toBe(true);
  });

  test("has no snippet from a theme id that is markup, and puts no markup in the page from any text", async ({
    page,
  }) => {
    const watch = await openBrandExport(page);
    expect(Object.keys(await shown(page, "export-hostile"))).toEqual(["css", "tokens"]);
    const found = await page.locator("#export-hostile").evaluate((host) => {
      const elements = [...(host.shadowRoot?.querySelectorAll("*") ?? [])];
      return {
        names: [...new Set(elements.map((element) => element.localName))].sort(),
        handlers: elements
          .flatMap((element) => [...element.attributes].map((attribute) => attribute.name))
          .filter((name) => /^on/i.test(name)),
        pwned: (window as unknown as { __pwned?: number }).__pwned,
      };
    });
    expect(found.names).not.toEqual(expect.arrayContaining(["img"]));
    expect(
      found.names.filter((name) => ["img", "script", "style", "link", "iframe"].includes(name)),
    ).toEqual([]);
    expect(found.handlers).toEqual([]);
    expect(found.pwned).toBeUndefined();
    expect(watch.requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
    expect(await watch.violations()).toEqual([]);
  });

  test("is served under the strict policy and nothing looser, and makes no request off the origin", async ({
    page,
  }) => {
    const watch = await openBrandExport(page);
    // Asked of the server itself: the page's own response is rewritten by the test to the policy.
    const response = await page.request.get("/fixtures/brand-export.html");
    expect(response.headers()["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(watch.requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
  });
});

test.describe("idg-brand-export regions", () => {
  test("scroll and take focus, so a keyboard can read the whole of a long file", async ({
    page,
  }) => {
    await openBrandExport(page);
    await page.locator("#export-text").locator('[role="region"]').first().focus();
    const before = await page.locator("#export-text").evaluate((host) => {
      const region = host.shadowRoot?.querySelector('[role="region"]');
      return region
        ? {
            scrolls: region.scrollHeight > region.clientHeight,
            top: region.scrollTop,
            outline: getComputedStyle(region).outlineStyle,
          }
        : undefined;
    });
    expect(before?.scrolls).toBe(true);
    expect(before?.top).toBe(0);
    expect(before?.outline).not.toBe("none");
    await page.keyboard.press("PageDown");
    await expect
      .poll(() =>
        page
          .locator("#export-text")
          .evaluate((host) => host.shadowRoot?.querySelector('[role="region"]')?.scrollTop ?? 0),
      )
      .toBeGreaterThan(0);
  });

  for (const theme of THEMES) {
    for (const scheme of SCHEMES) {
      test(`the text reads on its region in the ${theme} theme, ${scheme} scheme`, async ({
        page,
      }) => {
        await openBrandExport(page);
        await applyAxes(page, { theme, scheme });
        const pairs = await page.locator("#export-text").evaluate((host) =>
          [...(host.shadowRoot?.querySelectorAll(".code") ?? [])].map((region) => ({
            text: getComputedStyle(region.querySelector("code") ?? region).color,
            behind: getComputedStyle(region).backgroundColor,
          })),
        );
        expect(pairs).toHaveLength(3);
        for (const pair of pairs) {
          expect(contrastRatio(pair.text, pair.behind)).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }

  test("each region has an edge of at least 3:1 against what is behind it, in every design and scheme", async ({
    page,
  }) => {
    await openBrandExport(page);
    let measured = 0;
    for (const design of DESIGNS) {
      for (const scheme of SCHEMES) {
        await applyAxes(page, { design, scheme });
        const edges = await measureEdges(page.locator("#export-text"), ".code");
        expect(edges).toHaveLength(3);
        for (const edge of edges) {
          expect(edge.width).toBe("2px");
          expect(
            edge.ratio,
            `${design} ${scheme}: ${edge.edge} on ${edge.behind}`,
          ).toBeGreaterThanOrEqual(3);
          measured += 1;
        }
      }
    }
    expect(measured).toBe(DESIGNS.length * SCHEMES.length * 3);
  });
});

test.describe("idg-brand-export across the axes", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openBrandExport(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode`, async ({ page }) => {
      await openBrandExport(page);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }

  for (const theme of THEMES) {
    test(`has no axe violations in the ${theme} theme, in both schemes`, async ({ page }) => {
      await openBrandExport(page);
      for (const scheme of SCHEMES) {
        await applyAxes(page, { theme, scheme });
        await expectNoAxeViolations(page);
      }
    });
  }

  test("the layout sets the gap between artefacts, and the UX mode the size of the text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openBrandExport(page);
    const gaps = new Set<string>();
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      gaps.add(
        await page
          .locator("#export-text")
          .evaluate(
            (host) => getComputedStyle(host.shadowRoot?.querySelector(".export") ?? host).rowGap,
          ),
      );
    }
    expect(gaps.size).toBeGreaterThan(2);
    const sizes = new Set<string>();
    for (const ux of UX_MODES) {
      await applyAxes(page, { ux });
      sizes.add(
        await page
          .locator("#export-text")
          .evaluate(
            (host) => getComputedStyle(host.shadowRoot?.querySelector("pre") ?? host).fontSize,
          ),
      );
    }
    expect(sizes.size).toBeGreaterThan(1);
  });
});

test.describe("idg-brand-export reflow", () => {
  for (const layout of LAYOUTS) {
    for (const size of TEXT_SIZES) {
      test(`has no sideways scroll at 320px in the ${layout} layout at ${size.label}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await openBrandExport(page);
        await applyAxes(page, { layout });
        await setTextSize(page, size);
        await expect
          .poll(async () => {
            const found = await measureReflow(page, EXPORTS, ".code");
            return {
              page: found.page <= 0,
              wider: found.wider.every((count) => count === 0),
              hosts: found.hosts,
              measured: found.elements > 100,
            };
          })
          .toEqual({ page: true, wider: true, hosts: 5, measured: true });
      });
    }
  }

  test("reflows at 200% text, as at 320px: the regions scroll inside themselves and the page does not", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openBrandExport(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect
      .poll(async () => {
        const found = await measureReflow(page, EXPORTS, ".code");
        return {
          page: found.page <= 0,
          wider: found.wider.every((count) => count === 0),
          hosts: found.hosts,
        };
      })
      .toEqual({ page: true, wider: true, hosts: 5 });
    const found = await page.locator("#export-text").evaluate((host) => {
      const regions = [...(host.shadowRoot?.querySelectorAll(".code") ?? [])];
      const box = host.getBoundingClientRect();
      return {
        count: regions.length,
        scrolling: regions.filter((region) => region.scrollWidth > region.clientWidth).length,
        inside: regions.every((region) => region.getBoundingClientRect().right <= box.right + 1),
        buttons: [...(host.shadowRoot?.querySelectorAll("idg-button") ?? [])].every(
          (control) => control.getBoundingClientRect().right <= box.right + 1,
        ),
      };
    });
    expect(found.count).toBe(3);
    expect(found.scrolling).toBeGreaterThan(0);
    expect(found.inside).toBe(true);
    expect(found.buttons).toBe(true);
  });
});
