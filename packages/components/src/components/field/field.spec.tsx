import { describe, expect, it, vi } from "vitest";
import { h } from "@stencil/vitest";
import { renderControl as render } from "../../testing/form-internals";
import "../input/input";
import "../radio-group/radio-group";
import "./field";

interface ControlElement extends HTMLElement {
  accessibleLabel?: string;
  accessibleDescription?: string;
  invalid: boolean;
  required: boolean;
}

function control(root: HTMLElement): ControlElement {
  const element = root.querySelector<ControlElement>("idg-input");
  if (!element) throw new Error("no control in the field");
  return element;
}

describe("idg-field rendering", () => {
  it("shows the label, hint and error from its props", async () => {
    const { root } = await render(
      <idg-field label="Email" hint="Work address" error="Not an address">
        <idg-input />
      </idg-field>,
    );
    const shadow = root.shadowRoot;
    expect(shadow?.querySelector("label")?.textContent).toContain("Email");
    expect(shadow?.querySelector(".hint")?.textContent).toContain("Work address");
    expect(shadow?.querySelector(".error")?.textContent).toContain("Not an address");
  });

  it("offers label, hint and error slots that take the place of the props", async () => {
    const { root } = await render(
      <idg-field>
        <span slot="label">Rich label</span>
        <idg-input />
        <span slot="hint">Rich hint</span>
        <span slot="error">Rich error</span>
      </idg-field>,
    );
    const shadow = root.shadowRoot;
    expect(shadow?.querySelector('slot[name="label"]')).not.toBeNull();
    expect(shadow?.querySelector('slot[name="hint"]')).not.toBeNull();
    expect(shadow?.querySelector('slot[name="error"]')).not.toBeNull();
    expect(shadow?.querySelector("slot:not([name])")).not.toBeNull();
  });

  it("marks a required field with a star hidden from assistive technology", async () => {
    const { root } = await render(
      <idg-field label="Email" required>
        <idg-input />
      </idg-field>,
    );
    expect(root.shadowRoot?.querySelector(".marker")?.getAttribute("aria-hidden")).toBe("true");
    expect(root.shadowRoot?.querySelector(".optional")).toBeNull();
  });

  it("says a field is optional with the text it is given, and only then", async () => {
    const optional = await render(
      <idg-field label="Phone" optionalText="optional">
        <idg-input />
      </idg-field>,
    );
    expect(optional.root.shadowRoot?.querySelector(".optional")?.textContent).toBe("optional");
    const plain = await render(
      <idg-field label="Phone">
        <idg-input />
      </idg-field>,
    );
    expect(plain.root.shadowRoot?.querySelector(".optional")).toBeNull();
    const required = await render(
      <idg-field label="Phone" optionalText="optional" required>
        <idg-input />
      </idg-field>,
    );
    expect(required.root.shadowRoot?.querySelector(".optional")).toBeNull();
  });

  it("keeps the hint available to assistive technology rather than removing it", async () => {
    const { root } = await render(
      <idg-field label="A" hint="Hint">
        <idg-input />
      </idg-field>,
    );
    const hint = root.shadowRoot?.querySelector(".hint");
    expect(hint?.hasAttribute("hidden")).toBe(false);
    expect(hint?.getAttribute("aria-hidden")).toBeNull();
  });

  it("has no hint element, and an empty error region, when it has neither", async () => {
    const { root } = await render(
      <idg-field label="A">
        <idg-input />
      </idg-field>,
    );
    expect(root.shadowRoot?.querySelector(".hint")).toBeNull();
    expect(root.shadowRoot?.querySelector(".error")?.textContent).toBe("");
  });
});

