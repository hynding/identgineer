import { afterEach, describe, expect, it } from "vitest";
import { h } from "@stencil/vitest";
import { MARK } from "../../utils/untrusted-text";
import { renderWithInternals } from "../../testing/form-internals";
import "../field/field";
import "../select/select";
import "./property-picker";

const PROPERTIES = [
  { id: "p1", name: "Docs", origin: "https://docs.example.com" },
  { id: "p2", name: "Shop" },
  { id: "p3", name: "Blog", origin: "http://blog.example.org:8080" },
];

interface PickerElement extends HTMLElement {
  value?: string;
  properties?: unknown;
  disabled?: boolean;
  loading?: boolean;
  setFocus: () => Promise<void>;
  formResetCallback: () => void;
  formDisabledCallback: (disabled: boolean) => void;
  formStateRestoreCallback: (state: string | null) => void;
}

interface SelectElement extends HTMLElement {
  value: string;
  disabled: boolean;
}

const heard: { type: string; listener: (event: Event) => void }[] = [];

/** Listens on the document for the rest of the test. */
function listen(type: string, listener: (event: Event) => void): void {
  document.addEventListener(type, listener);
  heard.push({ type, listener });
}

afterEach(() => {
  for (const { type, listener } of heard.splice(0)) document.removeEventListener(type, listener);
});

const select = (root: HTMLElement) => {
  const element = root.shadowRoot?.querySelector<SelectElement>("idg-select");
  if (!element) throw new Error("no idg-select");
  return element;
};
const field = (root: HTMLElement) =>
  root.shadowRoot?.querySelector<HTMLElement & { label?: string }>("idg-field");
const options = (root: HTMLElement) =>
  Array.from(select(root).querySelectorAll("option")).map((option) => ({
    value: option.getAttribute("value"),
    text: option.textContent,
  }));

async function mount(
  props: {
    properties?: unknown;
    value?: string;
    loading?: boolean;
    disabled?: boolean;
    label?: string;
    name?: string;
    labels?: Record<string, string>;
  } = {},
) {
  const rendered = await renderWithInternals(
    <idg-property-picker properties={props.properties as never} {...props} />,
  );
  return { ...rendered, root: rendered.root as PickerElement };
}

/** What the user does: the select reports a choice. */
async function choose(root: HTMLElement, value: string, waitForChanges: () => Promise<void>) {
  select(root).dispatchEvent(
    new CustomEvent("idgChange", { detail: { value }, bubbles: true, composed: true }),
  );
  await waitForChanges();
}

describe("idg-property-picker rendering", () => {
  it("is a field with a label around a select that has one option for each property, valued by its id", async () => {
    const { root } = await mount({ properties: PROPERTIES, value: "p2", label: "Site" });
    expect(field(root)?.label).toBe("Site");
    expect(options(root).map((option) => option.value)).toEqual(["p1", "p2", "p3"]);
    expect(select(root).value).toBe("p2");
  });

  it("falls back to a default label when none is given", async () => {
    const { root } = await mount({ properties: PROPERTIES, value: "p1" });
    expect(field(root)?.label).toBe("Property");
  });

  it("shows the host of a property's origin beside its name, so two with one name can be told apart", async () => {
    const { root } = await mount({ properties: PROPERTIES, value: "p1" });
    expect(options(root).map((option) => option.text)).toEqual([
      "Docs · docs.example.com",
      "Shop",
      "Blog · blog.example.org:8080",
    ]);
  });

  it("drops records that are malformed or repeat an id", async () => {
    const { root } = await mount({
      properties: [{ id: "a", name: "A" }, null, { id: "a", name: "Again" }, { id: "b" }, 4],
      value: "a",
    });
    expect(options(root)).toEqual([{ value: "a", text: "A" }]);
  });

  it("treats a properties value that is not a list as no properties", async () => {
    const { root } = await mount({ properties: "p1,p2" });
    expect(select(root).disabled).toBe(true);
    expect(options(root)).toEqual([{ value: "", text: "No properties" }]);
  });
});

