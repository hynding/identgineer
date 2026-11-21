import { describe, expect, it } from "vitest";
import { h } from "@stencil/vitest";
import {
  renderControl as render,
  renderWithInternals,
  stubValidity,
} from "../../testing/form-internals";
import "./select";

function native(root: HTMLElement): HTMLSelectElement {
  const element = root.shadowRoot?.querySelector<HTMLSelectElement>("select");
  if (!element) throw new Error("idg-select rendered no select");
  return element;
}

const options = [
  <option value="a">Alpha</option>,
  <option value="b" disabled>
    Beta
  </option>,
  <optgroup label="More">
    <option value="c" selected>
      Gamma
    </option>
    <option>Delta</option>
  </optgroup>,
];

describe("idg-select rendering", () => {
  it("renders a native select with a control part and a chevron hidden from assistive technology", async () => {
    const { root } = await render(<idg-select>{options}</idg-select>);
    expect(native(root).getAttribute("part")).toBe("control");
    expect(root.shadowRoot?.querySelector(".chevron")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("mirrors slotted options and groups into the native select", async () => {
    const { root } = await render(<idg-select>{options}</idg-select>);
    const select = native(root);
    const mirrored = Array.from(select.querySelectorAll("option"));
    expect(mirrored.map((option) => option.textContent)).toEqual([
      "Alpha",
      "Beta",
      "Gamma",
      "Delta",
    ]);
    expect(mirrored[0]?.getAttribute("value")).toBe("a");
    expect(mirrored[1]?.hasAttribute("disabled")).toBe(true);
    expect(mirrored[2]?.hasAttribute("selected")).toBe(true);
    expect(mirrored[3]?.hasAttribute("value")).toBe(false);
    const group = select.querySelector("optgroup");
    expect(group?.getAttribute("label")).toBe("More");
    expect(group?.querySelectorAll("option")).toHaveLength(2);
  });

  it("copies option text as text, never as markup", async () => {
    const { root } = await render(
      <idg-select>
        <option value="x">{"<b>bold</b>"}</option>
      </idg-select>,
    );
    const option = native(root).querySelector("option");
    expect(option?.textContent).toBe("<b>bold</b>");
    expect(native(root).querySelector("b")).toBeNull();
  });

  it("ignores children that are not options", async () => {
    const { root } = await render(
      <idg-select>
        <option value="a">A</option>
        <script></script>
        <div>Nope</div>
      </idg-select>,
    );
    expect(native(root).querySelectorAll("option")).toHaveLength(1);
    expect(native(root).querySelector("div")).toBeNull();
  });

  it("mirrors again when the slotted options change", async () => {
    const { root, waitForChanges } = await render(<idg-select>{options}</idg-select>);
    const extra = document.createElement("option");
    extra.setAttribute("value", "z");
    extra.textContent = "Zeta";
    root.appendChild(extra);
    root.shadowRoot?.querySelector("slot")?.dispatchEvent(new Event("slotchange"));
    await waitForChanges();
    expect(native(root).querySelectorAll("option")).toHaveLength(5);
  });

  it("passes name, required and size, and disables", async () => {
    const { root } = await render(
      <idg-select name="pick" required disabled size="lg">
        {options}
      </idg-select>,
    );
    expect(native(root).getAttribute("name")).toBe("pick");
    expect(native(root).hasAttribute("required")).toBe(true);
    expect(native(root).hasAttribute("disabled")).toBe(true);
    expect(root.shadowRoot?.querySelector(".box")?.classList.contains("size-lg")).toBe(true);
  });
});

describe("idg-select accessibility protocol", () => {
  it("names, describes and flags the native select", async () => {
    const { root } = await render(
      <idg-select accessibleLabel="Plan" accessibleDescription="Billed monthly" invalid>
        {options}
      </idg-select>,
    );
    expect(native(root).getAttribute("aria-label")).toBe("Plan");
    expect(native(root).getAttribute("aria-invalid")).toBe("true");
    const id = native(root).getAttribute("aria-describedby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.textContent).toBe("Billed monthly");
    expect(root.shadowRoot?.querySelector(".invalid-mark")).not.toBeNull();
  });
});

describe("idg-select events and form", () => {
  it("emits idgInput and idgChange with the chosen value", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<idg-select>{options}</idg-select>);
    const input = spyOnEvent("idgInput");
    const change = spyOnEvent("idgChange");
    native(root).value = "a";
    native(root).dispatchEvent(new Event("input", { bubbles: true }));
    native(root).dispatchEvent(new Event("change", { bubbles: true }));
    await waitForChanges();
    expect(input.lastEvent?.detail).toEqual({ value: "a" });
    expect(change.lastEvent?.detail).toEqual({ value: "a" });
    expect((root as unknown as { value: string }).value).toBe("a");
  });

  it("reports the value and mirrored validity, anchored on the select", async () => {
    const { internals, root, waitForChanges } = await renderWithInternals(
      <idg-select required>{options}</idg-select>,
    );
    stubValidity(native(root), { valueMissing: true }, "Please select an item.");
    native(root).value = "a";
    native(root).dispatchEvent(new Event("change", { bubbles: true }));
    await waitForChanges();
    expect(internals.setFormValue).toHaveBeenLastCalledWith("a");
    expect(internals.setValidity.mock.lastCall?.[1]).toBe("Please select an item.");
    expect(internals.setValidity.mock.lastCall?.[2]).toBe(native(root));
  });

  it("resets to the initial value, follows form disabling and restores saved state", async () => {
    const { root, waitForChanges } = await renderWithInternals(
      <idg-select value="a">{options}</idg-select>,
    );
    native(root).value = "c";
    native(root).dispatchEvent(new Event("change", { bubbles: true }));
    await waitForChanges();
    const element = root as unknown as {
      value: string;
      formResetCallback: () => void;
      formDisabledCallback: (disabled: boolean) => void;
      formStateRestoreCallback: (state: string) => void;
    };
    element.formResetCallback();
    await waitForChanges();
    expect(element.value).toBe("a");
    element.formDisabledCallback(true);
    await waitForChanges();
    expect(native(root).hasAttribute("disabled")).toBe(true);
    element.formStateRestoreCallback("c");
    await waitForChanges();
    expect(element.value).toBe("c");
  });
});
