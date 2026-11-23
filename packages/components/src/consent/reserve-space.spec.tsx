import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubResizeObserver } from "../testing/resize-observer";
import { ReserveSpace } from "./reserve-space";

let observers: ReturnType<typeof stubResizeObserver>;

beforeEach(() => {
  observers = stubResizeObserver();
});

afterEach(() => {
  observers.restore();
  document.documentElement.style.removeProperty("scroll-padding-block-end");
  document.documentElement.style.removeProperty("scroll-padding-block-start");
});

function bar(height: number): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({ height }) as DOMRect;
  document.body.append(element);
  return element;
}

const padding = (side: "end" | "start") =>
  document.documentElement.style.getPropertyValue(`scroll-padding-block-${side}`);

describe("ReserveSpace", () => {
  it("keeps the root's scroll padding as tall as the bar, so focus is scrolled clear of it", () => {
    const reserve = new ReserveSpace();
    reserve.start(bar(72));
    expect(padding("end")).toBe("72px");
  });

  it("follows the bar's size", () => {
    const element = bar(40);
    const reserve = new ReserveSpace();
    reserve.start(element);
    expect(padding("end")).toBe("40px");
    element.getBoundingClientRect = () => ({ height: 90 }) as DOMRect;
    observers.notify();
    expect(padding("end")).toBe("90px");
  });

  it("adds to an inline value the page set, and does not add the bar to itself again", () => {
    document.documentElement.style.setProperty("scroll-padding-block-end", "5px");
    const element = bar(40);
    const reserve = new ReserveSpace();
    reserve.start(element);
    expect(padding("end")).toBe("calc(5px + 40px)");
    element.getBoundingClientRect = () => ({ height: 90 }) as DOMRect;
    observers.notify();
    expect(padding("end")).toBe("calc(5px + 90px)");
    window.dispatchEvent(new Event("resize"));
    expect(padding("end")).toBe("calc(5px + 90px)");
  });

  it("works out the padding again when the window is resized", () => {
    const element = bar(40);
    const reserve = new ReserveSpace();
    reserve.start(element);
    element.getBoundingClientRect = () => ({ height: 66 }) as DOMRect;
    window.dispatchEvent(new Event("resize"));
    expect(padding("end")).toBe("66px");
    reserve.stop();
    element.getBoundingClientRect = () => ({ height: 10 }) as DOMRect;
    window.dispatchEvent(new Event("resize"));
    expect(padding("end")).toBe("");
  });

  it("gives back the padding the page had when it stops", () => {
    document.documentElement.style.setProperty("scroll-padding-block-end", "5px");
    const reserve = new ReserveSpace();
    reserve.start(bar(72));
    reserve.stop();
    expect(padding("end")).toBe("5px");
    document.documentElement.style.removeProperty("scroll-padding-block-end");
    reserve.start(bar(72));
    reserve.stop();
    expect(padding("end")).toBe("");
  });

  it("stops observing, and a second stop does nothing", () => {
    const reserve = new ReserveSpace();
    reserve.start(bar(72));
    reserve.stop();
    expect(observers.observers.every((observer) => !observer.observing)).toBe(true);
    expect(() => {
      reserve.stop();
    }).not.toThrow();
  });
});