describe("idg-property-picker untrusted names", () => {
  it("shows a name as text and never as markup", async () => {
    const name = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const { root } = await mount({ properties: [{ id: "x", name }], value: "x" });
    expect(options(root)[0]?.text).toBe(name);
    expect(root.shadowRoot?.querySelector("img, script")).toBeNull();
    expect(select(root).querySelector("img, script")).toBeNull();
  });

  it("replaces bidirectional and control characters, which could make one name pass for another", async () => {
    const { root } = await mount({
      properties: [{ id: "x", name: "pay‮fdp.exe\u0000\n" }],
      value: "x",
    });
    expect(options(root)[0]?.text).toBe(`pay${MARK}fdp.exe${MARK} `);
  });

  it("cuts a very long name, so one property cannot make the menu as wide as the page", async () => {
    const { root } = await mount({ properties: [{ id: "x", name: "w".repeat(5000) }], value: "x" });
    const text = options(root)[0]?.text ?? "";
    expect(text.length).toBeLessThanOrEqual(81);
    expect(text.endsWith("…")).toBe(true);
  });

  it("uses an id as an attribute value only, whatever it holds", async () => {
    const id = '"><script>alert(1)</script>';
    const { root } = await mount({ properties: [{ id, name: "x" }], value: id });
    expect(options(root)[0]?.value).toBe(id);
    expect(root.shadowRoot?.querySelector("script")).toBeNull();
  });
});

describe("idg-property-picker value", () => {
  it("shows a prompt, and no property, when nothing is chosen", async () => {
    const { root } = await mount({ properties: PROPERTIES });
    expect(options(root)[0]).toEqual({ value: "", text: "Choose a property" });
    expect(select(root).value).toBe("");
  });

  it("has no prompt once a property is chosen", async () => {
    const { root } = await mount({ properties: PROPERTIES, value: "p3" });
    expect(options(root).map((option) => option.value)).not.toContain("");
  });

  it("selects nothing for a value that is not one of the properties, and leaves the value as it was", async () => {
    const { root } = await mount({ properties: PROPERTIES, value: "gone" });
    expect(select(root).value).toBe("");
    expect(options(root)[0]?.value).toBe("");
    expect(root.value).toBe("gone");
  });

  it("selects the property again when it appears in the list later", async () => {
    const { root, waitForChanges } = await mount({ properties: [], value: "p2" });
    expect(select(root).value).toBe("");
    root.properties = PROPERTIES;
    await waitForChanges();
    // The select is handed the value again, and the prompt, which stood for no choice, is gone.
    expect(options(root).map((option) => option.value)).toEqual(["p1", "p2", "p3"]);
    expect(root.value).toBe("p2");
  });

  it("follows a change of the value from script", async () => {
    const { root, waitForChanges } = await mount({ properties: PROPERTIES, value: "p1" });
    root.value = "p3";
    await waitForChanges();
    expect(select(root).value).toBe("p3");
  });
});

