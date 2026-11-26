import { readFileSync } from "node:fs";
import { sanitiseSvgLogo, SVG_LOGO_LIMITS } from "@identgineer/brand";
import type { Locator, Page } from "@playwright/test";
import { DESIGNS, LAYOUTS, SCHEMES, THEMES, UX_MODES, applyAxes, settle } from "./axes";
import { expectNoAxeViolations } from "./accessibility";
import { EDITOR_PAGE, HARBOUR_KIT, openBrand, type Watch } from "./brand-page";
import { contrastRatio } from "./contrast";
import { measureReflow } from "./deep";
import { expect, test } from "./fixtures";
import { BROWSER_PORT } from "./port";
import { setTextSize, TEXT_SIZES } from "./text-size";

const ORIGIN = `http://127.0.0.1:${String(BROWSER_PORT)}`;
const EDITORS = "idg-brand-editor";
const CLEAN_SVGS = new URL("../../brand/src/__fixtures__/clean-svg/", import.meta.url);
/** A mark from a design tool that the sanitiser keeps exactly. */
const CLEAN = readFileSync(new URL("simple-mark.svg", CLEAN_SVGS));
/** An Inkscape export: drawn as it is, with its editor data removed. */
const INKSCAPE = readFileSync(new URL("inkscape-export.svg", CLEAN_SVGS));
/** A logo that tries to run, load and track: each is removed, and the rest is kept. */
const HOSTILE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 40 20" onload="window.__pwned = 1"><script>window.__pwned = 1</script><rect width="20" height="20" fill="#0f766e" onclick="window.__pwned = 1"/><image href="https://example.com/track.png" width="10" height="10"/><a xlink:href="javascript:window.__pwned = 1"><rect x="20" width="20" height="20"/></a></svg>',
);
/** A logo the sanitiser refuses whole: it declares entities. */
const REFUSED = Buffer.from(
  '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY lol "lol">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>&lol;</text></svg>',
);
/** One byte over the sanitiser's limit, and a valid logo for every byte up to it. */
const OVERSIZE = Buffer.concat([
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect '),
  Buffer.alloc(SVG_LOGO_LIMITS.inputBytes, " "),
  Buffer.from('width="1" height="1"/></svg>'),
]);

const svgFile = (name: string, buffer: Buffer, mimeType = "image/svg+xml") => ({
  name,
  mimeType,
  buffer,
});

interface StoreCall {
  readonly operation: "create" | "update";
  readonly documentId?: string;
  readonly kit: Record<string, unknown>;
}

interface StoreState {
  readonly calls: StoreCall[];
  readonly plan: unknown[];
  readonly saves: { readonly editor: string; readonly detail: unknown }[];
  readonly release: () => void;
}

const store = (page: Page) =>
  page.evaluate(() => {
    const state = (window as unknown as { __brandStore: StoreState }).__brandStore;
    return { calls: state.calls, saves: state.saves };
  });

const plan = (page: Page, ...steps: unknown[]) =>
  page.evaluate((next) => {
    (window as unknown as { __brandStore: StoreState }).__brandStore.plan.push(...next);
  }, steps);

/** Records every file the page reads, by size, so a test can see a file was never read. */
async function recordReads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const reads: number[] = [];
    (window as unknown as { __reads: number[] }).__reads = reads;
    for (const method of ["arrayBuffer", "text", "bytes", "stream", "slice"] as const) {
      const original = Object.getOwnPropertyDescriptor(Blob.prototype, method)?.value as (
        this: Blob,
        ...args: unknown[]
      ) => unknown;
      Object.defineProperty(Blob.prototype, method, {
        configurable: true,
        writable: true,
        value(this: Blob, ...args: unknown[]) {
          reads.push(this.size);
          return original.apply(this, args);
        },
      });
    }
  });
}

async function openEditor(page: Page): Promise<Watch> {
  await recordReads(page);
  return openBrand(page, { page: EDITOR_PAGE });
}

const editor = (page: Page, id: string) => page.locator(`#${id}`);
const textInput = (host: Locator, name: string) =>
  host.locator(`idg-input[name="brand-${name}"] input.native`);
const picker = (host: Locator, name: string) =>
  host.locator(`idg-input[name="brand-${name}"] input[type="color"]`);
const upload = (host: Locator, field: "logo" | "mark") => host.locator(`#${field}-file`);
const preview = (host: Locator) => host.locator("idg-brand-guidelines");

/** The element focus is on, through every shadow root: its tag, and the name of its control. */
function focused(page: Page) {
  return page.evaluate(() => {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    const root = active?.getRootNode() as ShadowRoot | Document | undefined;
    const host = root instanceof ShadowRoot ? root.host : null;
    const control = active?.closest("idg-input, idg-select") ?? host;
    const editorRoot = (node: Node | null | undefined): string | null => {
      for (let current = node; current;) {
        if (current instanceof Element && current.localName === "idg-brand-editor") {
          return current.id;
        }
        const parent: Node | null = current.parentNode;
        current = parent instanceof ShadowRoot ? parent.host : parent;
      }
      return null;
    };
    return {
      tag: active?.localName ?? "",
      type: active?.getAttribute("type") ?? "",
      id: active?.id ?? "",
      // The field the control is for: each control's name is its field's, prefixed.
      control: control?.getAttribute("name")?.replace(/^brand-/, "") ?? "",
      editor: editorRoot(active),
    };
  });
}

