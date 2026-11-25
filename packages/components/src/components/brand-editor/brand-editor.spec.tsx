import { readFileSync } from "node:fs";
import {
  BrandKitStoreError,
  parseBrandKit,
  sanitiseSvgLogo,
  SVG_LOGO_LIMITS,
  type BrandKit,
} from "@identgineer/brand";
import { generateBrandTheme } from "@identgineer/brand/edit";
import { h } from "@stencil/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderControl as render } from "../../testing/form-internals";
import {
  control,
  fieldOf,
  nativeInput,
  recordEvents,
  shadowOf,
  submit,
  textOf,
} from "../../testing/identity-form";
import { removeHost } from "../../testing/remove-host";
import "../alert/alert";
import "../brand-guidelines/brand-guidelines";
import "../brand-logo/brand-logo";
import "../brand-swatches/brand-swatches";
import "../button/button";
import "../field/field";
import "../icon/icon";
import "../input/input";
import "../select/select";
import "./brand-editor";
import { PREVIEW_DELAY_MS } from "./brand-editor-draft";

vi.mock("@identgineer/brand/edit", async (importOriginal) => {
  const original = await importOriginal<typeof import("@identgineer/brand/edit")>();
  return { ...original, generateBrandTheme: vi.fn(original.generateBrandTheme) };
});

const FIXTURES = new URL("../../../../brand/src/__fixtures__/", import.meta.url);

function kitOf(file: string): BrandKit {
  const result = parseBrandKit(JSON.parse(readFileSync(new URL(file, FIXTURES), "utf8")));
  if (!result.ok) throw new Error(`${file} is not a kit`);
  return result.kit;
}

const ACME = kitOf("acme.kit.json");
const HARBOUR = kitOf("harbour-lights.kit.json");
const CANARY = '<img src=x onerror="window.__pwned = 1">';
const CLEAN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="10" height="10" fill="#123456"/></svg>';
const HOSTILE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10" onload="window.__pwned = 1"><script>window.__pwned = 1</script><rect width="10" height="10"/></svg>';

interface EditorElement extends HTMLElement {
  kit?: unknown;
  store?: unknown;
  documentId?: string;
  clock?: unknown;
  labels?: Record<string, string>;
  preview?: boolean;
  headingLevel?: number;
}

interface GuideElement extends HTMLElement {
  kit?: { name?: string; logo?: string; mark?: string };
  theme?: { id?: string };
  headingLevel?: number;
}

function fakeStore() {
  let next = 0;
  const record = (kit: BrandKit, documentId: string) => ({
    ok: true as const,
    record: { documentId, isPublic: false, kit },
  });
  return {
    create: vi.fn((kit: BrandKit) => Promise.resolve(record(kit, `doc-${String((next += 1))}`))),
    update: vi.fn((documentId: string, kit: BrandKit) => Promise.resolve(record(kit, documentId))),
  };
}

async function mount(props: Partial<EditorElement> = {}) {
  const rendered = await render(<idg-brand-editor />);
  const root = rendered.root as EditorElement;
  Object.assign(root, props);
  await rendered.waitForChanges();
  return { ...rendered, root };
}

/** Timers that run only when the test says, and say what they were asked to wait. */
function manualClock() {
  const pending = new Map<number, { callback: () => void; delayMs: number }>();
  let handles = 0;
  return {
    setTimeout: (callback: () => void, delayMs: number) => {
      handles += 1;
      pending.set(handles, { callback, delayMs });
      return handles;
    },
    clearTimeout: (handle: unknown) => {
      pending.delete(handle as number);
    },
    delays: () => [...pending.values()].map((timer) => timer.delayMs),
    run: () => {
      const due = [...pending.values()];
      pending.clear();
      for (const timer of due) timer.callback();
    },
  };
}

/** Lets promises, timers the test has not faked and renders run. */
async function settle(waitForChanges: () => Promise<void>): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await Promise.resolve();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    await waitForChanges();
  }
}

