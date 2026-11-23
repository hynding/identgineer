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
    reserve.start(bar(72), "end");
    expect(padding("end")).toBe("72px");
    expect(padding("start")).toBe("");
  });

  it("follows the bar's size and takes the start side for a bar at the top", () => {
    const element = bar(40);
    const reserve = new ReserveSpace();
    reserve.start(element, "start");
    expect(padding("start")).toBe("40px");
    element.getBoundingClientRect = () => ({ height: 90 }) as DOMRect;
    observers.notify();
    expect(padding("start")).toBe("90px");
  });

  it("gives back the padding the page had when it stops", () => {
    document.documentElement.style.setProperty("scroll-padding-block-end", "5px");
    const reserve = new ReserveSpace();
    reserve.start(bar(72), "end");
    reserve.stop();
    expect(padding("end")).toBe("5px");
    document.documentElement.style.removeProperty("scroll-padding-block-end");
    reserve.start(bar(72), "end");
    reserve.stop();
    expect(padding("end")).toBe("");
  });

  it("stops observing, and a second stop does nothing", () => {
    const reserve = new ReserveSpace();
    reserve.start(bar(72), "end");
    reserve.stop();
    expect(observers.observers.every((observer) => !observer.observing)).toBe(true);
    expect(() => {
      reserve.stop();
    }).not.toThrow();
  });

  it("moves to the new side when started again", () => {
    const reserve = new ReserveSpace();
    const element = bar(60);
    reserve.start(element, "end");
    reserve.start(element, "start");
    expect(padding("end")).toBe("");
    expect(padding("start")).toBe("60px");
  });
});
