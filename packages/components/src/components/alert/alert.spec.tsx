import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./alert";

function alert(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="alert"]');
  if (!element) throw new Error("idg-alert rendered no alert part");
  return element;
}

function dismissButton(root: HTMLElement): HTMLButtonElement | null {
  return root.shadowRoot?.querySelector<HTMLButtonElement>('button[part="dismiss"]') ?? null;
}

describe("idg-alert rendering", () => {
  it("renders an info alert with a title and body slot by default", async () => {
    const { root } = await render(
      <idg-alert>
        <span slot="title">Heads up</span>
        Something changed.
      </idg-alert>,
    );
    const element = alert(root);
    expect(element.classList.contains("variant-info")).toBe(true);
    expect(root.shadowRoot?.querySelector('[part="title"] slot[name="title"]')).not.toBeNull();
    expect(root.shadowRoot?.querySelector('[part="body"] slot:not([name])')).not.toBeNull();
  });

  it("renders no title wrapper when no title is given", async () => {
    const { root } = await render(<idg-alert>Something changed.</idg-alert>);
    expect(root.shadowRoot?.querySelector('[part="title"]')).toBeNull();
  });

  it("falls back to info for a variant it does not know", async () => {
    const { root } = await render(<idg-alert variant={"loud" as "info"}>Text</idg-alert>);
    expect(alert(root).classList.contains("variant-info")).toBe(true);
  });
});

describe("idg-alert announcement", () => {
  it.each([
    ["info", "status", "info"],
    ["success", "status", "success"],
    ["warning", "alert", "warning"],
    ["danger", "alert", "error"],
  ] as const)("%s is a %s with the %s icon", async (variant, role, icon) => {
    const { root } = await render(<idg-alert variant={variant}>Text</idg-alert>);
    const element = alert(root);
    expect(element.classList.contains(`variant-${variant}`)).toBe(true);
    expect(element.getAttribute("role")).toBe(role);
    const mark = root.shadowRoot?.querySelector('[part="icon"]');
    expect(mark?.getAttribute("name")).toBe(icon);
    expect(mark?.getAttribute("aria-hidden")).toBe("true");
  });

  it("adds no live region beside its role, which would announce the message twice", async () => {
    for (const variant of ["info", "success", "warning", "danger"] as const) {
      const { root } = await render(<idg-alert variant={variant}>Text</idg-alert>);
      expect(root.shadowRoot?.querySelector("[aria-live]")).toBeNull();
      expect(root.hasAttribute("role")).toBe(false);
    }
  });
});

describe("idg-alert dismissing", () => {
  it("has no dismiss button unless it is dismissible", async () => {
    const { root } = await render(<idg-alert>Text</idg-alert>);
    expect(dismissButton(root)).toBeNull();
  });

  it("has a named dismiss button that is a real button", async () => {
    const { root } = await render(<idg-alert dismissible>Text</idg-alert>);
    const button = dismissButton(root);
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.getAttribute("aria-label")).toBe("Dismiss");
    expect(button?.querySelector("idg-icon")?.getAttribute("name")).toBe("close");
  });

  it("names the button with the text it is given", async () => {
    const { root } = await render(
      <idg-alert dismissible dismiss-label="Close this message">
        Text
      </idg-alert>,
    );
    expect(dismissButton(root)?.getAttribute("aria-label")).toBe("Close this message");
  });

  it("emits idgDismiss and then hides itself", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-alert dismissible>Text</idg-alert>,
    );
    const onDismiss = spyOnEvent("idgDismiss");
    dismissButton(root)?.click();
    await waitForChanges();
    expect(onDismiss).toHaveReceivedEventTimes(1);
    expect(root.hasAttribute("hidden")).toBe(true);
  });

  it("stays when the listener prevents the default", async () => {
    const { root, waitForChanges } = await render(<idg-alert dismissible>Text</idg-alert>);
    root.addEventListener("idgDismiss", (event) => {
      event.preventDefault();
    });
    dismissButton(root)?.click();
    await waitForChanges();
    expect(root.hasAttribute("hidden")).toBe(false);
  });
});