function type(root: HTMLElement, name: string, value: string): void {
  const input = nativeInput(root, name);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function guide(root: HTMLElement): GuideElement | null {
  return shadowOf(root).querySelector<GuideElement>("idg-brand-guidelines");
}

function fileInput(root: HTMLElement, field: "logo" | "mark"): HTMLInputElement {
  const input = shadowOf(root).querySelector<HTMLInputElement>(`#${field}-file`);
  if (!input) throw new Error(`no ${field} upload`);
  return input;
}

function choose(root: HTMLElement, field: "logo" | "mark", file: unknown): void {
  const input = fileInput(root, field);
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** A file whose reading waits until the test releases it. */
function slowFile(text: string) {
  const bytes = new TextEncoder().encode(text);
  const waiting: (() => void)[] = [];
  return {
    size: bytes.byteLength,
    arrayBuffer: () =>
      new Promise<ArrayBuffer>((resolve) => {
        waiting.push(() => {
          resolve(bytes.buffer);
        });
      }),
    release: () => {
      for (const done of waiting.splice(0)) done();
    },
  };
}

const fileOf = (text: string) => new File([text], "logo.svg", { type: "image/svg+xml" });

const allText = (root: HTMLElement) => shadowOf(root).textContent;
const markupIn = (root: HTMLElement) =>
  [...shadowOf(root).querySelectorAll("*")].map((element) => element.localName);

let events: ReturnType<typeof recordEvents>;

beforeEach(() => {
  vi.mocked(generateBrandTheme).mockClear();
  events = recordEvents(["idgSave", "idgChange", "idgInput"]);
});

afterEach(() => {
  events.stop();
});

describe("idg-brand-editor form", () => {
  it("is a real form, named, with a labelled field for each part of a kit", async () => {
    const { root } = await mount();
    const form = shadowOf(root).querySelector("form");
    expect(form?.getAttribute("aria-label")).toBe("Brand kit");
    expect(form?.hasAttribute("novalidate")).toBe(true);
    expect(fieldOf(root, "brand-name").label).toBe("Name");
    expect(fieldOf(root, "brand-id").label).toBe("Theme id");
    expect(fieldOf(root, "brand-tagline").label).toBe("Tagline");
    expect(fieldOf(root, "brand-primary").label).toBe("Primary colour");
    expect(fieldOf(root, "brand-secondary").label).toBe("Secondary colour");
    expect(fieldOf(root, "brand-neutralTint").label).toBe("Neutral tint");
    expect(fieldOf(root, "brand-typography").label).toBe("Font pairing");
    expect(fieldOf(root, "brand-corners").label).toBe("Corners");
    expect(fieldOf(root, "brand-tone").label).toBe("Tone");
    for (const field of ["logo", "mark"] as const) {
      const input = fileInput(root, field);
      expect(input.getAttribute("type")).toBe("file");
      expect(input.getAttribute("accept")).toBe("image/svg+xml,.svg");
      const label = shadowOf(root).querySelector<HTMLLabelElement>(`#${field}-label`);
      expect(label?.localName).toBe("label");
      expect(label?.htmlFor).toBe(`${field}-file`);
      expect(textOf(root, `#${field}-label`)).toBe(
        `${field === "logo" ? "Logo" : "Mark"} optional`,
      );
    }
    const save = shadowOf(root).querySelector<HTMLElement & { type?: string }>(".submit");
    expect(save?.type).toBe("submit");
    expect(textOf(root, ".submit")).toBe("Save brand kit");
  });

  it("pairs each colour field with a named native colour picker in its box", async () => {
    const { root } = await mount({ kit: ACME });
    const picker = control(root, "brand-primary").querySelector<HTMLInputElement>(
      'input[type="color"]',
    );
    expect(picker?.getAttribute("slot")).toBe("start");
    expect(picker?.getAttribute("aria-label")).toBe("Pick the primary colour");
    expect(picker?.value).toBe("#4f46e5");
  });

  it("offers the brand package's presets as the choices", async () => {
    const { root } = await mount();
    const values = (name: string) =>
      [...control(root, name).querySelectorAll("option")].map((option) => option.value);
    expect(values("brand-typography")).toEqual([
      "system",
      "geometric",
      "humanist",
      "grotesque",
      "classic-serif",
      "book",
      "technical",
    ]);
    expect(values("brand-corners")).toEqual(["sharp", "soft", "round"]);
    expect(values("brand-tone")).toEqual(["calm", "balanced", "vivid"]);
  });

  it("starts from the kit it is given, its colours as hex", async () => {
    const { root } = await mount({ kit: ACME });
    expect(control(root, "brand-name").value).toBe("Acme Rockets");
    expect(control(root, "brand-id").value).toBe("acme");
    expect(control(root, "brand-tagline").value).toBe("Up, up & away!");
    expect(control(root, "brand-primary").value).toBe("#4f46e5");
    expect(control(root, "brand-secondary").value).toBe("#0f766e");
    expect(control(root, "brand-neutralTint").value).toBe("");
    expect(control(root, "brand-typography").value).toBe("geometric");
  });

  it("shows markup in a kit as the value of a field, and never as markup", async () => {
    const { root } = await mount({ kit: { ...ACME, name: `Acme ${CANARY}`, tagline: CANARY } });
    expect(control(root, "brand-name").value).toBe(`Acme ${CANARY}`);
    expect(markupIn(root)).not.toContain("img");
    expect(markupIn(root)).not.toContain("script");
  });

  it("reads a kit that throws or is not a kit as an empty one, without throwing", async () => {
    const throwing = new Proxy(
      {},
      {
        get(): never {
          throw new Error("no");
        },
        getOwnPropertyDescriptor(): never {
          throw new Error("no");
        },
      },
    );
    const { root, waitForChanges } = await mount({ kit: throwing });
    expect(control(root, "brand-name").value).toBe("");
    root.kit = "not a kit";
    await waitForChanges();
    expect(control(root, "brand-name").value).toBe("");
  });

  it("keeps the inner controls' events inside", async () => {
    const { root } = await mount({ kit: ACME });
    type(root, "brand-name", "Acme Rocket Co");
    expect(events.seen).toEqual([]);
  });

  it("says when the kit's own logo is not the sanitiser's output, and leaves it out", async () => {
    const { root } = await mount({ kit: { ...HARBOUR, logo: HOSTILE_SVG } });
    expect(textOf(root, "#logo-status")).toBe(
      "The kit's own file could not be used and was left out.",
    );
    expect(guide(root)?.kit?.logo).toBeUndefined();
    expect(guide(root)?.kit?.mark).toBe(HARBOUR.mark);
  });
});

describe("idg-brand-editor colours", () => {
  it("writes a colour picked into its hex field, and a valid hex typed into its picker", async () => {
    const { root, waitForChanges } = await mount({ kit: ACME });
    const picker = control(root, "brand-secondary").querySelector<HTMLInputElement>(
      'input[type="color"]',
    );
    if (!picker) throw new Error("no picker");
    picker.value = "#ff8800";
    picker.dispatchEvent(new Event("input", { bubbles: true }));
    await waitForChanges();
    expect(control(root, "brand-secondary").value).toBe("#ff8800");
    type(root, "brand-secondary", "#0AF");
    await waitForChanges();
    expect(picker.value).toBe("#00aaff");
    type(root, "brand-secondary", "#0a");
    await waitForChanges();
    expect(picker.value).toBe("#00aaff");
  });
});

describe("idg-brand-editor preview", () => {
  it("shows the starting kit in the guide at once, with its theme, logo and mark", async () => {
    const { root } = await mount({ kit: HARBOUR });
    const shown = guide(root);
    expect(shown?.kit?.name).toBe("Harbour Lights");
    expect(shown?.kit?.logo).toBe(HARBOUR.logo);
    expect(shown?.theme?.id).toBe("harbour-lights");
    expect(shown?.headingLevel).toBe(3);
    expect(textOf(root, ".preview-title")).toBe("Preview");
  });

  it("works the theme out once typing pauses, not on every keystroke, and keeps the logo it has", async () => {
    const clock = manualClock();
    const { root, waitForChanges } = await mount({ kit: HARBOUR, clock });
    const before = guide(root)?.kit;
    expect(vi.mocked(generateBrandTheme)).toHaveBeenCalledTimes(1);
    for (const name of ["H", "Ha", "Har", "Harb", "Harbo"]) type(root, "brand-name", name);
    await waitForChanges();
    expect(clock.delays()).toEqual([PREVIEW_DELAY_MS]);
    expect(vi.mocked(generateBrandTheme)).toHaveBeenCalledTimes(1);
    expect(guide(root)?.kit).toBe(before);
    clock.run();
    await waitForChanges();
    expect(vi.mocked(generateBrandTheme)).toHaveBeenCalledTimes(2);
    expect(guide(root)?.kit?.name).toBe("Harbo");
    expect(guide(root)?.kit?.logo).toBe(HARBOUR.logo);
  });

  it("keeps the last valid preview while the draft is not a kit, and says so", async () => {
    const clock = manualClock();
    const { root, waitForChanges } = await mount({ kit: ACME, clock });
    type(root, "brand-primary", "red");
    clock.run();
    await waitForChanges();
    expect(guide(root)?.kit?.name).toBe("Acme Rockets");
    expect(textOf(root, ".preview .note")).toBe(
      "The preview shows the last valid version of the kit.",
    );
  });

  it("says what it needs before there is anything to show, and can be turned off", async () => {
    const { root, waitForChanges } = await mount();
    expect(guide(root)).toBeNull();
    expect(textOf(root, ".preview .note")).toContain("The preview appears once");
    root.kit = ACME;
    root.preview = false;
    await waitForChanges();
    expect(guide(root)).toBeNull();
    expect(shadowOf(root).querySelector(".preview")).toBeNull();
  });
});

describe("idg-brand-editor validation", () => {
  it("validates with parseBrandKit, marks each field with its code's message, focuses the first and saves nothing", async () => {
    const store = fakeStore();
    const { root, waitForChanges } = await mount({ store });
    const focus = vi.spyOn(control(root, "brand-name"), "setFocus");
    type(root, "brand-id", "Not An Id");
    type(root, "brand-primary", "#12");
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "brand-name").error).toBe("Fill this in.");
    expect(fieldOf(root, "brand-id").error).toBe(
      "Use 2 to 32 lower-case letters and digits, in words joined by single hyphens, starting with a letter.",
    );
    expect(fieldOf(root, "brand-primary").error).toBe(
      "Enter a hex colour: # and 3 or 6 digits from 0 to 9 and a to f.",
    );
    expect(fieldOf(root, "brand-tagline").error).toBeUndefined();
    expect(textOf(root, 'idg-alert[part="error"]')).toBe(
      "Some fields need a change. Each says what is wrong.",
    );
    expect(focus).toHaveBeenCalledTimes(1);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("clears a field's message once it is edited", async () => {
    const { root, waitForChanges } = await mount({ kit: { ...ACME, name: "" } });
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "brand-name").error).toBe("Fill this in.");
    type(root, "brand-name", "Acme");
    await waitForChanges();
    expect(fieldOf(root, "brand-name").error).toBeUndefined();
  });

  it("takes its messages from labels", async () => {
    const { root, waitForChanges } = await mount({
      labels: { fieldTooShort: "Remplissez ce champ.", name: "Charte" },
    });
    submit(root);
    await waitForChanges();
    expect(fieldOf(root, "brand-name").error).toBe("Remplissez ce champ.");
    expect(shadowOf(root).querySelector("form")?.getAttribute("aria-label")).toBe("Charte");
  });
});

