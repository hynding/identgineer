import { readFileSync } from "node:fs";
import {
  emitBrandThemeCss,
  emitBrandThemeTokens,
  generateBrandTheme,
  parseBrandKit,
  type BrandTheme,
} from "@identgineer/brand";
import { h, render } from "@stencil/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../button/button";
import "./brand-export";

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);
const result = parseBrandKit(
  JSON.parse(readFileSync(new URL("harbour-lights.kit.json", FIXTURES), "utf8")),
);
if (!result.ok) throw new Error("the fixture kit is not a kit");
const THEME: BrandTheme = generateBrandTheme(result.kit);
const CSS = emitBrandThemeCss(THEME);
const TOKENS = emitBrandThemeTokens(THEME);

const shadow = (root: HTMLElement): ShadowRoot => {
  if (!root.shadowRoot) throw new Error("idg-brand-export has no shadow root");
  return root.shadowRoot;
};
const all = (root: HTMLElement, selector: string) => [...shadow(root).querySelectorAll(selector)];
const one = (root: HTMLElement, selector: string) => shadow(root).querySelector(selector);
const text = (element: Element | null | undefined) =>
  (element?.textContent ?? "").replaceAll(/\s+/g, " ").trim();
const code = (root: HTMLElement, artefact: string) =>
  one(root, `[data-artefact="${artefact}"] pre code`)?.textContent;
const status = (root: HTMLElement) => text(one(root, '[role="status"]'));

/** The details of each `name` event the element fires. */
function listen(root: HTMLElement, name: string): unknown[] {
  const details: unknown[] = [];
  root.addEventListener(name, (event) => {
    details.push((event as CustomEvent).detail);
  });
  return details;
}

async function press(root: HTMLElement, action: string, waitForChanges: () => Promise<void>) {
  const button = one(root, `[data-action="${action}"]`) as HTMLElement | null;
  if (!button) throw new Error(`no ${action} button`);
  button.click();
  await waitForChanges();
  await Promise.resolve();
  await waitForChanges();
}