describe("idg-property-picker states", () => {
  it("is disabled when told to be, and keeps the choice", async () => {
    const { root } = await mount({ properties: PROPERTIES, value: "p2", disabled: true });
    expect(select(root).disabled).toBe(true);
    expect(select(root).value).toBe("p2");
  });

  it("is busy and disabled while loading, with a polite status and a placeholder option", async () => {
    const { root } = await mount({ properties: [], loading: true });
    expect(select(root).disabled).toBe(true);
    expect(root.shadowRoot?.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(root.shadowRoot?.querySelector("[role='status']")?.textContent).toBe(
      "Loading properties",
    );
    expect(options(root)).toEqual([{ value: "", text: "Loading properties" }]);
  });

  it("says nothing and is not busy once loaded", async () => {
    const { root } = await mount({ properties: PROPERTIES, value: "p1" });
    expect(root.shadowRoot?.querySelector("[aria-busy]")).toBeNull();
    expect(root.shadowRoot?.querySelector("[role='status']")?.textContent).toBe("");
  });

  it("is disabled, with a word for it, when the user has no properties", async () => {
    const { root } = await mount({ properties: [] });
    expect(select(root).disabled).toBe(true);
    expect(options(root)).toEqual([{ value: "", text: "No properties" }]);
  });

  it("takes every word from labels, merged over the English ones", async () => {
    const { root } = await mount({
      properties: [],
      loading: true,
      label: "Seite",
      labels: { loading: "Lade Seiten", placeholder: "Seite wählen" },
    });
    expect(options(root)[0]?.text).toBe("Lade Seiten");
    expect(root.shadowRoot?.querySelector("[role='status']")?.textContent).toBe("Lade Seiten");
  });
});

describe("idg-property-picker change", () => {
  it("emits idgChange with the id, once, and keeps the select's own event inside", async () => {
    const { root, waitForChanges } = await mount({ properties: PROPERTIES, value: "p1" });
    const seen: unknown[] = [];
    listen("idgChange", (event) => seen.push((event as CustomEvent).detail));
    await choose(root, "p3", waitForChanges);
    expect(seen).toEqual([{ value: "p3" }]);
    expect(root.value).toBe("p3");
  });

  it("ignores a choice that is not one of its properties", async () => {
    const { root, waitForChanges } = await mount({ properties: PROPERTIES, value: "p1" });
    const seen: unknown[] = [];
    listen("idgChange", (event) => seen.push(event));
    await choose(root, "intruder", waitForChanges);
    expect(seen).toEqual([]);
    expect(root.value).toBe("p1");
  });

  it("does not emit for the choice it already has", async () => {
    const { root, waitForChanges } = await mount({ properties: PROPERTIES, value: "p1" });
    const seen: unknown[] = [];
    listen("idgChange", (event) => seen.push(event));
    await choose(root, "p1", waitForChanges);
    expect(seen).toEqual([]);
  });
});

describe("idg-property-picker in a form", () => {
  it("submits the chosen id under its name", async () => {
    const { internals, root, waitForChanges } = await mount({
      properties: PROPERTIES,
      value: "p2",
      name: "property",
    });
    // The inner select is given the same recorder, so these are looked for, not the last call.
    expect(internals.setFormValue).toHaveBeenCalledWith("p2");
    await choose(root, "p3", waitForChanges);
    expect(internals.setFormValue).toHaveBeenCalledWith("p3");
  });

  it("submits nothing while no property is chosen, whatever the value says", async () => {
    const { internals } = await mount({ properties: PROPERTIES, value: "gone", name: "property" });
    expect(internals.setFormValue).toHaveBeenCalledWith(null);
    expect(internals.setFormValue).not.toHaveBeenCalledWith("gone");
  });

  it("restores the value it started with on reset, and takes a restored state", async () => {
    const { root, waitForChanges } = await mount({ properties: PROPERTIES, value: "p1" });
    await choose(root, "p3", waitForChanges);
    root.formResetCallback();
    await waitForChanges();
    expect(root.value).toBe("p1");
    root.formStateRestoreCallback("p2");
    await waitForChanges();
    expect(root.value).toBe("p2");
  });

  it("is disabled by a disabled fieldset", async () => {
    const { root, waitForChanges } = await mount({ properties: PROPERTIES, value: "p1" });
    root.formDisabledCallback(true);
    await waitForChanges();
    expect(select(root).disabled).toBe(true);
  });

  it("moves focus to the select", async () => {
    const { root } = await mount({ properties: PROPERTIES, value: "p1" });
    let focused = false;
    (select(root) as HTMLElement & { setFocus: () => Promise<void> }).setFocus = () => {
      focused = true;
      return Promise.resolve();
    };
    await root.setFocus();
    expect(focused).toBe(true);
  });
});
