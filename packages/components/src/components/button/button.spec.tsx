import { describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import "./button";

function control(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="control"]');
  if (!element) throw new Error("idg-button rendered no control part");
  return element;
}

describe("idg-button rendering", () => {
  it("renders a native button with defaults", async () => {
    const { root } = await render(<idg-button>Save</idg-button>);
    const native = control(root);
    expect(native.tagName).toBe("BUTTON");
    expect(native.getAttribute("type")).toBe("button");
    expect(native.classList.contains("variant-primary")).toBe(true);
    expect(native.classList.contains("size-md")).toBe(true);
  });

  it.each(["primary", "secondary", "ghost", "danger"] as const)(
    "applies variant %s",
    async (variant) => {
      const { root } = await render(<idg-button variant={variant}>Save</idg-button>);
      expect(control(root).classList.contains(`variant-${variant}`)).toBe(true);
      expect(root.getAttribute("variant")).toBe(variant);
    },
  );

  it.each(["sm", "md", "lg"] as const)("applies size %s", async (size) => {
    const { root } = await render(<idg-button size={size}>Save</idg-button>);
    expect(control(root).classList.contains(`size-${size}`)).toBe(true);
  });

  it("falls back to the defaults for values it does not know", async () => {
    const { root } = await render(
      <idg-button variant={"loud" as "primary"} size={"huge" as "md"} type={"link" as "button"}>
        Save
      </idg-button>,
    );
    const native = control(root);
    expect(native.classList.contains("variant-primary")).toBe(true);
    expect(native.classList.contains("size-md")).toBe(true);
    expect(native.getAttribute("type")).toBe("button");
  });

  it.each(["button", "submit", "reset"] as const)("sets the native type %s", async (type) => {
    const { root } = await render(<idg-button type={type}>Go</idg-button>);
    expect(control(root).getAttribute("type")).toBe(type);
  });
});

describe("idg-button slots and parts", () => {
  it("exposes control, label and spinner parts and the three slots", async () => {
    const { root } = await render(
      <idg-button loading>
        <span slot="start">S</span>
        Save
        <span slot="end">E</span>
      </idg-button>,
    );
    const shadow = root.shadowRoot;
    expect(shadow?.querySelector('[part="control"]')).not.toBeNull();
    expect(shadow?.querySelector('[part="label"] slot:not([name])')).not.toBeNull();
    expect(shadow?.querySelector('[part="spinner"]')).not.toBeNull();
    expect(shadow?.querySelector('slot[name="end"]')).not.toBeNull();
  });

  it("offers the start slot when not loading, and the spinner instead when loading", async () => {
    const idle = await render(<idg-button>Save</idg-button>);
    expect(idle.root.shadowRoot?.querySelector('slot[name="start"]')).not.toBeNull();
    expect(idle.root.shadowRoot?.querySelector('[part="spinner"]')).toBeNull();

    const busy = await render(<idg-button loading>Save</idg-button>);
    expect(busy.root.shadowRoot?.querySelector('slot[name="start"]')).toBeNull();
  });

  it("shows a shortcut hint, hidden from assistive technology, and announces it as a key shortcut", async () => {
    const { root } = await render(<idg-button shortcut="Enter">Save</idg-button>);
    const hint = root.shadowRoot?.querySelector("kbd");
    expect(hint?.textContent).toBe("Enter");
    expect(hint?.getAttribute("aria-hidden")).toBe("true");
    expect(control(root).getAttribute("aria-keyshortcuts")).toBe("Enter");
  });

  it("renders no shortcut hint without a shortcut", async () => {
    const { root } = await render(<idg-button>Save</idg-button>);
    expect(root.shadowRoot?.querySelector("kbd")).toBeNull();
    expect(control(root).hasAttribute("aria-keyshortcuts")).toBe(false);
  });

  it("reflects full-width on the host", async () => {
    const { root } = await render(<idg-button full-width>Save</idg-button>);
    expect(root.hasAttribute("full-width")).toBe(true);
  });
});