describe("idg-brand-export with the texts", () => {
  it("shows each artefact exactly as given, as text in a code block", async () => {
    const { root } = await render(
      <idg-brand-export css={CSS} tokens={TOKENS} themeId="harbour" name="Harbour Lights" />,
    );
    expect(code(root, "css")).toBe(CSS);
    expect(code(root, "tokens")).toBe(TOKENS);
    expect(code(root, "snippet")).toContain('<html data-theme="harbour">');
    for (const pre of all(root, "pre")) expect(pre.querySelector("code")).not.toBeNull();
  });

  it("puts each artefact in a focusable, scrollable region named by its heading", async () => {
    const { root } = await render(
      <idg-brand-export css={CSS} tokens={TOKENS} themeId="harbour" name="Harbour Lights" />,
    );
    const regions = all(root, '[role="region"]');
    expect(regions).toHaveLength(3);
    const names = regions.map((region) => {
      expect(region.getAttribute("tabindex")).toBe("0");
      return text(shadow(root).getElementById(region.getAttribute("aria-labelledby") ?? ""));
    });
    expect(names).toEqual(["Stylesheet", "Design tokens", "Use it"]);
  });

  it("heads each artefact at level 2, or the level given, and falls back for one that is not a level", async () => {
    const { root, setProps } = await render(<idg-brand-export css={CSS} tokens={TOKENS} />);
    expect(all(root, "h2").map(text)).toEqual(["Stylesheet", "Design tokens"]);
    await setProps({ headingLevel: 4 });
    expect(all(root, "h4").map(text)).toEqual(["Stylesheet", "Design tokens"]);
    await setProps({ headingLevel: 0 });
    expect(all(root, "h2")).toHaveLength(2);
  });

  it("names the files the artefacts download as, from the brand's name", async () => {
    const { root } = await render(
      <idg-brand-export css={CSS} tokens={TOKENS} name="Harbour Lights" />,
    );
    expect(text(one(root, '[data-artefact="css"] .hint'))).toContain("harbour-lights.css");
    expect(text(one(root, '[data-artefact="tokens"] .hint'))).toContain("harbour-lights.json");
  });

  it("is a group named by label, or by a default", async () => {
    const named = await render(<idg-brand-export css={CSS} label="Harbour files" />);
    expect(one(named.root, '[part="export"]')?.getAttribute("aria-label")).toBe("Harbour files");
    const unnamed = await render(<idg-brand-export css={CSS} />);
    expect(one(unnamed.root, '[part="export"]')?.getAttribute("aria-label")).toBe(
      "Brand theme files",
    );
  });

  it("has a copy and a download button for each file, and a copy button for the snippet", async () => {
    const { root } = await render(
      <idg-brand-export css={CSS} tokens={TOKENS} themeId="harbour" name="Harbour Lights" />,
    );
    expect(
      all(root, "idg-button").map((button) => [button.getAttribute("data-action"), text(button)]),
    ).toEqual([
      ["copy-css", "Copy stylesheet"],
      ["download-css", "Download stylesheet"],
      ["copy-tokens", "Copy design tokens"],
      ["download-tokens", "Download design tokens"],
      ["copy-snippet", "Copy snippet"],
    ]);
  });

  it("has one polite live region for what follows an action", async () => {
    const { root } = await render(<idg-brand-export css={CSS} />);
    const regions = all(root, '[role="status"]');
    expect(regions).toHaveLength(1);
    expect(regions[0]?.getAttribute("aria-live")).toBe("polite");
    expect(regions[0]?.getAttribute("aria-atomic")).toBe("true");
  });

  it("says there is nothing to export when it has nothing", async () => {
    const { root } = await render(<idg-brand-export />);
    expect(text(one(root, '[part="empty"]'))).toBe("There is nothing to export yet.");
    expect(all(root, "pre")).toHaveLength(0);
  });

  it("takes its words from labels", async () => {
    const { root } = await render(
      <idg-brand-export
        css={CSS}
        labels={{ cssHeading: "Stilvorlage", copy: "{artefact} kopieren", cssName: "Stilvorlage" }}
      />,
    );
    expect(all(root, "h2").map(text)).toEqual(["Stilvorlage"]);
    expect(text(one(root, '[data-action="copy-css"]'))).toBe("Stilvorlage kopieren");
  });
});

describe("idg-brand-export with a theme", () => {
  it("emits the stylesheet and the tokens from it, and takes the id and the name from it", async () => {
    const { root } = await render(<idg-brand-export theme={THEME} />);
    expect(code(root, "css")).toBe(CSS);
    expect(code(root, "tokens")).toBe(TOKENS);
    expect(code(root, "snippet")).toContain('<html data-theme="harbour-lights">');
    expect(text(one(root, '[data-artefact="css"] .hint'))).toContain("harbour-lights.css");
  });

  it("lets the texts it is given stand in place of what it would emit", async () => {
    const { root } = await render(<idg-brand-export theme={THEME} css="a { }" />);
    expect(code(root, "css")).toBe("a { }");
    expect(code(root, "tokens")).toBe(TOKENS);
  });

  it("says so, and shows no file, for a theme that no longer matches its kit", async () => {
    const altered = { ...THEME, document: { ...THEME.document, $description: "changed" } };
    const { root } = await render(<idg-brand-export theme={altered} />);
    expect(text(one(root, '[part="problem"]'))).toBe(
      "The theme could not be turned into files: it no longer matches its brand kit.",
    );
    expect(all(root, "pre")).toHaveLength(0);
  });

  it("follows a new theme", async () => {
    const { root, setProps } = await render(<idg-brand-export theme={THEME} />);
    const other = parseBrandKit({
      id: "kilnworks",
      name: "Kilnworks",
      colors: { primary: "#c2410c" },
      typography: "system",
      corners: "sharp",
      tone: "vivid",
    });
    if (!other.ok) throw new Error("expected a kit");
    const next = generateBrandTheme(other.kit);
    await setProps({ theme: next });
    expect(code(root, "css")).toBe(emitBrandThemeCss(next));
    expect(code(root, "snippet")).toContain('data-theme="kilnworks"');
  });
});

