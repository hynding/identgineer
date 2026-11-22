import { describe, expect, it, vi } from "vitest";
import { h } from "@stencil/vitest";
import {
  renderControl as render,
  renderWithInternals,
  stubValidity,
} from "../../testing/form-internals";
import "./input";

function native(root: HTMLElement): HTMLInputElement {
  const element = root.shadowRoot?.querySelector<HTMLInputElement>("input");
  if (!element) throw new Error("idg-input rendered no input");
  return element;
}

function type(root: HTMLElement, value: string): void {
  const input = native(root);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("idg-input rendering", () => {
  it("renders a native text input by default", async () => {
    const { root } = await render(<idg-input />);
    expect(native(root).getAttribute("type")).toBe("text");
    expect(native(root).getAttribute("part")).toBe("control");
  });

  it.each(["text", "email", "password", "search", "tel", "url", "number"] as const)(
    "supports type %s",
    async (type) => {
      const { root } = await render(<idg-input type={type} />);
      expect(native(root).getAttribute("type")).toBe(type);
    },
  );

  it("falls back to text for a type it does not know", async () => {
    const { root } = await render(<idg-input type={"color" as "text"} />);
    expect(native(root).getAttribute("type")).toBe("text");
  });

  it("passes the native attributes to the input", async () => {
    const { root } = await render(
      <idg-input
        name="email"
        placeholder="you@example.com"
        required
        readonly
        minlength={2}
        maxlength={40}
        min="1"
        max="9"
        step="2"
        pattern="[a-z]+"
        autocomplete="email"
        inputmode="email"
        enterkeyhint="next"
        spellcheck="false"
        autocapitalize="none"
      />,
    );
    const input = native(root);
    expect(input.getAttribute("name")).toBe("email");
    expect(input.getAttribute("placeholder")).toBe("you@example.com");
    expect(input.hasAttribute("required")).toBe(true);
    expect(input.hasAttribute("readonly")).toBe(true);
    expect(input.getAttribute("minlength")).toBe("2");
    expect(input.getAttribute("maxlength")).toBe("40");
    expect(input.getAttribute("min")).toBe("1");
    expect(input.getAttribute("max")).toBe("9");
    expect(input.getAttribute("step")).toBe("2");
    expect(input.getAttribute("pattern")).toBe("[a-z]+");
    expect(input.getAttribute("autocomplete")).toBe("email");
    expect(input.getAttribute("inputmode")).toBe("email");
    expect(input.getAttribute("enterkeyhint")).toBe("next");
    expect(input.getAttribute("spellcheck")).toBe("false");
    expect(input.getAttribute("autocapitalize")).toBe("none");
  });

  it("shows the value", async () => {
    const { root } = await render(<idg-input value="Ada" />);
    expect(native(root).value).toBe("Ada");
  });

  it("offers start and end slots and a control part", async () => {
    const { root } = await render(<idg-input />);
    expect(root.shadowRoot?.querySelector('slot[name="start"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('slot[name="end"]')).not.toBeNull();
  });

  it.each(["sm", "md", "lg"] as const)("applies size %s", async (size) => {
    const { root } = await render(<idg-input size={size} />);
    expect(root.shadowRoot?.querySelector(".box")?.classList.contains(`size-${size}`)).toBe(true);
  });

  it("falls back to the medium size", async () => {
    const { root } = await render(<idg-input size={"xl" as "md"} />);
    expect(root.shadowRoot?.querySelector(".box")?.classList.contains("size-md")).toBe(true);
  });

  it("disables the input", async () => {
    const { root } = await render(<idg-input disabled />);
    expect(native(root).hasAttribute("disabled")).toBe(true);
  });
});

describe("idg-input accessibility protocol", () => {
  it("names the native input from accessibleLabel", async () => {
    const { root } = await render(<idg-input accessibleLabel="Email" />);
    expect(native(root).getAttribute("aria-label")).toBe("Email");
  });

  it("describes the native input through an element in the same shadow root", async () => {
    const { root } = await render(<idg-input accessibleDescription="We never share it" />);
    const describedBy = native(root).getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();
    const description = root.shadowRoot?.getElementById(describedBy ?? "");
    expect(description?.textContent).toBe("We never share it");
  });

  it("adds no description reference without a description", async () => {
    const { root } = await render(<idg-input />);
    expect(native(root).hasAttribute("aria-describedby")).toBe(false);
    expect(native(root).hasAttribute("aria-label")).toBe(false);
  });

  it("marks an invalid control with aria-invalid and a cue that is not only colour", async () => {
    const { root } = await render(<idg-input invalid />);
    expect(native(root).getAttribute("aria-invalid")).toBe("true");
    expect(root.shadowRoot?.querySelector(".invalid-mark")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("is not marked invalid by default", async () => {
    const { root } = await render(<idg-input />);
    expect(native(root).hasAttribute("aria-invalid")).toBe(false);
    expect(root.shadowRoot?.querySelector(".invalid-mark")).toBeNull();
  });

  it("focuses the native input", async () => {
    const { root } = await render(<idg-input />);
    const focus = vi.spyOn(native(root), "focus");
    await (root as unknown as { setFocus: () => Promise<void> }).setFocus();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("selects the text of the native input, for a value that is meant to be copied", async () => {
    const { root } = await render(<idg-input value="https://example.com" readonly />);
    // The mock input has no select(); a browser's has.
    const select = vi.fn();
    Object.assign(native(root), { select });
    await (root as unknown as { selectText: () => Promise<void> }).selectText();
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe("idg-input password reveal", () => {
  it("offers no toggle unless asked, or for other types", async () => {
    const plain = await render(<idg-input type="password" />);
    expect(plain.root.shadowRoot?.querySelector("button")).toBeNull();
    const text = await render(<idg-input type="text" reveal />);
    expect(text.root.shadowRoot?.querySelector("button")).toBeNull();
  });

  it("renders a real button with aria-pressed that is not a submit button", async () => {
    const { root } = await render(<idg-input type="password" reveal />);
    const button = root.shadowRoot?.querySelector("button");
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(button?.getAttribute("aria-label")).toBe("Show password");
  });

  it("shows and hides the password without touching the value", async () => {
    const { root, waitForChanges } = await render(
      <idg-input type="password" reveal value="hunter2" />,
    );
    const button = root.shadowRoot?.querySelector("button");
    button?.click();
    await waitForChanges();
    expect(native(root).getAttribute("type")).toBe("text");
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect((root as unknown as { value: string }).value).toBe("hunter2");
    button?.click();
    await waitForChanges();
    expect(native(root).getAttribute("type")).toBe("password");
    expect(native(root).value).toBe("hunter2");
  });

  it("hides the password again when the value is set from outside or the form is reset", async () => {
    const { root, waitForChanges } = await renderWithInternals(
      <idg-input type="password" reveal value="hunter2" />,
    );
    const button = () => root.shadowRoot?.querySelector("button");
    const host = root as unknown as { value: string; formResetCallback: () => void };
    button()?.click();
    await waitForChanges();
    host.value = "";
    expect(native(root).getAttribute("type")).toBe("password");
    await waitForChanges();
    expect(button()?.getAttribute("aria-pressed")).toBe("false");
    button()?.click();
    await waitForChanges();
    host.formResetCallback();
    await waitForChanges();
    expect(native(root).getAttribute("type")).toBe("password");
  });

  it("takes the label for the toggle from revealLabel", async () => {
    const { root } = await render(<idg-input type="password" reveal revealLabel="Mostrar" />);
    expect(root.shadowRoot?.querySelector("button")?.getAttribute("aria-label")).toBe("Mostrar");
  });
});

describe("idg-input events and value", () => {
  it("updates value and emits idgInput with the new value while typing", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<idg-input />);
    const spy = spyOnEvent("idgInput");
    type(root, "Ada");
    await waitForChanges();
    expect((root as unknown as { value: string }).value).toBe("Ada");
    expect(spy.length).toBe(1);
    expect(spy.lastEvent?.detail).toEqual({ value: "Ada" });
  });

  it("emits idgChange when the value is committed", async () => {
    const { root, spyOnEvent } = await render(<idg-input />);
    const spy = spyOnEvent("idgChange");
    native(root).value = "Ada";
    native(root).dispatchEvent(new Event("change", { bubbles: true }));
    expect(spy.lastEvent?.detail).toEqual({ value: "Ada" });
  });
});

describe("idg-input as a form control", () => {
  it("reports its value to the form", async () => {
    const { internals, root, waitForChanges } = await renderWithInternals(
      <idg-input name="a" value="x" />,
    );
    expect(internals.setFormValue).toHaveBeenLastCalledWith("x");
    type(root, "y");
    await waitForChanges();
    expect(internals.setFormValue).toHaveBeenLastCalledWith("y");
  });

  it("mirrors the native validity into the element internals, anchored on the input", async () => {
    const { internals, root, waitForChanges } = await renderWithInternals(<idg-input required />);
    expect(internals.setValidity).toHaveBeenLastCalledWith(
      {
        badInput: false,
        customError: false,
        patternMismatch: false,
        rangeOverflow: false,
        rangeUnderflow: false,
        stepMismatch: false,
        tooLong: false,
        tooShort: false,
        typeMismatch: false,
        valueMissing: false,
      },
      "",
      native(root),
    );
    stubValidity(native(root), { valueMissing: true }, "Please fill out this field.");
    type(root, "a");
    await waitForChanges();
    const [flags, message, anchor] = internals.setValidity.mock.lastCall as [
      ValidityStateFlags,
      string,
      HTMLElement,
    ];
    expect(flags.valueMissing).toBe(true);
    expect(message).toBe("Please fill out this field.");
    expect(anchor).toBe(native(root));
  });

  it("delegates checkValidity and reportValidity to the internals", async () => {
    const { internals, root } = await renderWithInternals(<idg-input />);
    const element = root as unknown as {
      checkValidity: () => Promise<boolean>;
      reportValidity: () => Promise<boolean>;
    };
    internals.checkValidity.mockReturnValue(false);
    expect(await element.checkValidity()).toBe(false);
    expect(await element.reportValidity()).toBe(true);
    expect(internals.reportValidity).toHaveBeenCalledTimes(1);
  });

  it("restores the initial value when the form resets", async () => {
    const { root, waitForChanges } = await renderWithInternals(<idg-input value="start" />);
    type(root, "changed");
    await waitForChanges();
    (root as unknown as { formResetCallback: () => void }).formResetCallback();
    await waitForChanges();
    expect(native(root).value).toBe("start");
  });

  it("disables the input when the form disables it, for example through a fieldset", async () => {
    const { root, waitForChanges } = await renderWithInternals(<idg-input />);
    (root as unknown as { formDisabledCallback: (d: boolean) => void }).formDisabledCallback(true);
    await waitForChanges();
    expect(native(root).hasAttribute("disabled")).toBe(true);
    (root as unknown as { formDisabledCallback: (d: boolean) => void }).formDisabledCallback(false);
    await waitForChanges();
    expect(native(root).hasAttribute("disabled")).toBe(false);
  });

  function pressEnter(root: HTMLElement, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      composed: true,
      ...init,
    });
    native(root).dispatchEvent(event);
    return event;
  }

  /** What a form needs for the input to watch its submit, here without listeners. */
  const listenerless = () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() });

  /** Lets the keydown finish its dispatch: implicit submission is decided after it. */
  const afterDispatch = () =>
    new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

  // The native input sits in a shadow root and has no form owner, so the browser's implicit
  // submission never reaches the form: Enter would do nothing in a form of idg-input elements.
  // The cases of the algorithm itself run in the browser tests, against native inputs.
  it("submits its form on Enter once the keydown is dispatched, as a native input does", async () => {
    const form = { ...listenerless(), requestSubmit: vi.fn(), elements: [] as Element[] };
    const { root } = await renderWithInternals(<idg-input />, form);
    form.elements.push(root);
    pressEnter(root);
    expect(form.requestSubmit).not.toHaveBeenCalled();
    await afterDispatch();
    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
  });

  it("leaves Enter alone while composing, once handled, or when a listener further out takes it", async () => {
    const form = { ...listenerless(), requestSubmit: vi.fn(), elements: [] as Element[] };
    const { root } = await renderWithInternals(<idg-input />, form);
    form.elements.push(root);
    pressEnter(root, { isComposing: true });
    const handled = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    handled.preventDefault();
    native(root).dispatchEvent(handled);
    pressEnter(root, { key: "a" });
    // As a combobox around the field would, after the input's own listener has run.
    pressEnter(root).preventDefault();
    await afterDispatch();
    expect(form.requestSubmit).not.toHaveBeenCalled();
  });

  it("does nothing on Enter outside a form", async () => {
    const { root } = await renderWithInternals(<idg-input />);
    expect(pressEnter(root).defaultPrevented).toBe(false);
  });

  it("restores a value the browser saved", async () => {
    const { root, waitForChanges } = await renderWithInternals(<idg-input />);
    (root as unknown as { formStateRestoreCallback: (s: string) => void }).formStateRestoreCallback(
      "saved",
    );
    await waitForChanges();
    expect(native(root).value).toBe("saved");
  });
});
