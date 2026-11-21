import { describe, expect, it } from "vitest";
import { h } from "@stencil/vitest";
import {
  renderControl as render,
  renderWithInternals,
  stubValidity,
} from "../../testing/form-internals";
import "./textarea";

function native(root: HTMLElement): HTMLTextAreaElement {
  const element = root.shadowRoot?.querySelector<HTMLTextAreaElement>("textarea");
  if (!element) throw new Error("idg-textarea rendered no textarea");
  return element;
}

function type(root: HTMLElement, value: string): void {
  native(root).value = value;
  native(root).dispatchEvent(new Event("input", { bubbles: true }));
}

describe("idg-textarea rendering", () => {
  it("renders a native textarea of three rows by default", async () => {
    const { root } = await render(<idg-textarea />);
    expect(native(root).getAttribute("rows")).toBe("3");
    expect(native(root).getAttribute("part")).toBe("control");
  });

  it("passes the native attributes", async () => {
    const { root } = await render(
      <idg-textarea
        name="bio"
        rows={6}
        placeholder="Tell us"
        required
        readonly
        minlength={2}
        maxlength={100}
        autocomplete="off"
        spellcheck="false"
      />,
    );
    const area = native(root);
    expect(area.getAttribute("name")).toBe("bio");
    expect(area.getAttribute("rows")).toBe("6");
    expect(area.getAttribute("placeholder")).toBe("Tell us");
    expect(area.hasAttribute("required")).toBe(true);
    expect(area.hasAttribute("readonly")).toBe(true);
    expect(area.getAttribute("minlength")).toBe("2");
    expect(area.getAttribute("maxlength")).toBe("100");
    expect(area.getAttribute("autocomplete")).toBe("off");
    expect(area.getAttribute("spellcheck")).toBe("false");
  });

  it("shows the value and disables", async () => {
    const { root } = await render(<idg-textarea value="Hello" disabled />);
    expect(native(root).value).toBe("Hello");
    expect(native(root).hasAttribute("disabled")).toBe(true);
  });
});

describe("idg-textarea auto-grow", () => {
  it("renders no sizing twin unless asked", async () => {
    const { root } = await render(<idg-textarea value="a" />);
    expect(root.shadowRoot?.querySelector(".sizer")).toBeNull();
  });

  it("renders a hidden twin holding the value, for browsers without field-sizing", async () => {
    const { root } = await render(<idg-textarea autogrow value="a" rows={3} />);
    const sizer = root.shadowRoot?.querySelector(".sizer");
    expect(sizer?.getAttribute("aria-hidden")).toBe("true");
    expect(sizer?.textContent?.startsWith("a\n")).toBe(true);
    expect(sizer?.textContent?.split("\n")).toHaveLength(4);
  });

  it("follows the value as it is typed", async () => {
    const { root, waitForChanges } = await render(<idg-textarea autogrow rows={1} />);
    type(root, "one\ntwo\nthree");
    await waitForChanges();
    expect(root.shadowRoot?.querySelector(".sizer")?.textContent).toBe("one\ntwo\nthree\n");
  });
});

describe("idg-textarea character count", () => {
  it("shows no count unless asked", async () => {
    const { root } = await render(<idg-textarea maxlength={50} />);
    expect(root.shadowRoot?.querySelector(".counter")).toBeNull();
  });

  it("shows the count against the limit, hidden from assistive technology", async () => {
    const { root } = await render(<idg-textarea counter maxlength={50} value="abc" />);
    const counter = root.shadowRoot?.querySelector(".counter");
    expect(counter?.textContent).toBe("3 / 50");
    expect(counter?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the bare count without a limit", async () => {
    const { root } = await render(<idg-textarea counter value="abc" />);
    expect(root.shadowRoot?.querySelector(".counter")?.textContent).toBe("3");
  });

  it("announces politely only near the limit", async () => {
    const { root, waitForChanges } = await render(<idg-textarea counter maxlength={30} />);
    const status = () => root.shadowRoot?.querySelector('[role="status"]')?.textContent;
    type(root, "abc");
    await waitForChanges();
    expect(status()).toBe("");
    type(root, "a".repeat(25));
    await waitForChanges();
    expect(status()).toBe("5 characters remaining");
  });
});

describe("idg-textarea accessibility protocol", () => {
  it("names, describes and flags the native textarea", async () => {
    const { root } = await render(
      <idg-textarea accessibleLabel="Bio" accessibleDescription="Keep it short" invalid />,
    );
    const area = native(root);
    expect(area.getAttribute("aria-label")).toBe("Bio");
    expect(area.getAttribute("aria-invalid")).toBe("true");
    const id = area.getAttribute("aria-describedby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.textContent).toBe("Keep it short");
    expect(root.shadowRoot?.querySelector(".invalid-mark")).not.toBeNull();
  });
});

describe("idg-textarea events and form", () => {
  it("emits idgInput and idgChange with the value", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(<idg-textarea />);
    const input = spyOnEvent("idgInput");
    const change = spyOnEvent("idgChange");
    type(root, "Hi");
    await waitForChanges();
    native(root).dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.lastEvent?.detail).toEqual({ value: "Hi" });
    expect(change.lastEvent?.detail).toEqual({ value: "Hi" });
  });

  it("reports its value and validity, resets, and follows form disabling", async () => {
    const { internals, root, waitForChanges } = await renderWithInternals(
      <idg-textarea value="start" />,
    );
    expect(internals.setFormValue).toHaveBeenLastCalledWith("start");
    stubValidity(native(root), { tooShort: true }, "Too short");
    type(root, "x");
    await waitForChanges();
    expect(internals.setValidity.mock.lastCall?.[1]).toBe("Too short");
    expect(internals.setValidity.mock.lastCall?.[2]).toBe(native(root));
    const element = root as unknown as {
      formResetCallback: () => void;
      formDisabledCallback: (disabled: boolean) => void;
    };
    element.formResetCallback();
    element.formDisabledCallback(true);
    await waitForChanges();
    expect(native(root).value).toBe("start");
    expect(native(root).hasAttribute("disabled")).toBe(true);
  });
});
