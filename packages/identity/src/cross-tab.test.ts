import { afterEach, describe, expect, it, vi } from "vitest";
import { createCrossTab } from "./cross-tab.ts";

const opened: { close: () => void }[] = [];
const track = <T extends { close: () => void }>(value: T): T => {
  opened.push(value);
  return value;
};

afterEach(() => {
  for (const item of opened.splice(0)) item.close();
  vi.unstubAllGlobals();
});

const nextTask = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

const handlers = () => ({ onSignedOut: vi.fn(), onSignedIn: vi.fn() });

describe("createCrossTab", () => {
  it("tells other tabs about a sign-out or sign-in, carrying nothing but the notice", async () => {
    const received: unknown[] = [];
    const spy = track(new BroadcastChannel("identgineer-test-a"));
    spy.onmessage = (event: MessageEvent) => received.push(event.data);
    const tab = track(createCrossTab("identgineer-test-a", handlers()));
    tab.announce("signed-out");
    tab.announce("signed-in");
    await nextTask();
    expect(received).toEqual([{ type: "signed-out" }, { type: "signed-in" }]);
  });

  it("calls back when another tab signs out or in, not for its own notices", async () => {
    const first = handlers();
    const second = handlers();
    const one = track(createCrossTab("identgineer-test-b", first));
    track(createCrossTab("identgineer-test-b", second));
    one.announce("signed-out");
    one.announce("signed-in");
    await nextTask();
    expect(first.onSignedOut).not.toHaveBeenCalled();
    expect(first.onSignedIn).not.toHaveBeenCalled();
    expect(second.onSignedOut).toHaveBeenCalledTimes(1);
    expect(second.onSignedIn).toHaveBeenCalledTimes(1);
  });

  it.each([
    "signed-out",
    { type: "signed-up" },
    { type: "signed-out", token: "x" },
    { type: "signed-in", user: { id: 1 } },
    null,
    ["signed-out"],
  ])("ignores the message %j", async (message) => {
    const tab = handlers();
    track(createCrossTab("identgineer-test-c", tab));
    const sender = track(new BroadcastChannel("identgineer-test-c"));
    sender.postMessage(message);
    await nextTask();
    expect(tab.onSignedOut).not.toHaveBeenCalled();
    expect(tab.onSignedIn).not.toHaveBeenCalled();
  });

  it("does nothing where BroadcastChannel is missing", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const tab = createCrossTab("identgineer-test-d", handlers());
    expect(() => {
      tab.announce("signed-out");
      tab.close();
    }).not.toThrow();
  });

  it("stops listening once closed, and announcing afterwards does not throw", async () => {
    const tab = handlers();
    const crossTab = createCrossTab("identgineer-test-e", tab);
    crossTab.close();
    expect(() => {
      crossTab.announce("signed-out");
    }).not.toThrow();
    const sender = track(new BroadcastChannel("identgineer-test-e"));
    sender.postMessage({ type: "signed-out" });
    await nextTask();
    expect(tab.onSignedOut).not.toHaveBeenCalled();
  });
});
