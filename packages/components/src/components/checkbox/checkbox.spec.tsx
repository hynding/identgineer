import { describe, expect, it } from "vitest";
import { h } from "@stencil/vitest";
import {
  renderControl as render,
  renderWithInternals,
  stubValidity,
} from "../../testing/form-internals";
import "./checkbox";

function native(root: HTMLElement): HTMLInputElement {
  const element = root.shadowRoot?.querySelector<HTMLInputElement>("input");
  if (!element) throw new Error("idg-checkbox rendered no input");
  return element;
}

function toggle(root: HTMLElement, checked: boolean): void {
  native(root).checked = checked;
  native(root).dispatchEvent(new Event("change", { bubbles: true }));
}

describe("idg-checkbox rendering", () => {
  it("renders a native checkbox inside a label that holds the default slot", async () => {
    const { root } = await render(<idg-checkbox>Remember me</idg-checkbox>);
    const label = root.shadowRoot?.querySelector("label");
    expect(label?.contains(native(root))).toBe(true);
    expect(native(root).getAttribute("type")).toBe("checkbox");
    expect(native(root).getAttribute("part")).toBe("control");
    expect(label?.querySelector("slot:not([name])")).not.toBeNull();
  });

  it("reflects checked, disabled and required onto the native input", async () => {
    const { root } = await render(
      <idg-checkbox checked disabled required name="agree" value="yes">
        Agree
      </idg-checkbox>,
    );
    expect(native(root).checked).toBe(true);
    expect(native(root).hasAttribute("disabled")).toBe(true);
    expect(native(root).hasAttribute("required")).toBe(true);
    expect(root.hasAttribute("checked")).toBe(true);
  });

  it("shows the mixed state through the native indeterminate flag", async () => {
    const { root } = await render(<idg-checkbox indeterminate>All</idg-checkbox>);
    expect(native(root).indeterminate).toBe(true);
  });
});

describe("idg-checkbox accessibility protocol", () => {
  it("accepts a name, a description and the invalid state", async () => {
    const { root } = await render(
      <idg-checkbox accessibleDescription="Required to continue" invalid>
        Terms
      </idg-checkbox>,
    );
    expect(native(root).getAttribute("aria-invalid")).toBe("true");
    const id = native(root).getAttribute("aria-describedby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.textContent).toBe("Required to continue");
    expect(root.shadowRoot?.querySelector(".invalid-mark")).not.toBeNull();
  });

  it("is named by its slotted text unless given another name", async () => {
    const plain = await render(<idg-checkbox>Terms</idg-checkbox>);
    expect(native(plain.root).hasAttribute("aria-label")).toBe(false);
    const named = await render(<idg-checkbox accessibleLabel="Accept">Terms</idg-checkbox>);
    expect(native(named.root).getAttribute("aria-label")).toBe("Accept");
  });
});

describe("idg-checkbox events and form", () => {
  it("emits idgChange with the state and value, and clears the mixed state", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-checkbox indeterminate value="yes">
        All
      </idg-checkbox>,
    );
    const spy = spyOnEvent("idgChange");
    toggle(root, true);
    await waitForChanges();
    expect(spy.lastEvent?.detail).toEqual({ checked: true, value: "yes" });
    expect((root as unknown as { checked: boolean }).checked).toBe(true);
    expect(native(root).indeterminate).toBe(false);
  });

  it("submits its value when checked and nothing when not", async () => {
    const { internals, root, waitForChanges } = await renderWithInternals(
      <idg-checkbox name="a">A</idg-checkbox>,
    );
    expect(internals.setFormValue).toHaveBeenLastCalledWith(null);
    toggle(root, true);
    await waitForChanges();
    expect(internals.setFormValue).toHaveBeenLastCalledWith("on");
    toggle(root, false);
    await waitForChanges();
    expect(internals.setFormValue).toHaveBeenLastCalledWith(null);
  });

  it("submits by its checked state alone, as a native checkbox does when mixed", async () => {
    const { internals } = await renderWithInternals(
      <idg-checkbox checked indeterminate>
        A
      </idg-checkbox>,
    );
    expect(internals.setFormValue).toHaveBeenLastCalledWith("on");
  });

  it("mirrors the native validity, anchored on the input", async () => {
    const { internals, root, waitForChanges } = await renderWithInternals(
      <idg-checkbox required>A</idg-checkbox>,
    );
    stubValidity(native(root), { valueMissing: true }, "Please check this box.");
    toggle(root, false);
    root.setAttribute("name", "x");
    (root as unknown as { value: string }).value = "other";
    await waitForChanges();
    expect(internals.setValidity.mock.lastCall?.[1]).toBe("Please check this box.");
    expect(internals.setValidity.mock.lastCall?.[2]).toBe(native(root));
  });

  it("resets to the initial state, follows form disabling and restores saved state", async () => {
    const { root, waitForChanges } = await renderWithInternals(
      <idg-checkbox checked>A</idg-checkbox>,
    );
    const element = root as unknown as {
      checked: boolean;
      formResetCallback: () => void;
      formDisabledCallback: (disabled: boolean) => void;
      formStateRestoreCallback: (state: string | null) => void;
    };
    toggle(root, false);
    await waitForChanges();
    element.formResetCallback();
    await waitForChanges();
    expect(element.checked).toBe(true);
    element.formDisabledCallback(true);
    await waitForChanges();
    expect(native(root).hasAttribute("disabled")).toBe(true);
    element.formStateRestoreCallback(null);
    await waitForChanges();
    expect(element.checked).toBe(false);
    element.formStateRestoreCallback("on");
    await waitForChanges();
    expect(element.checked).toBe(true);
  });
});
