import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMutationObserver } from "../../testing/mutation-observer";
import { restoreViewport, takeViewport, watchLayoutAttribute } from "./layout-switch";

let observer: ReturnType<typeof stubMutationObserver>;

beforeEach(() => {
  observer = stubMutationObserver();
});

afterEach(() => {
  observer.restore();
});

function chain() {
  const root = document.createElement("div");
  const middle = document.createElement("section");
  const host = document.createElement("div");
  root.append(middle);
  middle.append(host);
  return { root, middle, host };
}

describe("watchLayoutAttribute", () => {
  it("watches data-layout on the host and on every ancestor, and nothing else", () => {
    const { root, middle, host } = chain();
    watchLayoutAttribute(host, () => undefined);
    const watched = observer.observers.filter((item) => item.observing);
    expect(watched.map((item) => item.target)).toEqual([host, middle, root]);
    for (const item of watched) {
      expect(item.options).toEqual({ attributes: true, attributeFilter: ["data-layout"] });
    }
  });

  it("calls back when the layout changes", () => {
    const { host } = chain();
    const onChange = vi.fn();
    watchLayoutAttribute(host, onChange);
    observer.notify([{ type: "attributes", target: host }]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stops watching", () => {
    const { host } = chain();
    const stop = watchLayoutAttribute(host, () => undefined);
    stop();
    expect(observer.observers.some((item) => item.observing)).toBe(false);
  });
});

describe("takeViewport and restoreViewport", () => {
  it("remembers where the page is scrolled and what has focus", () => {
    const button = document.createElement("button");
    const view = { scrollX: 3, scrollY: 420, scrollTo: vi.fn() } as unknown as Window;
    const taken = takeViewport(view, () => button);
    expect(taken).toEqual({ x: 3, y: 420, focused: button });
  });

  it("scrolls back only when the page has moved", () => {
    const scrollTo = vi.fn();
    const view = { scrollX: 0, scrollY: 100, scrollTo } as unknown as Window;
    restoreViewport(view, { x: 0, y: 100, focused: null });
    expect(scrollTo).not.toHaveBeenCalled();
    restoreViewport(view, { x: 0, y: 420, focused: null });
    expect(scrollTo).toHaveBeenCalledWith({ left: 0, top: 420, behavior: "instant" });
  });
});