describe("idg-field live error", () => {
  it("keeps one alert region, with no extra live attributes that would announce twice", async () => {
    const { root } = await render(
      <idg-field label="A" error="Bad">
        <idg-input />
      </idg-field>,
    );
    const regions = root.shadowRoot?.querySelectorAll('[role="alert"], [aria-live]');
    expect(regions).toHaveLength(1);
    const region = regions?.[0];
    expect(region?.getAttribute("role")).toBe("alert");
    expect(region?.hasAttribute("aria-live")).toBe(false);
    expect(region?.hasAttribute("aria-atomic")).toBe(false);
  });

  it("keeps the alert region in the page before an error arrives, so the error is announced", async () => {
    const { root } = await render(
      <idg-field label="A">
        <idg-input />
      </idg-field>,
    );
    expect(root.shadowRoot?.querySelector('[role="alert"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[role="alert"]')?.textContent).toBe("");
  });

  it("draws a mark that is not announced beside the error text", async () => {
    const { root } = await render(
      <idg-field label="A" error="Bad">
        <idg-input />
      </idg-field>,
    );
    expect(root.shadowRoot?.querySelector(".error-mark")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("idg-field protocol", () => {
  it("hands the label, the hint and error as the description, and the state to the control", async () => {
    const { root } = await render(
      <idg-field label="Email" hint="Work address" error="Not an address" required>
        <idg-input />
      </idg-field>,
    );
    const input = control(root);
    expect(input.accessibleLabel).toBe("Email");
    expect(input.accessibleDescription).toBe("Work address Not an address");
    expect(input.invalid).toBe(true);
    expect(input.required).toBe(true);
  });

  it("describes with the hint alone when there is no error, and does not mark the control invalid", async () => {
    const { root } = await render(
      <idg-field label="Email" hint="Work address">
        <idg-input />
      </idg-field>,
    );
    expect(control(root).accessibleDescription).toBe("Work address");
    expect(control(root).invalid).toBe(false);
  });

  it("reads rich text from the slots", async () => {
    const { root } = await render(
      <idg-field>
        <span slot="label">
          Rich <em>label</em>
        </span>
        <idg-input />
        <span slot="hint">Slot hint</span>
      </idg-field>,
    );
    expect(control(root).accessibleLabel).toBe("Rich label");
    expect(control(root).accessibleDescription).toBe("Slot hint");
  });

  it("follows changes to its props", async () => {
    const { root, setProps } = await render(
      <idg-field label="Email">
        <idg-input />
      </idg-field>,
    );
    await setProps({ label: "Work email", error: "Required" });
    expect(control(root).accessibleLabel).toBe("Work email");
    expect(control(root).invalid).toBe(true);
    await setProps({ error: "" });
    expect(control(root).invalid).toBe(false);
    expect(control(root).accessibleDescription).toBeUndefined();
  });

  it("also wraps a radio group", async () => {
    const { root } = await render(
      <idg-field label="Plan" hint="Billed monthly">
        <idg-radio-group />
      </idg-field>,
    );
    const group = root.querySelector<ControlElement>("idg-radio-group");
    expect(group?.accessibleLabel).toBe("Plan");
    expect(group?.accessibleDescription).toBe("Billed monthly");
  });

  it("copes with no control", async () => {
    const { root } = await render(<idg-field label="Empty" />);
    expect(root.shadowRoot?.querySelector("label")).not.toBeNull();
  });
});

describe("idg-field label click", () => {
  it("focuses the control", async () => {
    const { root } = await render(
      <idg-field label="Email">
        <idg-input />
      </idg-field>,
    );
    const setFocus = vi.fn(() => Promise.resolve());
    Object.assign(control(root), { setFocus });
    root.shadowRoot?.querySelector("label")?.click();
    expect(setFocus).toHaveBeenCalledTimes(1);
  });
});

describe("idg-field with a control defined later", () => {
  // With the custom-elements build a page may define idg-field before the control. The control
  // is then a plain element when the field first renders, and must still get the field's state.
  it("hands its label and description to a control defined after the field rendered", async () => {
    const { root } = await render(
      <idg-field label="Name" hint="As on your passport">
        <idg-late-control />
      </idg-field>,
    );
    customElements.define(
      "idg-late-control",
      class extends HTMLElement {
        accessibleLabel: string | undefined = undefined;
        accessibleDescription: string | undefined = undefined;
      },
    );
    const late = root.querySelector<ControlElement>("idg-late-control");
    await vi.waitFor(() => {
      expect(late?.accessibleLabel).toBe("Name");
    });
    expect(late?.accessibleDescription).toBe("As on your passport");
  });
});
