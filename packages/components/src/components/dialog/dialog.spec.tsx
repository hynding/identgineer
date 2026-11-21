import { beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installDialogElement } from "../../testing/dialog-element";
import "./dialog";

interface DialogHost extends HTMLElement {
  open: boolean;
  show: () => Promise<void>;
  showModal: () => Promise<void>;
  close: (returnValue?: string) => Promise<void>;
}

let methods: ReturnType<typeof installDialogElement>;

beforeEach(() => {
  methods = installDialogElement();
});

function native(root: HTMLElement): HTMLDialogElement {
  const element = root.shadowRoot?.querySelector("dialog");
  if (!element) throw new Error("idg-dialog rendered no dialog");
  return element;
}

function closeButton(root: HTMLElement): HTMLButtonElement | null {
  return root.shadowRoot?.querySelector<HTMLButtonElement>('button[part="close"]') ?? null;
}

function nextClose(root: HTMLElement): Promise<CustomEvent> {
  return new Promise((resolve) => {
    root.addEventListener("idgClose", (event) => {
      resolve(event as CustomEvent);
    });
  });
}

describe("idg-dialog rendering", () => {
  it("renders a native dialog named by its heading", async () => {
    const { root } = await render(<idg-dialog heading="Delete project">Body</idg-dialog>);
    const dialog = native(root);
    const id = dialog.getAttribute("aria-labelledby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.textContent).toBe("Delete project");
    expect(dialog.getAttribute("part")).toBe("dialog");
    expect(dialog.hasAttribute("role")).toBe(false);
  });

  it("is named by the header slot when there is no heading", async () => {
    const { root } = await render(
      <idg-dialog>
        <span slot="header">Rich title</span>
        Body
      </idg-dialog>,
    );
    const id = native(root).getAttribute("aria-labelledby") ?? "";
    expect(
      root.shadowRoot?.getElementById(id)?.querySelector('slot[name="header"]'),
    ).not.toBeNull();
  });

  it("is an alertdialog described by its body when alert is set", async () => {
    const { root } = await render(
      <idg-dialog heading="Discard?" alert>
        Changes are lost.
      </idg-dialog>,
    );
    const dialog = native(root);
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    const id = dialog.getAttribute("aria-describedby") ?? "";
    expect(root.shadowRoot?.getElementById(id)?.querySelector("slot:not([name])")).not.toBeNull();
  });

  it.each(["sm", "md", "lg", "full"] as const)("applies size %s", async (size) => {
    const { root } = await render(<idg-dialog size={size}>Body</idg-dialog>);
    expect(native(root).classList.contains(`size-${size}`)).toBe(true);
  });

  it("falls back to md for a size it does not know", async () => {
    const { root } = await render(<idg-dialog size={"huge" as "md"}>Body</idg-dialog>);
    expect(native(root).classList.contains("size-md")).toBe(true);
  });

  it("has a named close button and answers close requests while dismissible", async () => {
    const { root } = await render(<idg-dialog closeLabel="Close settings">Body</idg-dialog>);
    expect(closeButton(root)?.getAttribute("aria-label")).toBe("Close settings");
    expect(closeButton(root)?.getAttribute("type")).toBe("button");
    expect(native(root).getAttribute("closedby")).toBe("closerequest");
  });

  it("has no close button and refuses close requests when not dismissible", async () => {
    const { root } = await render(<idg-dialog dismissible={false}>Body</idg-dialog>);
    expect(closeButton(root)).toBeNull();
    expect(native(root).getAttribute("closedby")).toBe("none");
  });

  it("renders the footer only when it has content", async () => {
    const bare = await render(<idg-dialog>Body</idg-dialog>);
    expect(bare.root.shadowRoot?.querySelector('[part="footer"]')).toBeNull();
    const withFooter = await render(
      <idg-dialog>
        Body
        <button slot="footer">OK</button>
      </idg-dialog>,
    );
    expect(withFooter.root.shadowRoot?.querySelector('[part="footer"] slot')).not.toBeNull();
  });
});

describe("idg-dialog opening", () => {
  it("opens as a modal by default when open is set", async () => {
    const { root } = await render(<idg-dialog open>Body</idg-dialog>);
    expect(methods.showModal).toHaveBeenCalledTimes(1);
    expect(native(root).open).toBe(true);
    expect(root.hasAttribute("open")).toBe(true);
  });

  it("opens without a modal when modal is false", async () => {
    await render(
      <idg-dialog open modal={false}>
        Body
      </idg-dialog>,
    );
    expect(methods.show).toHaveBeenCalledTimes(1);
    expect(methods.showModal).not.toHaveBeenCalled();
  });

  it("opens through its methods and reflects open", async () => {
    const { root, waitForChanges } = await render(<idg-dialog>Body</idg-dialog>);
    const opened = vi.fn();
    root.addEventListener("idgOpen", opened);
    await (root as DialogHost).showModal();
    await waitForChanges();
    expect(root.hasAttribute("open")).toBe(true);
    expect(opened).toHaveBeenCalledTimes(1);
    expect((opened.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ modal: true });
  });

  it("does nothing when opened twice", async () => {
    const { root } = await render(<idg-dialog open>Body</idg-dialog>);
    await (root as DialogHost).showModal();
    await (root as DialogHost).show();
    expect(methods.showModal).toHaveBeenCalledTimes(1);
    expect(methods.show).not.toHaveBeenCalled();
  });
});

describe("idg-dialog closing", () => {
  it("closes through the method with a return value", async () => {
    const { root, waitForChanges } = await render(<idg-dialog open>Body</idg-dialog>);
    const closed = nextClose(root);
    await (root as DialogHost).close("saved");
    expect((await closed).detail).toEqual({ returnValue: "saved", reason: "method" });
    await waitForChanges();
    expect(root.hasAttribute("open")).toBe(false);
  });

  it("closes when open is removed", async () => {
    const { root } = await render(<idg-dialog open>Body</idg-dialog>);
    const closed = nextClose(root);
    (root as DialogHost).open = false;
    expect((await closed).detail.reason).toBe("method");
  });

  it("asks before the close button closes it, with reason close-button", async () => {
    const { root } = await render(<idg-dialog open>Body</idg-dialog>);
    const cancel = vi.fn();
    root.addEventListener("idgCancel", cancel);
    const closed = nextClose(root);
    closeButton(root)?.click();
    expect((cancel.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ reason: "close-button" });
    expect((await closed).detail).toEqual({ returnValue: "", reason: "close-button" });
  });

  it("stays open when idgCancel is prevented", async () => {
    const { root } = await render(<idg-dialog open>Body</idg-dialog>);
    root.addEventListener("idgCancel", (event) => {
      event.preventDefault();
    });
    closeButton(root)?.click();
    expect(native(root).open).toBe(true);
  });

  it("turns a native cancel (Escape) into idgCancel and closes with reason escape", async () => {
    const { root } = await render(<idg-dialog open>Body</idg-dialog>);
    const closed = nextClose(root);
    const cancel = new Event("cancel", { cancelable: true });
    native(root).dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect((await closed).detail.reason).toBe("escape");
  });

  it("keeps the dialog open on a prevented Escape", async () => {
    const { root } = await render(<idg-dialog open>Body</idg-dialog>);
    root.addEventListener("idgCancel", (event) => {
      event.preventDefault();
    });
    native(root).dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(native(root).open).toBe(true);
  });

  it("refuses a native cancel when not dismissible, for browsers without closedby", async () => {
    const { root } = await render(
      <idg-dialog open dismissible={false}>
        Body
      </idg-dialog>,
    );
    const cancel = new Event("cancel", { cancelable: true });
    native(root).dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(native(root).open).toBe(true);
  });

  it("reports a close it did not start, such as a forced Escape, as escape", async () => {
    const { root } = await render(<idg-dialog open>Body</idg-dialog>);
    const closed = nextClose(root);
    native(root).removeAttribute("open");
    native(root).dispatchEvent(new Event("close"));
    expect((await closed).detail.reason).toBe("escape");
  });
});

describe("idg-dialog forms", () => {
  function submit(form: HTMLFormElement, submitter?: HTMLElement): Event {
    const event = new Event("submit", { bubbles: true, cancelable: true }) as Event & {
      submitter?: HTMLElement | null;
    };
    event.submitter = submitter ?? null;
    form.dispatchEvent(event);
    return event;
  }

  it("closes on a method=dialog form, with the submitter's value", async () => {
    const { root } = await render(
      <idg-dialog open>
        <form method="dialog">
          <button value="confirm">OK</button>
        </form>
      </idg-dialog>,
    );
    const closed = nextClose(root);
    const form = root.querySelector("form");
    if (!form) throw new Error("no form");
    const event = submit(form, form.querySelector("button") ?? undefined);
    expect(event.defaultPrevented).toBe(true);
    expect((await closed).detail).toEqual({ returnValue: "confirm", reason: "form" });
  });

  it("leaves other forms alone", async () => {
    const { root } = await render(
      <idg-dialog open>
        <form method="post">
          <button>Send</button>
        </form>
      </idg-dialog>,
    );
    const form = root.querySelector("form");
    if (!form) throw new Error("no form");
    expect(submit(form).defaultPrevented).toBe(false);
    expect(native(root).open).toBe(true);
  });

  it("leaves a form that belongs to a nested dialog to that dialog", async () => {
    const { root } = await render(
      <idg-dialog open id="outer">
        <idg-dialog id="inner">
          <form method="dialog">
            <button>OK</button>
          </form>
        </idg-dialog>
      </idg-dialog>,
    );
    const form = root.querySelector("form");
    if (!form) throw new Error("no form");
    submit(form);
    expect(native(root).open).toBe(true);
  });
});
