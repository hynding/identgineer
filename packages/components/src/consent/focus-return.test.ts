import { afterEach, describe, expect, it, vi } from "vitest";
import { returnFocus } from "./focus-return";

function page(markup: { main?: boolean } = {}) {
  const target = document.createElement("button");
  const main = document.createElement("main");
  document.body.append(target);
  if (markup.main === true) document.body.append(main);
  return { target, main };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("returnFocus", () => {
  it("focuses the element that had focus before, when it is still on the page", () => {
    const { target } = page({ main: true });
    const focus = vi.spyOn(target, "focus");
    expect(returnFocus(target, document)).toBe("previous");
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("goes to the main landmark when that element is gone, and leaves no tabindex behind", () => {
    const { target, main } = page({ main: true });
    target.remove();
    const focus = vi.spyOn(main, "focus").mockImplementation(() => {
      expect(main.getAttribute("tabindex")).toBe("-1");
    });
    expect(returnFocus(target, document)).toBe("main");
    expect(focus).toHaveBeenCalledTimes(1);
    main.dispatchEvent(new Event("blur"));
    expect(main.hasAttribute("tabindex")).toBe(false);
  });

  it("keeps a tabindex the landmark already had", () => {
    const { main } = page({ main: true });
    main.setAttribute("tabindex", "0");
    vi.spyOn(main, "focus").mockImplementation(() => undefined);
    returnFocus(undefined, document);
    main.dispatchEvent(new Event("blur"));
    expect(main.getAttribute("tabindex")).toBe("0");
  });

  it("finds a landmark marked with role=main", () => {
    const target = document.createElement("div");
    target.setAttribute("role", "main");
    document.body.append(target);
    const focus = vi.spyOn(target, "focus").mockImplementation(() => undefined);
    expect(returnFocus(undefined, document)).toBe("main");
    expect(focus).toHaveBeenCalled();
  });

  it("leaves focus on the body when there is neither", () => {
    page();
    expect(returnFocus(undefined, document)).toBe("body");
  });

  it("never throws, whatever it was given", () => {
    expect(() => returnFocus({} as never, document)).not.toThrow();
  });
});