describe("idg-brand-export copying", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });
  });

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
  });

  it("writes exactly the text shown to the clipboard, says so, and fires idgCopy", async () => {
    const { root, waitForChanges } = await render(
      <idg-brand-export css={CSS} tokens={TOKENS} themeId="harbour" name="Harbour Lights" />,
    );
    const events = listen(root, "idgCopy");
    await press(root, "copy-css", waitForChanges);
    expect(writeText).toHaveBeenCalledWith(CSS);
    expect(status(root)).toBe("The stylesheet was copied.");
    expect(events).toEqual([{ artefact: "css" }]);
    await press(root, "copy-tokens", waitForChanges);
    expect(writeText).toHaveBeenLastCalledWith(TOKENS);
    await press(root, "copy-snippet", waitForChanges);
    expect(writeText).toHaveBeenLastCalledWith(code(root, "snippet"));
    expect(events).toEqual([{ artefact: "css" }, { artefact: "tokens" }, { artefact: "snippet" }]);
  });

  it("says it again when the same thing is done twice, in the other of two nodes", async () => {
    const { root, waitForChanges } = await render(<idg-brand-export css={CSS} />);
    await press(root, "copy-css", waitForChanges);
    const first = all(root, '[role="status"] span').map(text);
    await press(root, "copy-css", waitForChanges);
    const second = all(root, '[role="status"] span').map(text);
    expect(first).toEqual(["", "The stylesheet was copied."]);
    expect(second).toEqual(["The stylesheet was copied.", ""]);
  });

  it("selects the text and says so when the clipboard refuses, and fires no idgCopy", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const selected: Node[] = [];
    Object.defineProperty(globalThis, "getSelection", {
      configurable: true,
      value: () => ({
        removeAllRanges: () => undefined,
        selectAllChildren: (node: Node) => selected.push(node),
      }),
    });
    const { root, waitForChanges } = await render(<idg-brand-export css={CSS} tokens={TOKENS} />);
    const events = listen(root, "idgCopy");
    await press(root, "copy-css", waitForChanges);
    expect(status(root)).toBe(
      "The stylesheet could not be copied, so it is selected: copy it yourself.",
    );
    expect(events).toHaveLength(0);
    expect(selected).toEqual([one(root, '[data-artefact="css"] pre code')]);
    Reflect.deleteProperty(globalThis, "getSelection");
  });

  it("says the same when there is no clipboard api at all", async () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    const { root, waitForChanges } = await render(<idg-brand-export css={CSS} />);
    const events = listen(root, "idgCopy");
    await press(root, "copy-css", waitForChanges);
    expect(status(root)).toContain("could not be copied");
    expect(events).toHaveLength(0);
  });
});

let urls = 0;

describe("idg-brand-export downloading", () => {
  let blobs: Blob[];
  let revoked: string[];
  const clicked: { href: string; download: string }[] = [];

  beforeEach(() => {
    blobs = [];
    revoked = [];
    clicked.length = 0;
    // Each url is its own, because an earlier test's timer may still revoke one.
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      urls += 1;
      return `blob:test/${String(urls)}`;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.push(url);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function mount(props: Record<string, unknown> = {}) {
    const rendered = await render(
      <idg-brand-export css={CSS} tokens={TOKENS} name="Harbour Lights" {...props} />,
    );
    // The anchor is put in the page's tree for the click, so the click is seen as it passes.
    shadow(rendered.root).addEventListener("click", (event) => {
      const target = event.target as HTMLAnchorElement | null;
      if (target?.localName === "a") {
        clicked.push({
          href: target.getAttribute("href") ?? "",
          download: target.download,
        });
      }
    });
    return rendered;
  }

  it("downloads the stylesheet as a text/css blob of exactly the text, under a file name from the brand's name", async () => {
    const { root, waitForChanges } = await mount();
    const events = listen(root, "idgDownload");
    await press(root, "download-css", waitForChanges);
    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe("text/css");
    expect(await blobs[0]?.text()).toBe(CSS);
    expect(clicked).toEqual([
      { href: `blob:test/${String(urls)}`, download: "harbour-lights.css" },
    ]);
    expect(status(root)).toBe("The stylesheet was downloaded as harbour-lights.css.");
    expect(events).toEqual([{ artefact: "css" }]);
  });

  it("downloads the tokens as application/json", async () => {
    const { root, waitForChanges } = await mount();
    await press(root, "download-tokens", waitForChanges);
    expect(blobs[0]?.type).toBe("application/json");
    expect(await blobs[0]?.text()).toBe(TOKENS);
    expect(clicked[0]?.download).toBe("harbour-lights.json");
  });

  it("revokes the object url afterwards and leaves no anchor behind", async () => {
    const { root, waitForChanges } = await mount();
    await press(root, "download-css", waitForChanges);
    const url = `blob:test/${String(urls)}`;
    expect(all(root, "a")).toHaveLength(0);
    expect(revoked).not.toContain(url);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(revoked.filter((revokedUrl) => revokedUrl === url)).toEqual([url]);
  });

  it("falls back to `brand` and never lets the name decide anything but letters, digits and hyphens", async () => {
    const hostile = await mount({ name: "../../etc/passwd\u0000<img>" });
    await press(hostile.root, "download-css", hostile.waitForChanges);
    expect(clicked[0]?.download).toBe("etc-passwd-img.css");
    const none = await mount({ name: undefined });
    await press(none.root, "download-tokens", none.waitForChanges);
    expect(clicked[1]?.download).toBe("brand.json");
  });

  it("says so, and fires no idgDownload, when the browser will not make the file", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("no");
    });
    const { root, waitForChanges } = await mount();
    const events = listen(root, "idgDownload");
    await press(root, "download-css", waitForChanges);
    expect(status(root)).toBe("The stylesheet could not be downloaded.");
    expect(events).toHaveLength(0);
  });
});