describe("idg-brand-editor saving", () => {
  it("creates the kit, says so, tells the page its ids and nothing else, and updates it after", async () => {
    const store = fakeStore();
    const { root, waitForChanges } = await mount({ kit: ACME, store });
    submit(root);
    await settle(waitForChanges);
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(store.create.mock.calls[0]?.[0]).toEqual(ACME);
    expect(events.seen).toEqual([
      { type: "idgSave", detail: { documentId: "doc-1", id: "acme", created: true } },
    ]);
    expect(textOf(root, 'idg-alert[part="saved"]')).toBe("Brand kit saved.");
    type(root, "brand-tagline", "Higher");
    submit(root);
    await settle(waitForChanges);
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(store.update).toHaveBeenCalledTimes(1);
    expect(store.update.mock.calls[0]?.[0]).toBe("doc-1");
    expect(store.update.mock.calls[0]?.[1]).toMatchObject({ tagline: "Higher" });
    expect(events.seen[1]).toEqual({
      type: "idgSave",
      detail: { documentId: "doc-1", id: "acme", created: false },
    });
  });

  it("updates the kit named by documentId", async () => {
    const store = fakeStore();
    const { root, waitForChanges } = await mount({ kit: HARBOUR, documentId: "harbour", store });
    submit(root);
    await settle(waitForChanges);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update.mock.calls[0]?.[0]).toBe("harbour");
    expect(store.update.mock.calls[0]?.[1]).toEqual(HARBOUR);
  });

  it("is loading, and refuses a second save, only while the store answers", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const store = {
      create: vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
      update: vi.fn(),
    };
    const { root, waitForChanges } = await mount({ kit: ACME, store });
    const button = shadowOf(root).querySelector<HTMLElement & { loading: boolean }>(".submit");
    expect(button?.loading).toBe(false);
    submit(root);
    await waitForChanges();
    expect(button?.loading).toBe(true);
    submit(root);
    expect(store.create).toHaveBeenCalledTimes(1);
    answer({ ok: true, record: { documentId: "doc-9", isPublic: false, kit: ACME } });
    await settle(waitForChanges);
    expect(button?.loading).toBe(false);
  });

  it("marks the fields the store names when it refuses a value, with its fixed words and none of the server's", async () => {
    const store = {
      create: vi.fn(() =>
        Promise.reject(
          new BrandKitStoreError("validation", { fields: ["brandId", "primaryColor"] }),
        ),
      ),
      update: vi.fn(),
    };
    const { root, waitForChanges } = await mount({ kit: ACME, store });
    submit(root);
    await settle(waitForChanges);
    expect(fieldOf(root, "brand-id").error).toBe("The server refused this value.");
    expect(fieldOf(root, "brand-primary").error).toBe("The server refused this value.");
    expect(textOf(root, 'idg-alert[part="error"]')).toBe(
      "The kit was not saved: the fields marked below were refused.",
    );
    expect(events.seen).toEqual([]);
  });

  it("updates the kit a create stored when the CMS did not apply every field", async () => {
    const store = {
      create: vi.fn(() =>
        Promise.reject(
          new BrandKitStoreError("not-applied", { fields: ["tagline"], documentId: "doc-7" }),
        ),
      ),
      update: vi.fn((documentId: string, kit: BrandKit) =>
        Promise.resolve({ ok: true, record: { documentId, isPublic: false, kit } }),
      ),
    };
    const { root, waitForChanges } = await mount({ kit: ACME, store });
    submit(root);
    await settle(waitForChanges);
    expect(fieldOf(root, "brand-tagline").error).toBe(
      "The server did not save this value as it was sent.",
    );
    submit(root);
    await settle(waitForChanges);
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(store.update.mock.calls[0]?.[0]).toBe("doc-7");
    // The create was not applied whole, so no event said a kit was made: the first that saves it
    // says so, and only that one.
    expect(events.seen).toEqual([
      { type: "idgSave", detail: { documentId: "doc-7", id: "acme", created: true } },
    ]);
    submit(root);
    await settle(waitForChanges);
    expect(events.seen[1]).toEqual({
      type: "idgSave",
      detail: { documentId: "doc-7", id: "acme", created: false },
    });
  });

  it("updates the kit a create stored but could not read back, and says it was created once saved", async () => {
    const store = {
      create: vi.fn(() => Promise.resolve({ ok: false, documentId: "doc-5", errors: [] })),
      update: vi.fn((documentId: string, kit: BrandKit) =>
        Promise.resolve({ ok: true, record: { documentId, isPublic: false, kit } }),
      ),
    };
    const { root, waitForChanges } = await mount({ kit: ACME, store });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, 'idg-alert[part="error"]')).toBe(
      "The kit was sent, but the answer could not be read. Check it before saving again.",
    );
    expect(events.seen).toEqual([]);
    submit(root);
    await settle(waitForChanges);
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(store.update.mock.calls[0]?.[0]).toBe("doc-5");
    expect(events.seen).toEqual([
      { type: "idgSave", detail: { documentId: "doc-5", id: "acme", created: true } },
    ]);
  });

  it.each([
    ["network", "The kit could not be saved: the server could not be reached. Save again."],
    ["unauthorized", "You are signed out. Sign in again, then save."],
    ["rate-limited", "Too many saves in a short time. Wait a minute, then save again."],
  ] as const)("shows one fixed message for a %s error", async (code, expected) => {
    const store = {
      create: vi.fn(() => Promise.reject(new BrandKitStoreError(code))),
      update: vi.fn(),
    };
    const { root, waitForChanges } = await mount({ kit: ACME, store });
    submit(root);
    await settle(waitForChanges);
    expect(textOf(root, 'idg-alert[part="error"]')).toBe(expected);
  });

  it("shows an alert, never an exception, for a store that throws, rejects oddly, answers nonsense or is missing", async () => {
    const thrown = new Error(CANARY);
    const stores = [
      {
        create: () => {
          throw thrown;
        },
        update: vi.fn(),
      },
      { create: () => Promise.reject(thrown), update: vi.fn() },
      {
        create: () => Promise.reject(Object.assign(new Error(CANARY), { code: "network" })),
        update: vi.fn(),
      },
      { create: () => Promise.resolve({ ok: false, errors: [] }), update: vi.fn() },
      { create: () => Promise.resolve(CANARY), update: vi.fn() },
      undefined,
      { create: "no" },
    ];
    const expected = [
      "The kit could not be saved. Try again later.",
      "The kit could not be saved. Try again later.",
      "The kit could not be saved: the server could not be reached. Save again.",
      "The kit was sent, but the answer could not be read. Check it before saving again.",
      "The kit was sent, but the answer could not be read. Check it before saving again.",
      "The kit cannot be saved here: no store is connected.",
      "The kit cannot be saved here: no store is connected.",
    ];
    for (const [index, store] of stores.entries()) {
      const { root, waitForChanges } = await mount({ kit: ACME, store });
      submit(root);
      await settle(waitForChanges);
      expect(textOf(root, 'idg-alert[part="error"]'), String(index)).toBe(expected[index]);
      expect(allText(root)).not.toContain("onerror");
      expect(markupIn(root)).not.toContain("img");
    }
    expect(events.seen).toEqual([]);
  });

  it("drops the store's answer once the kit was replaced or the element left the page", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const store = {
      create: vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
      ),
      update: vi.fn(),
    };
    const { root, waitForChanges } = await mount({ kit: ACME, store });
    submit(root);
    await waitForChanges();
    root.kit = HARBOUR;
    await waitForChanges();
    answer({ ok: true, record: { documentId: "doc-1", isPublic: false, kit: ACME } });
    await settle(waitForChanges);
    expect(events.seen).toEqual([]);
    expect(shadowOf(root).querySelector('idg-alert[part="saved"]')).toBeNull();

    submit(root);
    await waitForChanges();
    removeHost(root);
    answer({ ok: true, record: { documentId: "doc-2", isPublic: false, kit: HARBOUR } });
    await settle(waitForChanges);
    expect(events.seen).toEqual([]);
  });
});