/** Presses Tab until focus is on the text control named, within a bound. */
async function tabTo(page: Page, editorId: string, name: string): Promise<void> {
  for (let step = 0; step < 60; step += 1) {
    const now = await focused(page);
    if (now.editor === editorId && now.control === name && now.type !== "color") return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${name} in ${editorId}`);
}

/** Presses Tab until focus is on the editor's save button, the first button after its fields. */
async function tabToSave(page: Page, editorId: string): Promise<void> {
  for (let step = 0; step < 20; step += 1) {
    await page.keyboard.press("Tab");
    const now = await focused(page);
    if (now.editor === editorId && now.tag === "button") return;
  }
  throw new Error(`Tab never reached the save button of ${editorId}`);
}

/** An idg-alert's words, which it slots into the element that carries its role. */
async function expectAlert(
  alert: Locator,
  role: "alert" | "status",
  text: string | RegExp,
): Promise<void> {
  await expect(alert.locator(`[role="${role}"]`)).toHaveCount(1);
  await expect(alert).toContainText(text);
}

/**
 * Every element name, attribute value and text the editors draw, through shadow roots, decoded
 * where it is a url. The icons' own drawings are the library's fixed SVG, so they are not walked.
 */
function everything(
  page: Page,
  editors = "idg-brand-editor",
): Promise<{ names: string[]; values: string[] }> {
  return page.evaluate((selector) => {
    const all = (root: ParentNode): Element[] =>
      [...root.querySelectorAll("*")].flatMap((node) => [
        node,
        ...(node.shadowRoot && node.localName !== "idg-icon" ? all(node.shadowRoot) : []),
      ]);
    const elements = [...document.querySelectorAll(selector)].flatMap((editor) => [
      editor,
      ...all(editor),
      ...(editor.shadowRoot ? all(editor.shadowRoot) : []),
    ]);
    const decode = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    return {
      names: [...new Set(elements.map((element) => element.localName))],
      values: elements.flatMap((element) => [
        ...[...element.attributes].map((attribute) => decode(attribute.value)),
        ...[...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? ""),
        ...(element instanceof HTMLInputElement ? [element.value] : []),
      ]),
    };
  }, editors);
}

test.describe("idg-brand-editor form", () => {
  test("names the form and every control, and shows the stored kit's values", async ({ page }) => {
    await openEditor(page);
    const host = editor(page, "editor-harbour");
    const snapshot = await host.ariaSnapshot();
    expect(snapshot).toContain('- form "Harbour Lights brand kit"');
    for (const name of ["Name", "Theme id", "Primary colour", "Neutral tint"]) {
      await expect(host.getByRole("textbox", { name, exact: true })).toHaveCount(1);
    }
    await expect(host.getByRole("textbox", { name: "Tagline" })).toHaveCount(1);
    for (const name of ["Font pairing", "Corners", "Tone"]) {
      await expect(host.getByRole("combobox", { name })).toHaveCount(1);
    }
    await expect(host.getByLabel("Pick the primary colour")).toHaveValue("#f4c430");
    await expect(upload(host, "logo")).toHaveAccessibleName("Logo optional");
    await expect(upload(host, "logo")).toHaveAttribute("type", "file");
    await expect(upload(host, "mark")).toHaveAccessibleName("Mark optional");
    await expect(upload(host, "mark")).toHaveAttribute("type", "file");
    await expect(host.getByRole("group", { name: "Colours", exact: true })).toHaveCount(1);
    await expect(host.getByRole("button", { name: "Save brand kit" })).toHaveCount(1);
    await expect(textInput(host, "name")).toHaveValue("Harbour Lights");
    await expect(textInput(host, "primary")).toHaveValue("#f4c430");
    await expect(textInput(host, "neutralTint")).toHaveValue("#1b2a4a");
    await expect(host.locator("idg-select[name='brand-typography'] select")).toHaveValue(
      "classic-serif",
    );
  });

  test("names no control after a property of its form, so none shadows the form's own", async ({
    page,
  }) => {
    await openEditor(page);
    const properties = await editor(page, "editor-harbour").evaluate((host) => {
      const form = host.shadowRoot?.querySelector("form");
      if (!form) throw new Error("the editor has no form");
      const shadowed = ["id", "name", "action", "method", "target", "elements", "submit", "reset"];
      return shadowed.filter((property) => {
        const own = Object.getPrototypeOf(form) as object;
        const expected = Reflect.get(own, property, form) as unknown;
        return (form as unknown as Record<string, unknown>)[property] !== expected;
      });
    });
    expect(properties).toEqual([]);
  });

  test("previews the kit in its own region, as the guide, with its logo and mark drawn", async ({
    page,
  }) => {
    await openEditor(page);
    const host = editor(page, "editor-harbour");
    const region = host.getByRole("region", { name: "Preview" });
    await expect(region).toHaveCount(1);
    await expect(region.getByRole("heading", { level: 3 })).toHaveText("Preview");
    await expect(preview(host).locator("h4.name")).toHaveText("Harbour Lights");
    await expect
      .poll(() =>
        preview(host)
          .locator("idg-brand-logo img")
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await expect(preview(host).locator("idg-brand-logo img")).toHaveCount(4);
  });

  test("keeps the picker and the hex field in step", async ({ page }) => {
    await openEditor(page);
    const host = editor(page, "editor-harbour");
    await picker(host, "secondary").fill("#ff8800");
    await expect(textInput(host, "secondary")).toHaveValue("#ff8800");
    await textInput(host, "secondary").fill("#0AF");
    await expect(picker(host, "secondary")).toHaveValue("#00aaff");
    await textInput(host, "secondary").fill("#0a");
    await expect(picker(host, "secondary")).toHaveValue("#00aaff");
  });

  test("works the preview out once typing pauses, not on every keystroke", async ({ page }) => {
    await openEditor(page);
    const host = editor(page, "editor-harbour");
    await preview(host).evaluate((guide) => {
      const seen: string[] = [];
      (window as unknown as { __names: string[] }).__names = seen;
      new MutationObserver(() => {
        seen.push(guide.shadowRoot?.querySelector(".name")?.textContent ?? "");
      }).observe(guide.shadowRoot ?? guide, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    });
    await textInput(host, "name").press("End");
    await page.keyboard.type(" Co", { delay: 0 });
    await expect(preview(host).locator("h4.name")).toHaveText("Harbour Lights Co");
    const names = await page.evaluate(() => (window as unknown as { __names: string[] }).__names);
    expect(names.filter((name) => name.startsWith("Harbour Lights "))).toEqual(
      names.filter((name) => name === "Harbour Lights Co"),
    );
  });

  test("never restyles the page around it: removing every editor changes nothing outside", async ({
    page,
  }) => {
    await openEditor(page);
    const read = () =>
      page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const heading = getComputedStyle(document.querySelector("h1") ?? document.body);
        return {
          attributes: [...document.documentElement.attributes].map(
            (attribute) => `${attribute.name}=${attribute.value}`,
          ),
          sheets: document.styleSheets.length,
          adopted: document.adoptedStyleSheets.length,
          styles: document.querySelectorAll("style").length,
          custom: [
            "--idg-color-accent",
            "--idg-color-bg",
            "--idg-color-text",
            "--idg-font-family-body",
            "--idg-shape-radius-md",
            "--idg-brand-radius-md",
          ].map((name) => root.getPropertyValue(name)),
          body: getComputedStyle(document.body).backgroundColor,
          heading: [heading.color, heading.fontFamily, heading.fontSize],
        };
      });
    const before = await read();
    expect(before.custom[0]).not.toBe("");
    await page.evaluate(() => {
      for (const element of document.querySelectorAll("idg-brand-editor")) element.remove();
    });
    expect({ ...(await read()), attributes: before.attributes }).toEqual(before);
    expect(
      (await read()).attributes.filter((attribute) => attribute.startsWith("data-brand")),
    ).toEqual(["data-brand-ready="]);
  });
});

test.describe("idg-brand-editor saving, by keyboard alone", () => {
  test("creates a kit from an empty form, announces it politely, and updates the same kit after", async ({
    page,
  }) => {
    await openEditor(page);
    await page.keyboard.press("Tab");
    await tabTo(page, "editor-new", "name");
    await page.keyboard.type("Copper Kettle");
    await page.keyboard.press("Tab");
    expect(await focused(page)).toMatchObject({ control: "id", editor: "editor-new" });
    await page.keyboard.type("copper-kettle");
    await tabTo(page, "editor-new", "primary");
    await page.keyboard.type("#b45309");
    await tabTo(page, "editor-new", "tone");
    await page.keyboard.press("ArrowDown");
    await tabToSave(page, "editor-new");
    await page.keyboard.press("Enter");
    const host = editor(page, "editor-new");
    await expectAlert(host.locator('idg-alert[part="saved"]'), "status", "Brand kit saved.");
    const first = await store(page);
    expect(first.calls).toEqual([
      {
        operation: "create",
        kit: {
          id: "copper-kettle",
          name: "Copper Kettle",
          tagline: null,
          colors: { primary: [180, 83, 9] },
          typography: "system",
          corners: "soft",
          tone: "vivid",
          logo: null,
          mark: null,
        },
      },
    ]);
    expect(first.saves).toEqual([
      { editor: "editor-new", detail: { documentId: "doc-1", id: "copper-kettle", created: true } },
    ]);
    await tabTo(page, "editor-new", "tagline");
    await page.keyboard.type("Brewed slowly");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await store(page)).calls.length).toBe(2);
    const second = await store(page);
    expect(second.calls[1]).toMatchObject({
      operation: "update",
      documentId: "doc-1",
      kit: { tagline: "Brewed slowly" },
    });
    expect(second.saves[1]).toEqual({
      editor: "editor-new",
      detail: { documentId: "doc-1", id: "copper-kettle", created: false },
    });
  });

  test("updates the stored kit it was given, and is busy only while the store answers", async ({
    page,
  }) => {
    await openEditor(page);
    await plan(page, "hold");
    await tabTo(page, "editor-harbour", "tagline");
    await page.keyboard.type("Every ship comes home");
    await page.keyboard.press("Enter");
    const host = editor(page, "editor-harbour");
    const save = host.locator("idg-button.submit");
    await expect(save).toHaveAttribute("loading", "");
    await page.keyboard.press("Enter");
    // An input submits its form a task after the keypress, as a browser does: the store answers
    // only once that second submit has been asked for, while the first is still pending.
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve);
      });
      (window as unknown as { __brandStore: StoreState }).__brandStore.release();
    });
    await expect(save).not.toHaveAttribute("loading", "");
    const { calls, saves } = await store(page);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      operation: "update",
      documentId: "harbour-doc",
      kit: { id: "harbour-lights", tagline: "Every ship comes home", logo: HARBOUR_KIT.logo },
    });
    expect(saves).toEqual([
      {
        editor: "editor-harbour",
        detail: { documentId: "harbour-doc", id: "harbour-lights", created: false },
      },
    ]);
  });

  test("marks each invalid field, sums them up and moves focus to the first, and saves nothing", async ({
    page,
  }) => {
    await openEditor(page);
    await tabTo(page, "editor-new", "tagline");
    await page.keyboard.type("  ");
    await page.keyboard.press("Enter");
    const host = editor(page, "editor-new");
    await expectAlert(
      host.locator('idg-alert[part="error"]'),
      "alert",
      "Some fields need a change. Each says what is wrong.",
    );
    await expect.poll(() => focused(page)).toMatchObject({ control: "name", tag: "input" });
    for (const name of ["name", "id", "primary"]) {
      await expect(textInput(host, name)).toHaveAttribute("aria-invalid", "true");
    }
    await expect(textInput(host, "tagline")).not.toHaveAttribute("aria-invalid", "true");
    await expect(host.getByRole("textbox", { name: "Name" })).toHaveAccessibleDescription(
      "Fill this in.",
    );
    expect((await store(page)).calls).toEqual([]);
  });

  test("puts the server's refusal on the field it names, in fixed words, and focuses it", async ({
    page,
  }) => {
    await openEditor(page);
    await plan(page, { code: "validation", fields: ["primaryColor"] });
    await tabTo(page, "editor-harbour", "name");
    await page.keyboard.press("Enter");
    const host = editor(page, "editor-harbour");
    await expectAlert(
      host.locator('idg-alert[part="error"]'),
      "alert",
      "The kit was not saved: the fields marked below were refused.",
    );
    await expect.poll(() => focused(page)).toMatchObject({ control: "primary", tag: "input" });
    await expect(
      host.getByRole("textbox", { name: "Primary colour", exact: true }),
    ).toHaveAccessibleDescription(/The server refused this value\.$/);
    const { values, names } = await everything(page);
    expect(values.filter((value) => value.includes("The server said"))).toEqual([]);
    expect(names).not.toContain("script");
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBe(
      undefined,
    );
  });
});

test.describe("idg-brand-editor uploads", () => {
  test("keeps a clean logo as the sanitiser returns it and draws it, with nothing to report", async ({
    page,
  }) => {
    const watch = await openEditor(page);
    const host = editor(page, "editor-new");
    await upload(host, "mark").setInputFiles(svgFile("mark.svg", CLEAN));
    const thumbnail = host.locator("#mark-status idg-brand-logo img");
    await expect
      .poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    await expect(host.locator('[part="removals"]')).toHaveCount(0);
    await expect(host.locator('p[role="status"]')).toHaveText("The file was accepted as it is.");
    const expected = sanitiseSvgLogo(CLEAN);
    if (!expected.ok) throw new Error("the clean mark is refused");
    expect(expected.removedCount).toBe(0);
    expect(await watch.violations()).toEqual([]);
  });

  test("lists what was removed before the kit is saved, previews the cleaned logo and saves only that", async ({
    page,
  }) => {
    const watch = await openEditor(page);
    const host = editor(page, "editor-harbour");
    await upload(host, "logo").setInputFiles(svgFile("logo.svg", HOSTILE));
    const removals = host.locator('[part="removals"]');
    await expectAlert(removals, "alert", "The logo was cleaned: 5 parts were removed.");
    await expect(removals.locator("li")).toHaveText([
      "An event handler was removed (svg onload, line 1)",
      "Script or other active content was removed (script, line 1)",
      "An event handler was removed (rect onclick, line 1)",
      "Script or other active content was removed (image, line 1)",
      "Script or other active content was removed (a, line 1)",
    ]);
    expect((await store(page)).calls).toEqual([]);
    const cleaned = sanitiseSvgLogo(HOSTILE);
    if (!cleaned.ok) throw new Error("the hostile logo is refused");
    await expect
      .poll(() =>
        preview(host)
          .locator('idg-brand-logo[variant="logo"] img')
          .first()
          .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    await host.getByRole("button", { name: "Save brand kit" }).press("Enter");
    await expect.poll(async () => (await store(page)).calls.length).toBe(1);
    expect((await store(page)).calls[0]?.kit.logo).toBe(cleaned.svg);
    await expect(removals).toHaveCount(0);
    const { names, values } = await everything(page, "#editor-harbour");
    expect(names.filter((name) => ["script", "svg", "iframe", "object"].includes(name))).toEqual(
      [],
    );
    expect(values.filter((value) => /__pwned|example\.com|javascript:|onload/.test(value))).toEqual(
      [],
    );
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBe(
      undefined,
    );
    expect(watch.requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
    expect(await watch.violations()).toEqual([]);
  });

  test("reports what an editor's export loses, and can remove the logo instead of saving it", async ({
    page,
  }) => {
    await openEditor(page);
    const host = editor(page, "editor-new");
    await upload(host, "logo").setInputFiles(svgFile("inkscape.svg", INKSCAPE));
    await expect(host.locator('[part="removals"] li').first()).toHaveText(
      "An attribute that is not supported was removed (svg version, line 8)",
    );
    await host.getByRole("button", { name: "Remove the logo" }).press("Enter");
    await expect(host.locator('[part="removals"]')).toHaveCount(0);
    await expect(host.locator("#logo-status")).toHaveText("No logo yet.");
    expect(await focused(page)).toMatchObject({ id: "logo-file", editor: "editor-new" });
    await expect(host.locator('p[role="status"]')).toHaveText("Removed.");
  });

  test("refuses a file the sanitiser refuses, says why on the field, and keeps the logo it had", async ({
    page,
  }) => {
    await openEditor(page);
    const host = editor(page, "editor-harbour");
    await upload(host, "logo").setInputFiles(svgFile("logo.svg", REFUSED));
    await expect(host.locator('#logo-error[role="alert"]')).toHaveText(
      "The file declares a document type with its own definitions, which is not allowed.",
    );
    await expect(upload(host, "logo")).toHaveAttribute("aria-invalid", "true");
    await expect(upload(host, "logo")).toHaveAccessibleDescription(/document type/);
    await expect(upload(host, "logo")).toHaveValue("");
    const logo = await preview(host).evaluate(
      (guide) => (guide as HTMLElement & { kit?: { logo?: string } }).kit?.logo,
    );
    expect(logo).toBe(HARBOUR_KIT.logo);
  });

  test("refuses a file over the sanitiser's limit by its size, before reading a byte, whatever it is called", async ({
    page,
  }) => {
    await openEditor(page);
    const host = editor(page, "editor-new");
    const before = await page.evaluate(() => (window as unknown as { __reads: number[] }).__reads);
    await upload(host, "logo").setInputFiles(svgFile("photo.png", OVERSIZE, "image/png"));
    await expect(host.locator("#logo-error")).toHaveText(
      "The file is too large. A logo may be at most 512 KB.",
    );
    const reads = await page.evaluate(() => (window as unknown as { __reads: number[] }).__reads);
    expect(reads.slice(before.length)).toEqual([]);
    await upload(host, "mark").setInputFiles(svgFile("mark.png", CLEAN, "image/png"));
    await expect(host.locator("#mark-status idg-brand-logo")).toHaveCount(1);
    const after = await page.evaluate(() => (window as unknown as { __reads: number[] }).__reads);
    expect(after.slice(before.length)).toEqual([CLEAN.byteLength]);
  });

  test("keeps the untrusted kit's markup as values and text, and draws none of it", async ({
    page,
  }) => {
    const watch = await openEditor(page);
    const host = editor(page, "editor-hostile");
    await expect(textInput(host, "name")).toHaveValue(/^Hostile <img src=x onerror=/);
    await expect(host.locator("#logo-status")).toHaveText(
      "The kit's own file could not be used and was left out.",
    );
    const { names } = await everything(page);
    expect(names.filter((name) => ["script", "svg", "iframe", "style"].includes(name))).toEqual([]);
    await host.getByRole("button", { name: "Save brand kit" }).press("Enter");
    await expect(host.locator('idg-alert[part="error"]')).toHaveCount(1);
    expect((await store(page)).calls).toEqual([]);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBe(
      undefined,
    );
    expect(watch.requests.filter((url) => !url.startsWith(ORIGIN))).toEqual([]);
    expect(await watch.violations()).toEqual([]);
  });

  test("keeps nothing in the browser's storage", async ({ page }) => {
    await openEditor(page);
    const host = editor(page, "editor-new");
    await textInput(host, "name").fill("Copper Kettle");
    await textInput(host, "id").fill("copper-kettle");
    await textInput(host, "primary").fill("#b45309");
    await upload(host, "logo").setInputFiles(svgFile("logo.svg", HOSTILE));
    await host.getByRole("button", { name: "Save brand kit" }).press("Enter");
    await expect.poll(async () => (await store(page)).calls.length).toBe(1);
    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookie: document.cookie,
      databases: (await indexedDB.databases()).length,
      caches: (await caches.keys()).length,
    }));
    expect(stored).toEqual({ local: 0, session: 0, cookie: "", databases: 0, caches: 0 });
  });
});

test.describe("idg-brand-editor across the axes", () => {
  for (const design of DESIGNS) {
    for (const scheme of SCHEMES) {
      test(`has no axe violations in ${design} ${scheme}`, async ({ page }) => {
        await openEditor(page);
        await applyAxes(page, { design, scheme });
        await expectNoAxeViolations(page);
      });
    }
  }

  for (const ux of UX_MODES) {
    test(`has no axe violations in the ${ux} UX mode, with errors and removals shown`, async ({
      page,
    }) => {
      await openEditor(page);
      const host = editor(page, "editor-new");
      await upload(host, "logo").setInputFiles(svgFile("logo.svg", HOSTILE));
      await expect(host.locator('[part="removals"]')).toHaveCount(1);
      await textInput(host, "primary").fill("red");
      await host.getByRole("button", { name: "Save brand kit" }).press("Enter");
      await expect(host.locator('idg-alert[part="error"]')).toHaveCount(1);
      await applyAxes(page, { ux });
      await expectNoAxeViolations(page);
    });
  }

  for (const theme of THEMES) {
    test(`has no axe violations in the ${theme} theme, in both schemes`, async ({ page }) => {
      await openEditor(page);
      for (const scheme of SCHEMES) {
        await applyAxes(page, { theme, scheme });
        await expectNoAxeViolations(page);
      }
    });
  }

  test("reads its errors at 4.5:1 and draws each picker's edge at 3:1, in every theme and scheme", async ({
    page,
  }) => {
    await openEditor(page);
    const host = editor(page, "editor-new");
    await host.getByRole("button", { name: "Save brand kit" }).press("Enter");
    await upload(host, "logo").setInputFiles(svgFile("logo.svg", REFUSED));
    await expect(host.locator("#logo-error")).not.toBeEmpty();
    let measured = 0;
    for (const theme of THEMES) {
      for (const scheme of SCHEMES) {
        await applyAxes(page, { theme, scheme });
        const found = await host.evaluate((element) => {
          const root = element.shadowRoot;
          const error = root?.querySelector("#logo-error");
          const pickers = [...(root?.querySelectorAll(".picker") ?? [])].map((picker) => {
            const box = picker.closest("idg-input")?.shadowRoot?.querySelector(".box");
            return {
              edge: getComputedStyle(picker).borderTopColor,
              behind: box ? getComputedStyle(box).backgroundColor : "",
            };
          });
          return {
            error: error
              ? {
                  text: getComputedStyle(error).color,
                  behind: getComputedStyle(error).backgroundColor,
                }
              : undefined,
            pickers,
          };
        });
        if (found.error === undefined) throw new Error("no error shown");
        expect(
          contrastRatio(found.error.text, found.error.behind),
          `${theme} ${scheme} error`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(found.pickers).toHaveLength(3);
        for (const picker of found.pickers) {
          expect(
            contrastRatio(picker.edge, picker.behind),
            `${theme} ${scheme} picker: ${picker.edge} on ${picker.behind}`,
          ).toBeGreaterThanOrEqual(3);
          measured += 1;
        }
      }
    }
    expect(measured).toBe(THEMES.length * SCHEMES.length * 3);
  });

  test("each design draws a group of fields its own way, the layout sets its gaps and the UX mode its text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await openEditor(page);
    const host = editor(page, "editor-harbour");
    const read = (pick: (element: Element) => string) => host.evaluate(pick);
    const signatures = new Set<string>();
    for (const design of DESIGNS) {
      await applyAxes(page, { design });
      signatures.add(
        await read((element) => {
          const group = getComputedStyle(element.shadowRoot?.querySelector(".group") ?? element);
          return [
            group.borderTopStyle,
            group.borderTopWidth,
            group.borderTopLeftRadius,
            group.boxShadow,
            group.backdropFilter,
          ].join(" | ");
        }),
      );
    }
    expect(signatures.size).toBe(DESIGNS.length);
    const gaps = new Set<string>();
    for (const layout of LAYOUTS) {
      await applyAxes(page, { layout });
      gaps.add(
        await read(
          (element) =>
            getComputedStyle(element.shadowRoot?.querySelector(".editor") ?? element).rowGap,
        ),
      );
    }
    expect(gaps.size).toBeGreaterThan(2);
    const sizes = new Set<string>();
    for (const ux of UX_MODES) {
      await applyAxes(page, { ux });
      sizes.add(
        await read(
          (element) =>
            getComputedStyle(element.shadowRoot?.querySelector(".legend") ?? element).fontSize,
        ),
      );
    }
    expect(sizes.size).toBeGreaterThan(1);
  });

  // As every reduced-motion check of the library measures it: the motion tokens shrink each
  // transition to at most a millisecond, so nothing is seen to move.
  test("moves nothing when reduced motion is asked for", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openEditor(page);
    const moving = await editor(page, "editor-harbour").evaluate((host) => {
      const all = (root: ParentNode): Element[] =>
        [...root.querySelectorAll("*")].flatMap((node) => [
          node,
          ...(node.shadowRoot ? all(node.shadowRoot) : []),
        ]);
      const seconds = (value: string) =>
        Math.max(
          ...value.split(",").map((part) => {
            const text = part.trim();
            return text.endsWith("ms") ? Number.parseFloat(text) / 1000 : Number.parseFloat(text);
          }),
        );
      const elements = all(host.shadowRoot ?? host);
      return {
        count: elements.length,
        moving: elements
          .filter((element) => {
            const style = getComputedStyle(element);
            const transition = seconds(style.transitionDuration) + seconds(style.transitionDelay);
            const animation = style.animationName === "none" ? 0 : seconds(style.animationDuration);
            return transition > 0.001 || animation > 0.001;
          })
          .map((element) => `${element.localName}.${element.className}`),
      };
    });
    expect(moving.count).toBeGreaterThan(100);
    expect(moving.moving).toEqual([]);
  });
});

/**
 * Each colour field's hex input, in every editor: whether the widest `#rrggbb` it can hold shows
 * whole in it, and whether its invalid mark, where it shows one, is inside its box. The widest is
 * found in the input's own font: `#000000`, and six of whichever valid hex digit is widest there.
 * The value is set on the native input only to be measured, and put back.
 */
function colourInputs(page: Page) {
  return page.evaluate(() => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("no canvas");
    const inside = (inner: DOMRect, outer: DOMRect) =>
      inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5;
    return [...document.querySelectorAll("idg-brand-editor")].flatMap((editor) =>
      [...(editor.shadowRoot?.querySelectorAll("idg-input") ?? [])]
        .filter((input) => input.querySelector(".picker") !== null)
        .map((input) => {
          const root = input.shadowRoot;
          const native = root?.querySelector("input.native");
          const box = root?.querySelector(".box");
          if (!(native instanceof HTMLInputElement) || !box) throw new Error("no hex input");
          const style = getComputedStyle(native);
          context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          const digits = "0 1 2 3 4 5 6 7 8 9 a b c d e f A B C D E F".split(" ");
          const widest = digits.reduce((wide, digit) =>
            context.measureText(digit).width > context.measureText(wide).width ? digit : wide,
          );
          const kept = native.value;
          const cropped = ["#000000", `#${widest.repeat(6)}`].filter((value) => {
            native.value = value;
            return native.scrollWidth > native.clientWidth;
          });
          native.value = kept;
          const mark = root?.querySelector(".invalid-mark")?.getBoundingClientRect();
          return {
            field: `${editor.id} ${input.getAttribute("name") ?? ""}`,
            cropped,
            mark:
              mark === undefined || inside(mark, box.getBoundingClientRect()) ? "inside" : "out",
          };
        }),
    );
  });
}

const fitting = (fields: readonly { field: string; cropped: readonly string[]; mark: string }[]) =>
  fields.filter((field) => field.cropped.length > 0 || field.mark !== "inside");

/**
 * Each image upload, in every editor, whose content is wider than its box. The file chooser's
 * button and file name are drawn inside the browser's own control, which clips them, so a crop
 * shows only as the input's scroll width exceeding its client width.
 */
function clippedFileInputs(page: Page) {
  return page.evaluate(() => {
    const inputs = [...document.querySelectorAll("idg-brand-editor")].flatMap((editor) =>
      [...(editor.shadowRoot?.querySelectorAll('input[type="file"]') ?? [])].map((input) => ({
        field: `${editor.id} ${input.id}`,
        clipped: input.scrollWidth > input.clientWidth,
      })),
    );
    return {
      count: inputs.length,
      clipped: inputs.filter((input) => input.clipped).map((input) => input.field),
    };
  });
}

/**
 * Each image upload, in every editor, whose chooser label's widest word leaves the button less than
 * `SPARE_PX` to spare. The label lives in the browser's own control, out of reach, and the button
 * breaks a word that does not fit rather than clip it; so for the measure only, the button is sized
 * to its min-content with no breaking inside words, which is its widest word plus its own padding
 * and border, and that plus the spare must fit in the input. The spare keeps a token a pixel wider
 * from breaking a word unseen.
 */
const SPARE_PX = 4;

function brokenFileLabels(page: Page) {
  return page.evaluate(
    (spare) =>
      [...document.querySelectorAll("idg-brand-editor")].flatMap((editor) => {
        const root = editor.shadowRoot;
        if (!root) throw new Error("no shadow root");
        // A constructed sheet, as the page's policy refuses a style element.
        const unbroken = new CSSStyleSheet();
        unbroken.replaceSync(
          `.file::file-selector-button {
          inline-size: min-content !important;
          max-inline-size: none !important;
          overflow-wrap: normal !important;
        }`,
        );
        // A copy: the adopted list is live, so the one read here would take the added sheet too.
        const sheets = [...root.adoptedStyleSheets];
        root.adoptedStyleSheets = [...sheets, unbroken];
        try {
          return [...root.querySelectorAll('input[type="file"]')].flatMap((input) => {
            const needed = Number.parseFloat(
              getComputedStyle(input, "::file-selector-button").width,
            );
            return needed + spare > input.clientWidth
              ? [
                  `${editor.id} ${input.id} needs ${needed.toFixed(1)}px of ${String(input.clientWidth)}px`,
                ]
              : [];
          });
        } finally {
          root.adoptedStyleSheets = sheets;
        }
      }),
    SPARE_PX,
  );
}

/**
 * Whatever, in every editor, is not padded as its form's width in its own text asks, read as
 * computed against the tokens resolved in that form. Below `NARROW_EM` the hex boxes pad
 * `--idg-space-3xs`; below `SQUEEZED_EM` the groups pad `--idg-space-3xs` inline, each file input
 * is pulled out over that padding to span the group's padding box, and its button spans the input
 * with no inline padding; otherwise groups and buttons pad as everywhere.
 */
const NARROW_EM = 20;
const SQUEEZED_EM = 10.5;

function unnarrowedPaddings(page: Page) {
  return page.evaluate(
    ({ narrowEm, squeezedEm }) =>
      [...document.querySelectorAll("idg-brand-editor")].flatMap((editor) => {
        const form = editor.shadowRoot?.querySelector(".form");
        if (!form) throw new Error("no form");
        const resolve = (value: string) => {
          const probe = document.createElement("div");
          probe.style.paddingInline = value;
          form.append(probe);
          const resolved = getComputedStyle(probe).paddingLeft;
          probe.remove();
          return resolved;
        };
        const ems =
          form.getBoundingClientRect().width / Number.parseFloat(getComputedStyle(form).fontSize);
        const squeezed = ems < squeezedEm;
        const tier = squeezed ? "squeezed" : ems < narrowEm ? "narrow" : "wide";
        const box = resolve("var(--idg-space-3xs)");
        const group = squeezed
          ? box
          : resolve("calc(var(--idg-space-s) * var(--idg-density-gap-scale))");
        const button = squeezed ? "0px" : resolve("var(--idg-density-control-padding-inline)");
        const padded = (name: string, style: CSSStyleDeclaration, expected: string) =>
          style.paddingLeft === expected && style.paddingRight === expected
            ? []
            : [
                `${editor.id} ${tier} ${name} ${style.paddingLeft} ${style.paddingRight} not ${expected}`,
              ];
        return [
          ...[...form.querySelectorAll(".group")].flatMap((element, index) =>
            padded(`group ${String(index)}`, getComputedStyle(element), group),
          ),
          ...(tier === "wide"
            ? []
            : [...form.querySelectorAll("idg-input.colour")].flatMap((input) => {
                const hexBox = input.shadowRoot?.querySelector(".box");
                if (!hexBox) throw new Error("no hex box");
                return padded(
                  `box ${input.getAttribute("name") ?? ""}`,
                  getComputedStyle(hexBox),
                  box,
                );
              })),
          ...[...form.querySelectorAll('input[type="file"]')].flatMap((input) => {
            const style = getComputedStyle(input, "::file-selector-button");
            const spans = Math.abs(Number.parseFloat(style.width) - input.clientWidth) <= 0.5;
            const fieldset = input.closest(".group");
            if (!fieldset) throw new Error("no group");
            // The group's padding box: its border box less its borders.
            const outer = fieldset.getBoundingClientRect();
            const sides = getComputedStyle(fieldset);
            const left = outer.left + Number.parseFloat(sides.borderLeftWidth);
            const right = outer.right - Number.parseFloat(sides.borderRightWidth);
            const own = input.getBoundingClientRect();
            const pulled = Math.abs(own.left - left) <= 0.5 && Math.abs(own.right - right) <= 0.5;
            return [
              ...padded(`${input.id} button`, style, button),
              ...(pulled === squeezed
                ? []
                : [
                    `${editor.id} ${tier} ${input.id} at ${own.left.toFixed(1)} to ${own.right.toFixed(1)} in a padding box at ${left.toFixed(1)} to ${right.toFixed(1)}`,
                  ]),
              ...(spans === squeezed
                ? []
                : [
                    `${editor.id} ${tier} ${input.id} button ${style.width} wide of ${String(input.clientWidth)}px`,
                  ]),
            ];
          }),
        ];
      }),
    { narrowEm: NARROW_EM, squeezedEm: SQUEEZED_EM },
  );
}

test.describe("idg-brand-editor reflow", () => {
  for (const layout of LAYOUTS) {
    for (const size of TEXT_SIZES) {
      test(`has no sideways scroll at 320px in the ${layout} layout at ${size.label}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await openEditor(page);
        await applyAxes(page, { layout });
        await setTextSize(page, size);
        // The empty kit's colour is marked invalid, so its mark is measured too.
        await editor(page, "editor-new")
          .getByRole("button", { name: "Save brand kit" })
          .press("Enter");
        await expect
          .poll(async () => {
            const found = await measureReflow(page, EDITORS);
            const colours = await colourInputs(page);
            const files = await clippedFileInputs(page);
            return {
              page: found.page <= 0,
              wider: found.wider,
              hosts: found.hosts,
              measured: found.elements > 500,
              colours: colours.length,
              misfits: fitting(colours),
              files: files.count,
              clipped: files.clipped,
              broken: await brokenFileLabels(page),
              unnarrowed: await unnarrowedPaddings(page),
            };
          })
          .toEqual({
            page: true,
            wider: [0, 0, 0],
            hosts: 3,
            measured: true,
            colours: 9,
            misfits: [],
            files: 6,
            clipped: [],
            broken: [],
            unnarrowed: [],
          });
      });
    }
  }

  // The file chooser's label is the browser's, in the control font each design and UX mode sets,
  // so its widest word is measured in every pairing of them at the narrowest width, at each text
  // size up to 200%.
  test("fits the file chooser's widest word with room to spare in every design and UX mode at 320px, text 100% to 200%", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 320, height: 800 });
    await openEditor(page);
    const sizes = ["100%", "125%", "150%", "175%", "200%"];
    const broken: string[] = [];
    let measured = 0;
    for (const size of sizes) {
      await page.evaluate((fontSize) => {
        document.documentElement.style.fontSize = fontSize;
      }, size);
      for (const design of DESIGNS) {
        for (const ux of UX_MODES) {
          await applyAxes(page, { design, ux });
          measured += 1;
          broken.push(
            ...(await brokenFileLabels(page)).map((input) => `${size} ${design} ${ux} ${input}`),
          );
        }
      }
    }
    expect(measured).toBe(5 * 64);
    expect(broken).toEqual([]);
  });

  test("pads groups and file chooser buttons as everywhere beside the preview at 1280px and at 320px with 100% text", async ({
    page,
  }) => {
    await openEditor(page);
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await settle(page);
      const tiers = await page.evaluate(() =>
        [...document.querySelectorAll("idg-brand-editor")].map((editor) => {
          const form = editor.shadowRoot?.querySelector(".form");
          if (!form) throw new Error("no form");
          return (
            form.getBoundingClientRect().width / Number.parseFloat(getComputedStyle(form).fontSize)
          );
        }),
      );
      expect(tiers.every((ems) => ems >= SQUEEZED_EM)).toBe(true);
      expect(await unnarrowedPaddings(page)).toEqual([]);
    }
  });

  // The threshold itself: the form is set to a width of its own text a little above and a little
  // below it, so a threshold that drifted (a rule at 10em, or in rem) fails here, not only where the
  // fixtures happen to land.
  for (const fontSize of ["100%", "200%"]) {
    test(`switches to the squeezed padding at ${String(SQUEEZED_EM)}em of form width, text at ${fontSize}: just above it the groups pad as everywhere, just below they pad the narrow amount`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await openEditor(page);
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = size;
      }, fontSize);
      const read = async (offset: number) => {
        const found = await page.evaluate(
          async ({ squeezedEm, offsetPx }) => {
            const host = document.querySelector<HTMLElement>("#editor-new");
            const form = host?.shadowRoot?.querySelector(".form");
            const group = form?.querySelector(".group");
            const file = form?.querySelector(".image-row .file");
            if (!host || !form || !group || !file) throw new Error("no form");
            host.style.flex = "none";
            const base = Number.parseFloat(getComputedStyle(form).fontSize);
            host.style.inlineSize = `${String(squeezedEm * base + offsetPx)}px`;
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            );
            const resolve = (value: string) => {
              const probe = document.createElement("div");
              probe.style.paddingInline = value;
              form.append(probe);
              const resolved = getComputedStyle(probe).paddingLeft;
              probe.remove();
              return resolved;
            };
            const ems =
              form.getBoundingClientRect().width /
              Number.parseFloat(getComputedStyle(form).fontSize);
            return {
              ems,
              padding: getComputedStyle(group).paddingLeft,
              pulledOut: getComputedStyle(file).marginLeft,
              narrow: resolve("var(--idg-space-3xs)"),
              regular: resolve("calc(var(--idg-space-s) * var(--idg-density-gap-scale))"),
            };
          },
          { squeezedEm: SQUEEZED_EM, offsetPx: offset },
        );
        return found;
      };
      const above = await read(2);
      expect(above.ems).toBeGreaterThan(SQUEEZED_EM);
      expect(above.padding).toBe(above.regular);
      expect(above.pulledOut).toBe("0px");
      const below = await read(-2);
      expect(below.ems).toBeLessThan(SQUEEZED_EM);
      expect(below.padding).toBe(below.narrow);
      expect(below.pulledOut).toBe(`-${below.narrow}`);
    });
  }

  // The narrowest form there is, 320px with 200% text, is about 5.5em wide. There the remove
  // button's label keeps each word whole, but a legend does not in the designs that set it in
  // capitals or a wide display face (brutalist, pixel): its widest word, at the larger display
  // step, needs about 7em of form, and `overflow-wrap: anywhere` breaks it inside itself instead of
  // letting it leave the group. Legends are held to whole words from 8em, and the narrower case
  // is a known gap.
  for (const [ems, legends] of [
    [5.5, false],
    [6, false],
    [8, true],
  ] as const) {
    test(`keeps each word of ${legends ? "a legend and of " : ""}a remove button whole in a form ${String(ems)}em wide, text at 200%, in every design`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await openEditor(page);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      const broken: string[] = [];
      for (const design of DESIGNS) {
        await applyAxes(page, { design });
        broken.push(
          ...(await page.evaluate(
            async ({ width, name, legends: checkLegends }) => {
              const host = document.querySelector<HTMLElement>("#editor-harbour");
              const form = host?.shadowRoot?.querySelector(".form");
              if (!host?.shadowRoot || !form) throw new Error("no form");
              host.style.flex = "none";
              host.style.inlineSize = `${String(width * Number.parseFloat(getComputedStyle(form).fontSize))}px`;
              await new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              );
              const context = document.createElement("canvas").getContext("2d");
              if (!context) throw new Error("no canvas");
              const found: string[] = [];
              const check = (what: string, element: Element) => {
                const style = getComputedStyle(element);
                context.font = style.font;
                const text =
                  style.textTransform === "uppercase"
                    ? element.textContent.toUpperCase()
                    : element.textContent;
                const widest = Math.max(
                  ...text
                    .trim()
                    .split(/\s+/)
                    .map((word) => context.measureText(word).width),
                );
                const box = element.getBoundingClientRect().width;
                if (widest > box + 1) {
                  found.push(
                    `${name} ${what}: a ${String(Math.round(widest))}px word in ${String(Math.round(box))}px`,
                  );
                }
              };
              for (const legend of checkLegends
                ? host.shadowRoot.querySelectorAll(".legend")
                : []) {
                check(`legend ${legend.textContent.trim()}`, legend);
              }
              for (const button of host.shadowRoot.querySelectorAll("idg-button.remove")) {
                const label = button.shadowRoot?.querySelector('[part="label"]');
                if (!label) throw new Error("no label");
                check(`remove ${button.textContent.trim()}`, label);
              }
              return found;
            },
            { width: ems, name: design, legends },
          )),
        );
      }
      expect(broken).toEqual([]);
    });
  }

  test("pulls a squeezed form's file inputs out over the group padding in right-to-left text too", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openEditor(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
      document.documentElement.dir = "rtl";
    });
    await settle(page);
    const found = await measureReflow(page, EDITORS);
    expect({
      page: found.page <= 0,
      wider: found.wider,
      clipped: (await clippedFileInputs(page)).clipped,
      unnarrowed: await unnarrowedPaddings(page),
    }).toEqual({ page: true, wider: [0, 0, 0], clipped: [], unnarrowed: [] });
  });

  test("reflows at 200% text with errors and removals shown, nothing wider than its host", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openEditor(page);
    const host = editor(page, "editor-new");
    await upload(host, "logo").setInputFiles(svgFile("logo.svg", HOSTILE));
    await upload(host, "mark").setInputFiles(svgFile("mark.svg", REFUSED));
    await host.getByRole("button", { name: "Save brand kit" }).press("Enter");
    await expect(host.locator('idg-alert[part="error"]')).toHaveCount(1);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expect
      .poll(async () => {
        const found = await measureReflow(page, EDITORS);
        const colours = await colourInputs(page);
        const files = await clippedFileInputs(page);
        return {
          page: found.page <= 0,
          wider: found.wider,
          hosts: found.hosts,
          colours: colours.length,
          misfits: fitting(colours),
          files: files.count,
          clipped: files.clipped,
          broken: await brokenFileLabels(page),
          unnarrowed: await unnarrowedPaddings(page),
        };
      })
      .toEqual({
        page: true,
        wider: [0, 0, 0],
        hosts: 3,
        colours: 9,
        misfits: [],
        files: 6,
        clipped: [],
        broken: [],
        unnarrowed: [],
      });
  });
});
