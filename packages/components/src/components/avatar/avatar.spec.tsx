import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./avatar";

function avatar(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="avatar"]');
  if (!element) throw new Error("idg-avatar rendered no avatar part");
  return element;
}

function image(root: HTMLElement): HTMLImageElement | null {
  return root.shadowRoot?.querySelector<HTMLImageElement>("img") ?? null;
}

describe("idg-avatar with a picture", () => {
  it("renders the image with its alternative text", async () => {
    const { root } = await render(
      <idg-avatar src="https://example.com/ada.png" alt="Ada at her desk" name="Ada Lovelace" />,
    );
    const picture = image(root);
    expect(picture?.getAttribute("src")).toBe("https://example.com/ada.png");
    expect(picture?.getAttribute("alt")).toBe("Ada at her desk");
    expect(picture?.getAttribute("part")).toBe("image");
  });

  it("names the image after the person when there is no alt", async () => {
    const { root } = await render(<idg-avatar src="/ada.png" name="Ada Lovelace" />);
    expect(image(root)?.getAttribute("alt")).toBe("Ada Lovelace");
  });

  it("treats an empty alt as decoration, for an avatar beside the person's name in text", async () => {
    const { root } = await render(<idg-avatar src="/ada.png" name="Ada Lovelace" alt="" />);
    expect(image(root)?.getAttribute("alt")).toBe("");
  });

  it("does not send the page as a referrer and loads lazily", async () => {
    const { root } = await render(<idg-avatar src="https://example.com/ada.png" name="Ada" />);
    expect(image(root)?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(image(root)?.getAttribute("loading")).toBe("lazy");
    expect(image(root)?.getAttribute("decoding")).toBe("async");
  });

  it.each(["/a.png", "a/b.png", "http://example.com/a.png", "https://example.com/a.png"])(
    "loads %s",
    async (src) => {
      const { root } = await render(<idg-avatar src={src} name="Ada" />);
      expect(image(root)?.getAttribute("src")).toBe(src);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "data:image/png;base64,AAAA",
    "blob:https://example.com/x",
    "mailto:ada@example.com",
    " https://example.com/a.png",
  ])("never loads %j and shows the initials instead", async (src) => {
    const { root } = await render(<idg-avatar src={src} name="Ada Lovelace" />);
    expect(image(root)).toBeNull();
    expect(root.shadowRoot?.querySelector(".initials")?.textContent).toBe("AL");
  });

  it("falls back to the initials when the image fails to load", async () => {
    const { root, waitForChanges } = await render(
      <idg-avatar src="/missing.png" name="Ada Lovelace" />,
    );
    image(root)?.dispatchEvent(new Event("error"));
    await waitForChanges();
    expect(image(root)).toBeNull();
    expect(root.shadowRoot?.querySelector(".initials")?.textContent).toBe("AL");
  });

  it("tries again when the source changes after a failure", async () => {
    const { root, waitForChanges, setProps } = await render(
      <idg-avatar src="/missing.png" name="Ada Lovelace" />,
    );
    image(root)?.dispatchEvent(new Event("error"));
    await waitForChanges();
    await setProps({ src: "/found.png" });
    expect(image(root)?.getAttribute("src")).toBe("/found.png");
  });
});

describe("idg-avatar without a picture", () => {
  it("shows the initials and names the avatar after the person", async () => {
    const { root } = await render(<idg-avatar name="Ada Lovelace" />);
    const element = avatar(root);
    expect(element.getAttribute("role")).toBe("img");
    expect(element.getAttribute("aria-label")).toBe("Ada Lovelace");
    const text = root.shadowRoot?.querySelector(".initials");
    expect(text?.textContent).toBe("AL");
    expect(text?.getAttribute("aria-hidden")).toBe("true");
  });

  it("uses the alt as the name when there is one", async () => {
    const { root } = await render(<idg-avatar name="Ada Lovelace" alt="Ada, administrator" />);
    expect(avatar(root).getAttribute("aria-label")).toBe("Ada, administrator");
  });

  it("is hidden from assistive technology with an empty alt", async () => {
    const { root } = await render(<idg-avatar name="Ada Lovelace" alt="" />);
    const element = avatar(root);
    expect(element.getAttribute("aria-hidden")).toBe("true");
    expect(element.hasAttribute("role")).toBe(false);
    expect(element.hasAttribute("aria-label")).toBe(false);
  });

  it("shows a person icon when there is no name to take letters from", async () => {
    const { root } = await render(<idg-avatar />);
    expect(root.shadowRoot?.querySelector(".initials")).toBeNull();
    expect(root.shadowRoot?.querySelector("idg-icon")?.getAttribute("name")).toBe("user");
    expect(avatar(root).getAttribute("aria-hidden")).toBe("true");
  });

  it("still names an unnamed avatar that was given an alt", async () => {
    const { root } = await render(<idg-avatar alt="Guest" />);
    expect(avatar(root).getAttribute("aria-label")).toBe("Guest");
  });

  it("chooses the same colour for the same name, with no inline style", async () => {
    const first = await render(<idg-avatar name="Grace Hopper" />);
    const second = await render(<idg-avatar name="  grace hopper" />);
    const tone = (root: HTMLElement) =>
      avatar(root)
        .className.split(" ")
        .find((name) => name.startsWith("tone-"));
    expect(tone(first.root)).toMatch(/^tone-[0-5]$/);
    expect(tone(first.root)).toBe(tone(second.root));
    expect(avatar(first.root).hasAttribute("style")).toBe(false);
  });
});

describe("idg-avatar size and status", () => {
  it.each(["xs", "sm", "md", "lg", "xl"] as const)("applies size %s", async (size) => {
    const { root } = await render(<idg-avatar name="Ada" size={size} />);
    expect(avatar(root).classList.contains(`size-${size}`)).toBe(true);
    expect(root.getAttribute("size")).toBe(size);
  });

  it("falls back to the medium size for a value it does not know", async () => {
    const { root } = await render(<idg-avatar name="Ada" size={"huge" as "md"} />);
    expect(avatar(root).classList.contains("size-md")).toBe(true);
  });

  it.each([
    ["online", "Online"],
    ["away", "Away"],
    ["busy", "Busy"],
    ["offline", "Offline"],
  ] as const)("shows the %s status as a named image, not a colour alone", async (status, label) => {
    const { root } = await render(<idg-avatar name="Ada" status={status} />);
    const dot = root.shadowRoot?.querySelector('[part="status"]');
    expect(dot?.classList.contains(`status-${status}`)).toBe(true);
    expect(dot?.getAttribute("role")).toBe("img");
    expect(dot?.getAttribute("aria-label")).toBe(label);
  });

  it("names the status with the text it is given", async () => {
    const { root } = await render(
      <idg-avatar name="Ada" status="busy" status-label="In a meeting" />,
    );
    expect(root.shadowRoot?.querySelector('[part="status"]')?.getAttribute("aria-label")).toBe(
      "In a meeting",
    );
  });

  it("shows no status unless it is a known one", async () => {
    const none = await render(<idg-avatar name="Ada" />);
    expect(none.root.shadowRoot?.querySelector('[part="status"]')).toBeNull();
    const unknown = await render(<idg-avatar name="Ada" status={"dnd" as "busy"} />);
    expect(unknown.root.shadowRoot?.querySelector('[part="status"]')).toBeNull();
  });
});