describe("idg-brand-editor uploads", () => {
  it("keeps only the sanitiser's output of an upload, and shows it in the preview", async () => {
    const { root, waitForChanges } = await mount({ kit: ACME });
    choose(root, "logo", fileOf(CLEAN_SVG));
    await settle(waitForChanges);
    const expected = sanitiseSvgLogo(CLEAN_SVG);
    if (!expected.ok) throw new Error("not a logo");
    expect(guide(root)?.kit?.logo).toBe(expected.svg);
    expect(shadowOf(root).querySelector("#logo-status idg-brand-logo")).not.toBeNull();
    expect(shadowOf(root).querySelector('[part="removals"]')).toBeNull();
  });

  it("lists what the sanitiser removed before anything is saved, and saves the cleaned logo", async () => {
    const store = fakeStore();
    const { root, waitForChanges } = await mount({ kit: ACME, store });
    choose(root, "mark", fileOf(HOSTILE_SVG));
    await settle(waitForChanges);
    const removals = shadowOf(root).querySelector('[part="removals"]');
    expect(removals?.getAttribute("variant")).toBe("warning");
    expect(removals?.textContent).toContain("The mark was cleaned: 2 parts were removed.");
    const items = [...(removals?.querySelectorAll("li") ?? [])].map((item) => item.textContent);
    expect(items).toEqual([
      "An event handler was removed (svg onload, line 1)",
      "Script or other active content was removed (script, line 1)",
    ]);
    expect(store.create).not.toHaveBeenCalled();
    expect(allText(root)).not.toContain("window.__pwned");
    expect(markupIn(root)).not.toContain("script");
    submit(root);
    await settle(waitForChanges);
    const saved = store.create.mock.calls[0]?.[0];
    expect(saved?.mark).not.toContain("script");
    expect(saved?.mark).not.toContain("onload");
  });

  it("refuses a file over the limit by its size, without reading it, and keeps the logo it had", async () => {
    const { root, waitForChanges } = await mount({ kit: HARBOUR });
    const arrayBuffer = vi.fn();
    choose(root, "logo", { size: SVG_LOGO_LIMITS.inputBytes + 1, arrayBuffer });
    await settle(waitForChanges);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(textOf(root, "#logo-error")).toBe(
      "The file is too large. A logo may be at most 512 KB.",
    );
    expect(fileInput(root, "logo").getAttribute("aria-invalid")).toBe("true");
    expect(guide(root)?.kit?.logo).toBe(HARBOUR.logo);
  });

  it("refuses what the sanitiser refuses with one fixed message for its code, and keeps the logo", async () => {
    const { root, waitForChanges } = await mount({ kit: HARBOUR });
    choose(
      root,
      "logo",
      fileOf('<!DOCTYPE svg [<!ENTITY x "x">]><svg xmlns="http://www.w3.org/2000/svg"/>'),
    );
    await settle(waitForChanges);
    expect(textOf(root, "#logo-error")).toBe(
      "The file declares a document type with its own definitions, which is not allowed.",
    );
    expect(guide(root)?.kit?.logo).toBe(HARBOUR.logo);
  });

  it("is still removed from the page by remove(), which no method of its own hides", async () => {
    const { root } = await mount({ kit: HARBOUR });
    root.remove();
    expect(root.isConnected).toBe(false);
  });

  it("removes an upload, with what was said about it", async () => {
    const { root, waitForChanges } = await mount({ kit: HARBOUR });
    choose(root, "logo", fileOf(HOSTILE_SVG));
    await settle(waitForChanges);
    shadowOf(root).querySelector<HTMLElement>('[data-remove="logo"]')?.click();
    await waitForChanges();
    expect(guide(root)?.kit?.logo).toBeUndefined();
    expect(shadowOf(root).querySelector('[part="removals"]')).toBeNull();
    expect(textOf(root, "#logo-status")).toBe("No logo yet.");
  });

  it("lets a later upload win over a read that finishes late", async () => {
    const { root, waitForChanges } = await mount({ kit: ACME });
    const slow = slowFile(HOSTILE_SVG);
    choose(root, "logo", slow);
    await waitForChanges();
    expect(textOf(root, "#logo-status")).toContain("Reading the file");
    choose(root, "logo", fileOf(CLEAN_SVG));
    await settle(waitForChanges);
    slow.release();
    await settle(waitForChanges);
    expect(guide(root)?.kit?.logo).toContain("#123456");
    expect(shadowOf(root).querySelector('[part="removals"]')).toBeNull();
  });

  it("lets a removal, or a new kit, win over a read that finishes late", async () => {
    const { root, waitForChanges } = await mount({ kit: HARBOUR });
    const slow = slowFile(CLEAN_SVG);
    choose(root, "mark", slow);
    await waitForChanges();
    shadowOf(root).querySelector<HTMLElement>('[data-remove="mark"]')?.click();
    await waitForChanges();
    slow.release();
    await settle(waitForChanges);
    expect(guide(root)?.kit?.mark).toBeUndefined();
    expect(textOf(root, "#mark-status")).toBe("No mark yet.");

    const another = slowFile(CLEAN_SVG);
    choose(root, "logo", another);
    await waitForChanges();
    root.kit = ACME;
    await waitForChanges();
    another.release();
    await settle(waitForChanges);
    expect(guide(root)?.kit?.logo).toBeUndefined();
  });

  it("ignores a read that finishes after the element left the page", async () => {
    const { root, waitForChanges } = await mount({ kit: ACME });
    const slow = slowFile(CLEAN_SVG);
    choose(root, "logo", slow);
    await waitForChanges();
    removeHost(root);
    slow.release();
    await settle(waitForChanges);
    expect(guide(root)?.kit?.logo).toBeUndefined();
  });
});
