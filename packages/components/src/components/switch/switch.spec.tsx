import { describe, expect, it } from "vitest";
import { h } from "@stencil/vitest";
import { renderControl as render, renderWithInternals } from "../../testing/form-internals";
import "./switch";

function native(root: HTMLElement): HTMLInputElement {
  const element = root.shadowRoot?.querySelector<HTMLInputElement>("input");
  if (!element) throw new Error("idg-switch rendered no input");
  return element;
}

function toggle(root: HTMLElement, checked: boolean): void {
  native(root).checked = checked;
  native(root).dispatchEvent(new Event("change", { bubbles: true }));
}

describe("idg-switch rendering", () => {
  it("renders a native checkbox given the switch role, inside a label", async () => {
    const { root } = await render(<idg-switch>Notifications</idg-switch>);
    expect(native(root).getAttribute("type")).toBe("checkbox");
    expect(native(root).getAttribute("role")).toBe("switch");
    expect(root.shadowRoot?.querySelector("label")?.contains(native(root))).toBe(true);
  });

  it("reflects checked, disabled and required", async () => {
    const { root } = await render(
      <idg-switch checked disabled required name="n">
        N
      </idg-switch>,
    );
    expect(native(root).checked).toBe(true);
    expect(native(root).hasAttribute("disabled")).toBe(true);
    expect(native(root).hasAttribute("required")).toBe(true);
  });

  it("accepts a name, a description and the invalid state", async () => {
    const { root } = await render(
      <idg-switch accessibleLabel="Alerts" accessibleDescription="Sent by email" invalid>
        N
      </idg-switch>,
    );
    expect(native(root).getAttribute("aria-label")).toBe("Alerts");
    expect(native(root).getAttribute("aria-invalid")).toBe("true");
    const id = native(root).getAttribute("aria-describedby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.textContent).toBe("Sent by email");
  });
});

describe("idg-switch events and form", () => {
  it("emits idgChange and submits only while on", async () => {
    const { internals, root, spyOnEvent, waitForChanges } = await renderWithInternals(
      <idg-switch name="n" value="yes">
        N
      </idg-switch>,
    );
    const spy = spyOnEvent("idgChange");
    expect(internals.setFormValue).toHaveBeenLastCalledWith(null);
    toggle(root, true);
    await waitForChanges();
    expect(spy.lastEvent?.detail).toEqual({ checked: true, value: "yes" });
    expect(internals.setFormValue).toHaveBeenLastCalledWith("yes");
  });

  it("resets, follows form disabling and restores saved state", async () => {
    const { root, waitForChanges } = await renderWithInternals(<idg-switch checked>N</idg-switch>);
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
  });
});
