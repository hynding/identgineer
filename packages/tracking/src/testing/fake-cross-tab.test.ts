import { describe, expect, it } from "vitest";
import { createCrossTabHub } from "./fake-cross-tab.ts";

describe("createCrossTabHub", () => {
  it("delivers a post to the other tabs and not to the poster", () => {
    const hub = createCrossTabHub();
    const a = hub.connect();
    const b = hub.connect();
    const heard: string[] = [];
    a.subscribe(() => heard.push("a"));
    b.subscribe(() => heard.push("b"));
    a.post({ type: "x" });
    expect(heard).toEqual(["b"]);
  });

  it("stops delivering to a tab that unsubscribed", () => {
    const hub = createCrossTabHub();
    const a = hub.connect();
    const b = hub.connect();
    let heard = 0;
    const stop = b.subscribe(() => heard++);
    stop();
    a.post({});
    expect(heard).toBe(0);
    expect(hub.listenerCount()).toBe(0);
  });

  it("holds posts back until told to deliver when it is manual", () => {
    const hub = createCrossTabHub({ manual: true });
    const a = hub.connect();
    const b = hub.connect();
    const heard: unknown[] = [];
    b.subscribe((message) => heard.push(message));
    a.post(1);
    a.post(2);
    expect(heard).toEqual([]);
    hub.deliver();
    expect(heard).toEqual([1, 2]);
  });
});
