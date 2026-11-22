import { describe, expect, it } from "vitest";
import { h } from "@stencil/vitest";
import { renderControl as render, renderWithInternals } from "../../testing/form-internals";
import "../radio/radio";
import "./radio-group";

interface RadioElement extends HTMLElement {
  checked: boolean;
  tabbable: boolean;
  groupDisabled: boolean;
  invalid: boolean;
  position: number;
  setSize: number;
}

function radios(root: HTMLElement): RadioElement[] {
  return Array.from(root.querySelectorAll<RadioElement>("idg-radio"));
}

function inner(radio: HTMLElement): HTMLInputElement {
  const element = radio.shadowRoot?.querySelector<HTMLInputElement>("input");
  if (!element) throw new Error("radio rendered no input");
  return element;
}

const plans = (
  <idg-radio-group name="plan" accessibleLabel="Plan">
    <idg-radio value="a">Free</idg-radio>
    <idg-radio value="b" disabled>
      Pro
    </idg-radio>
    <idg-radio value="c">Team</idg-radio>
  </idg-radio-group>
);

function press(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("idg-radio-group rendering", () => {
  it("wraps its radios in a radiogroup named by accessibleLabel", async () => {
    const { root } = await render(plans);
    const group = root.shadowRoot?.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute("aria-label")).toBe("Plan");
    expect(group?.querySelector("slot")).not.toBeNull();
  });

  it("describes the group, and flags required and invalid", async () => {
    const { root } = await render(
      <idg-radio-group required invalid accessibleDescription="Pick one">
        <idg-radio value="a">A</idg-radio>
      </idg-radio-group>,
    );
    const group = root.shadowRoot?.querySelector('[role="radiogroup"]');
    expect(group?.getAttribute("aria-required")).toBe("true");
    expect(group?.getAttribute("aria-invalid")).toBe("true");
    const id = group?.getAttribute("aria-describedby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.textContent).toBe("Pick one");
    expect(radios(root)[0]?.invalid).toBe(true);
  });

  it("numbers the radios", async () => {
    const { root } = await render(plans);
    expect(radios(root).map((radio) => [radio.position, radio.setSize])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("checks the radio whose value matches", async () => {
    const { root } = await render(
      <idg-radio-group value="c">
        <idg-radio value="a">A</idg-radio>
        <idg-radio value="c">C</idg-radio>
      </idg-radio-group>,
    );
    expect(radios(root).map((radio) => radio.checked)).toEqual([false, true]);
  });

  it("passes group disabling to the radios", async () => {
    const { root } = await render(
      <idg-radio-group disabled>
        <idg-radio value="a">A</idg-radio>
      </idg-radio-group>,
    );
    expect(radios(root)[0]?.groupDisabled).toBe(true);
  });
});

describe("idg-radio-group roving tabindex", () => {
  it("makes the first enabled radio the only tab stop when none is checked", async () => {
    const { root } = await render(plans);
    expect(radios(root).map((radio) => radio.tabbable)).toEqual([true, false, false]);
  });

  it("makes the checked radio the only tab stop", async () => {
    const { root } = await render(
      <idg-radio-group value="c">
        <idg-radio value="a">A</idg-radio>
        <idg-radio value="c">C</idg-radio>
      </idg-radio-group>,
    );
    expect(radios(root).map((radio) => radio.tabbable)).toEqual([false, true]);
  });
});

describe("idg-radio-group parts", () => {
  it("exposes the box that arranges the radios as the group part, so a page can lay them out", async () => {
    const { root } = await render(plans);
    expect(root.shadowRoot?.querySelector('[role="radiogroup"]')?.getAttribute("part")).toBe(
      "group",
    );
  });
});

describe("idg-radio-group selection and keys", () => {
  it("selects the radio that is chosen and emits idgChange once", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(plans);
    const spy = spyOnEvent("idgChange");
    const [first] = radios(root);
    inner(first as HTMLElement).checked = true;
    inner(first as HTMLElement).dispatchEvent(new Event("change", { bubbles: true }));
    await waitForChanges();
    expect((root as unknown as { value: string }).value).toBe("a");
    expect(spy.length).toBe(1);
    expect(spy.lastEvent?.detail).toEqual({ value: "a" });
    expect(radios(root).map((radio) => radio.checked)).toEqual([true, false, false]);
  });

  it("moves to the next enabled radio on ArrowDown, skipping a disabled one, and selects it", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(plans);
    const spy = spyOnEvent("idgChange");
    const event = press(radios(root)[0] as HTMLElement, "ArrowDown");
    await waitForChanges();
    expect(event.defaultPrevented).toBe(true);
    expect((root as unknown as { value: string }).value).toBe("c");
    expect(spy.lastEvent?.detail).toEqual({ value: "c" });
    expect(radios(root).map((radio) => radio.tabbable)).toEqual([false, false, true]);
  });

  it("wraps around with ArrowUp and ArrowLeft", async () => {
    const { root, waitForChanges } = await render(plans);
    press(radios(root)[0] as HTMLElement, "ArrowUp");
    await waitForChanges();
    expect((root as unknown as { value: string }).value).toBe("c");
    press(radios(root)[2] as HTMLElement, "ArrowLeft");
    await waitForChanges();
    expect((root as unknown as { value: string }).value).toBe("a");
  });

  it("leaves other keys alone", async () => {
    const { root } = await render(plans);
    const event = press(radios(root)[0] as HTMLElement, "a");
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing while the whole group is disabled", async () => {
    const { root } = await render(
      <idg-radio-group disabled>
        <idg-radio value="a">A</idg-radio>
        <idg-radio value="b">B</idg-radio>
      </idg-radio-group>,
    );
    press(radios(root)[0] as HTMLElement, "ArrowDown");
    expect((root as unknown as { value: string }).value).toBe("");
  });
});

describe("idg-radio-group as a form control", () => {
  it("submits the chosen value, or nothing", async () => {
    const { internals, root, waitForChanges } = await renderWithInternals(plans);
    expect(internals.setFormValue).toHaveBeenLastCalledWith(null);
    press(radios(root)[0] as HTMLElement, "ArrowDown");
    await waitForChanges();
    expect(internals.setFormValue).toHaveBeenLastCalledWith("c");
  });

  it("is invalid while required and nothing is chosen, anchored on the first radio", async () => {
    const { internals, root, waitForChanges } = await renderWithInternals(
      <idg-radio-group required>
        <idg-radio value="a">A</idg-radio>
        <idg-radio value="b">B</idg-radio>
      </idg-radio-group>,
    );
    await waitForChanges();
    const [flags, message, anchor] = internals.setValidity.mock.lastCall as [
      ValidityStateFlags,
      string,
      HTMLElement,
    ];
    expect(flags).toEqual({ valueMissing: true });
    expect(message).not.toBe("");
    expect(anchor).toBe(inner(radios(root)[0] as HTMLElement));
    press(radios(root)[0] as HTMLElement, "ArrowDown");
    await waitForChanges();
    expect(internals.setValidity).toHaveBeenLastCalledWith({});
  });

  it("is valid when not required", async () => {
    const { internals } = await renderWithInternals(plans);
    expect(internals.setValidity).toHaveBeenLastCalledWith({});
  });

  it("resets to the initial value, follows form disabling and restores saved state", async () => {
    const { root, waitForChanges } = await renderWithInternals(
      <idg-radio-group value="a">
        <idg-radio value="a">A</idg-radio>
        <idg-radio value="b">B</idg-radio>
      </idg-radio-group>,
    );
    const element = root as unknown as {
      value: string;
      formResetCallback: () => void;
      formDisabledCallback: (disabled: boolean) => void;
      formStateRestoreCallback: (state: string | null) => void;
    };
    press(radios(root)[0] as HTMLElement, "ArrowDown");
    await waitForChanges();
    element.formResetCallback();
    await waitForChanges();
    expect(element.value).toBe("a");
    element.formDisabledCallback(true);
    await waitForChanges();
    expect(radios(root)[0]?.groupDisabled).toBe(true);
    element.formStateRestoreCallback("b");
    await waitForChanges();
    expect(element.value).toBe("b");
  });
});