describe("idg-button disabled", () => {
  it("disables the native button", async () => {
    const { root } = await render(<idg-button disabled>Save</idg-button>);
    expect(control(root).hasAttribute("disabled")).toBe(true);
  });

  it("does not deliver clicks", async () => {
    const { root } = await render(<idg-button disabled>Save</idg-button>);
    const onClick = vi.fn();
    root.addEventListener("click", onClick);
    control(root).click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("delivers clicks when enabled", async () => {
    const { root } = await render(<idg-button>Save</idg-button>);
    const onClick = vi.fn();
    root.addEventListener("click", onClick);
    control(root).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("idg-button loading", () => {
  it("marks the control busy and unavailable without removing it from the tab order", async () => {
    const { root } = await render(<idg-button loading>Save</idg-button>);
    const native = control(root);
    expect(native.getAttribute("aria-busy")).toBe("true");
    expect(native.getAttribute("aria-disabled")).toBe("true");
    expect(native.hasAttribute("disabled")).toBe(false);
  });

  it("renders a spinner that assistive technology skips", async () => {
    const { root } = await render(<idg-button loading>Save</idg-button>);
    expect(root.shadowRoot?.querySelector('[part="spinner"]')?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("is not busy when idle", async () => {
    const { root } = await render(<idg-button>Save</idg-button>);
    expect(control(root).hasAttribute("aria-busy")).toBe(false);
    expect(control(root).hasAttribute("aria-disabled")).toBe(false);
  });

  it("does not deliver clicks", async () => {
    const { root } = await render(<idg-button loading>Save</idg-button>);
    const onClick = vi.fn();
    root.addEventListener("click", onClick);
    control(root).click();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("idg-button as a link", () => {
  it("renders an anchor with the url", async () => {
    const { root } = await render(<idg-button href="https://example.com/a">Docs</idg-button>);
    const native = control(root);
    expect(native.tagName).toBe("A");
    expect(native.getAttribute("href")).toBe("https://example.com/a");
    expect(root.shadowRoot?.querySelector("button")).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    " javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:x",
    "java\tscript:alert(1)",
  ])("drops the unsafe href %j and renders an inert link", async (href) => {
    const { root } = await render(<idg-button href={href}>Docs</idg-button>);
    const native = control(root);
    expect(native.tagName).toBe("A");
    expect(native.hasAttribute("href")).toBe(false);
    expect(native.getAttribute("role")).toBe("link");
    expect(native.getAttribute("aria-disabled")).toBe("true");
  });

  it("keeps relative and fragment urls", async () => {
    const relative = await render(<idg-button href="/docs">Docs</idg-button>);
    expect(control(relative.root).getAttribute("href")).toBe("/docs");
    const fragment = await render(<idg-button href="#top">Docs</idg-button>);
    expect(control(fragment.root).getAttribute("href")).toBe("#top");
  });

  it("hardens rel whenever the link opens a new browsing context", async () => {
    const { root } = await render(
      <idg-button href="https://example.com" target="_blank">
        Docs
      </idg-button>,
    );
    const native = control(root);
    expect(native.getAttribute("target")).toBe("_blank");
    expect(native.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("hardens a rel that tries to weaken it, and keeps the author's other tokens", async () => {
    const { root } = await render(
      <idg-button href="https://example.com" target="_blank" rel="nofollow">
        Docs
      </idg-button>,
    );
    expect(control(root).getAttribute("rel")?.split(" ").sort()).toEqual([
      "nofollow",
      "noopener",
      "noreferrer",
    ]);
  });

  it("hardens a named target too", async () => {
    const { root } = await render(
      <idg-button href="https://example.com" target="elsewhere">
        Docs
      </idg-button>,
    );
    expect(control(root).getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("leaves rel alone for same-context targets", async () => {
    const none = await render(<idg-button href="/a">Docs</idg-button>);
    expect(control(none.root).hasAttribute("rel")).toBe(false);
    const self = await render(
      <idg-button href="/a" target="_self" rel="author">
        Docs
      </idg-button>,
    );
    expect(control(self.root).getAttribute("rel")).toBe("author");
  });

  it("renders a disabled link without an href, marked unavailable", async () => {
    const { root } = await render(
      <idg-button href="https://example.com" disabled>
        Docs
      </idg-button>,
    );
    const native = control(root);
    expect(native.hasAttribute("href")).toBe(false);
    expect(native.getAttribute("aria-disabled")).toBe("true");
  });

  it("renders a loading link without an href, marked busy", async () => {
    const { root } = await render(
      <idg-button href="https://example.com" loading>
        Docs
      </idg-button>,
    );
    const native = control(root);
    expect(native.hasAttribute("href")).toBe(false);
    expect(native.getAttribute("aria-busy")).toBe("true");
  });

  it("ignores the form type", async () => {
    const { root } = await render(
      <idg-button href="/a" type="submit">
        Docs
      </idg-button>,
    );
    expect(control(root).hasAttribute("type")).toBe(false);
  });
});

describe("idg-button in a form", () => {
  function fakeForm() {
    return { requestSubmit: vi.fn(), reset: vi.fn() };
  }

  // Stencil's mock document cannot associate a custom element with a form, so the form the
  // element internals report is stubbed. Real association is exercised in the browser.
  async function renderInForm(button: ReturnType<typeof h>) {
    const form = fakeForm();
    const prototype = Object.getPrototypeOf(
      Object.getPrototypeOf(document.createElement("div")),
    ) as object;
    const attachInternals = Reflect.get(prototype, "attachInternals") as (this: object) => object;
    const spy = vi.spyOn(
      prototype as { attachInternals: typeof attachInternals },
      "attachInternals",
    );
    spy.mockImplementation(function (this: object) {
      return { ...attachInternals.call(this), form };
    });
    try {
      const rendered = await render(button);
      return { ...rendered, form };
    } finally {
      spy.mockRestore();
    }
  }

  it("submits the form on click", async () => {
    const { root, form } = await renderInForm(<idg-button type="submit">Go</idg-button>);
    control(root).click();
    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
    expect(form.reset).not.toHaveBeenCalled();
  });

  it("resets the form on click", async () => {
    const { root, form } = await renderInForm(<idg-button type="reset">Go</idg-button>);
    control(root).click();
    expect(form.reset).toHaveBeenCalledTimes(1);
    expect(form.requestSubmit).not.toHaveBeenCalled();
  });

  it("does nothing for type button", async () => {
    const { root, form } = await renderInForm(<idg-button>Go</idg-button>);
    control(root).click();
    expect(form.requestSubmit).not.toHaveBeenCalled();
    expect(form.reset).not.toHaveBeenCalled();
  });

  it.each([
    [
      "disabled",
      <idg-button type="submit" disabled>
        Go
      </idg-button>,
    ],
    [
      "loading",
      <idg-button type="submit" loading>
        Go
      </idg-button>,
    ],
  ])("does not submit while %s", async (_state, button) => {
    const { root, form } = await renderInForm(button);
    control(root).click();
    expect(form.requestSubmit).not.toHaveBeenCalled();
  });

  it("does not reset while disabled or loading", async () => {
    const disabled = await renderInForm(
      <idg-button type="reset" disabled>
        Go
      </idg-button>,
    );
    control(disabled.root).click();
    const loading = await renderInForm(
      <idg-button type="reset" loading>
        Go
      </idg-button>,
    );
    control(loading.root).click();
    expect(disabled.form.reset).not.toHaveBeenCalled();
    expect(loading.form.reset).not.toHaveBeenCalled();
  });

  it("does nothing outside a form", async () => {
    const { root } = await render(<idg-button type="submit">Go</idg-button>);
    expect(() => {
      control(root).click();
    }).not.toThrow();
  });
});

describe("idg-button as an overlay trigger", () => {
  it("exposes the expanded state and popup type it is given", async () => {
    const { root } = await render(
      <idg-button accessibleExpanded={false} accessibleHaspopup="menu">
        Actions
      </idg-button>,
    );
    expect(control(root).getAttribute("aria-expanded")).toBe("false");
    expect(control(root).getAttribute("aria-haspopup")).toBe("menu");
  });

  it("says nothing about expansion when it opens nothing", async () => {
    const { root } = await render(<idg-button>Save</idg-button>);
    expect(control(root).hasAttribute("aria-expanded")).toBe(false);
    expect(control(root).hasAttribute("aria-haspopup")).toBe(false);
  });

  it("follows a change of the expanded state", async () => {
    const { root, waitForChanges } = await render(
      <idg-button accessibleExpanded={false}>Actions</idg-button>,
    );
    (root as HTMLElement & { accessibleExpanded: boolean }).accessibleExpanded = true;
    await waitForChanges();
    expect(control(root).getAttribute("aria-expanded")).toBe("true");
  });

  it("describes the control with text kept in its own root", async () => {
    const { root } = await render(
      <idg-button accessibleDescription="Copies the link">Copy</idg-button>,
    );
    const id = control(root).getAttribute("aria-describedby") ?? "";
    const description = root.shadowRoot?.getElementById(id);
    expect(description?.textContent).toBe("Copies the link");
    expect(description?.classList.contains("visually-hidden")).toBe(true);
  });

  it("has no description without one", async () => {
    const { root } = await render(<idg-button>Copy</idg-button>);
    expect(control(root).hasAttribute("aria-describedby")).toBe(false);
  });
});
