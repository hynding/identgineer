import { beforeEach, describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import { stubMutationObserver } from "../../testing/mutation-observer";
import { installSlotAssignment } from "../../testing/slot-assignment";
import "./tab-panel";

beforeEach(() => {
  installSlotAssignment();
});

describe("idg-tab-panel", () => {
  it("is a tab panel, shown only when it is selected", async () => {
    const shown = await render(
      <idg-tab-panel value="a" selected>
        A
      </idg-tab-panel>,
    );
    expect(shown.root.getAttribute("role")).toBe("tabpanel");
    expect(shown.root.hasAttribute("hidden")).toBe(false);
    const hidden = await render(<idg-tab-panel value="b">B</idg-tab-panel>);
    expect(hidden.root.hasAttribute("hidden")).toBe(true);
  });

  it("is a tab stop when it holds nothing the keyboard can reach", async () => {
    const { root } = await render(
      <idg-tab-panel value="a" selected>
        Plain text
      </idg-tab-panel>,
    );
    expect(root.getAttribute("tabindex")).toBe("0");
  });

  it("is not a tab stop when it holds something the keyboard can reach", async () => {
    const { root } = await render(
      <idg-tab-panel value="a" selected>
        <p>
          <a href="/x" tabindex="0">
            A link
          </a>
        </p>
      </idg-tab-panel>,
    );
    expect(root.hasAttribute("tabindex")).toBe(false);
  });

  it("is not a tab stop while hidden", async () => {
    const { root } = await render(<idg-tab-panel value="a">A</idg-tab-panel>);
    expect(root.hasAttribute("tabindex")).toBe(false);
  });

  it("becomes a tab stop when its content is emptied of focusable things, and stops when one is added", async () => {
    const watcher = stubMutationObserver();
    const { root, waitForChanges } = await render(
      <idg-tab-panel value="a" selected>
        Plain text
      </idg-tab-panel>,
    );
    expect(root.getAttribute("tabindex")).toBe("0");
    const button = document.createElement("button");
    button.setAttribute("tabindex", "0");
    root.append(button);
    watcher.notify([{ type: "childList", target: root }]);
    await waitForChanges();
    expect(root.hasAttribute("tabindex")).toBe(false);
    button.remove();
    watcher.notify([{ type: "childList", target: root }]);
    await waitForChanges();
    expect(root.getAttribute("tabindex")).toBe("0");
    watcher.restore();
  });

  it("looks again when the content is slotted again", async () => {
    const { root, waitForChanges } = await render(
      <idg-tab-panel value="a" selected>
        Plain text
      </idg-tab-panel>,
    );
    const button = document.createElement("button");
    button.setAttribute("tabindex", "0");
    root.append(button);
    root.shadowRoot?.querySelector("slot")?.dispatchEvent(new Event("slotchange"));
    await waitForChanges();
    expect(root.hasAttribute("tabindex")).toBe(false);
  });
});