describe("idg-brand-export with data it cannot trust", () => {
  const CANARY =
    '</code></pre><img src=x onerror="window.__pwned = 1"><script>window.__pwned = 1</script>';

  it("shows markup as text and builds no element from it", async () => {
    const { root } = await render(<idg-brand-export css={CANARY} tokens={CANARY} />);
    expect(code(root, "css")).toBe(CANARY);
    expect(all(root, "img, script")).toHaveLength(0);
    expect(shadow(root).innerHTML).toContain("&lt;/code&gt;");
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it.each([
    ["null", null],
    ["an empty string", ""],
    ["a string past two million characters", "x".repeat(2_000_001)],
    [
      "a throwing proxy",
      new Proxy(
        {},
        {
          get: () => {
            throw new Error("no");
          },
        },
      ),
    ],
  ])("leaves out an artefact that is %s", async (_name, value) => {
    const { root } = await render(
      <idg-brand-export css={value as unknown as string} tokens={TOKENS} />,
    );
    expect(all(root, '[data-artefact="css"]')).toHaveLength(0);
    expect(code(root, "tokens")).toBe(TOKENS);
  });

  it.each([
    ["markup", '"><img src=x>'],
    ["a quote", 'a"b'],
    ["upper case", "Harbour"],
    ["a number", 4],
    ["too long", "a".repeat(40)],
  ])("builds no snippet from a theme id that is %s", async (_name, id) => {
    const { root } = await render(<idg-brand-export css={CSS} themeId={id as string} />);
    expect(all(root, '[data-artefact="snippet"]')).toHaveLength(0);
    expect(shadow(root).innerHTML).not.toContain("<img");
  });

  it("builds the snippet from the validated id and slug alone", async () => {
    const { root } = await render(
      <idg-brand-export css={CSS} themeId="harbour" name={'x"><script>alert(1)</script>'} />,
    );
    expect(code(root, "snippet")).toBe(
      [
        '<link rel="stylesheet" href="/tokens/index.css" />',
        '<link rel="stylesheet" href="/themes/x-script-alert-1-script.css" />',
        "",
        '<html data-theme="harbour">',
      ].join("\n"),
    );
  });

  it("does not throw for a theme that is not one, and says there is nothing to export", async () => {
    for (const theme of [
      "theme",
      4,
      [],
      {},
      new Proxy(
        {},
        {
          get: () => {
            throw new Error("no");
          },
        },
      ),
    ]) {
      const { root } = await render(<idg-brand-export theme={theme as unknown as BrandTheme} />);
      expect(all(root, "pre")).toHaveLength(0);
    }
  });
});
