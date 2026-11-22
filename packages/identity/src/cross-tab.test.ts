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

describe("createCrossTab", () => {
  it("tells other tabs about a sign-out, carrying nothing but the notice", async () => {
    const received: unknown[] = [];
    const spy = track(new BroadcastChannel("identgineer-test-a"));
    spy.onmessage = (event: MessageEvent) => received.push(event.data);
    const tab = track(createCrossTab("identgineer-test-a", () => undefined));
    tab.announceSignedOut();
    await nextTask();
    expect(received).toEqual([{ type: "signed-out" }]);
  });

  it("calls back when another tab signs out, not for its own notice", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const one = track(createCrossTab("identgineer-test-b", first));
    track(createCrossTab("identgineer-test-b", second));
    one.announceSignedOut();
    await nextTask();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it.each([
    "signed-out",
    { type: "signed-in" },
    { type: "signed-out", token: "x" },
    null,
    ["signed-out"],
  ])("ignores the message %j", async (message) => {
    const onSignedOut = vi.fn();
    track(createCrossTab("identgineer-test-c", onSignedOut));
    const sender = track(new BroadcastChannel("identgineer-test-c"));
    sender.postMessage(message);
    await nextTask();
    expect(onSignedOut).not.toHaveBeenCalled();
  });

  it("does nothing where BroadcastChannel is missing", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const tab = createCrossTab("identgineer-test-d", () => undefined);
    expect(() => {
      tab.announceSignedOut();
      tab.close();
    }).not.toThrow();
  });

  it("stops listening once closed", async () => {
    const onSignedOut = vi.fn();
    const tab = createCrossTab("identgineer-test-e", onSignedOut);
    tab.close();
    const sender = track(new BroadcastChannel("identgineer-test-e"));
    sender.postMessage({ type: "signed-out" });
    await nextTask();
    expect(onSignedOut).not.toHaveBeenCalled();
  });
});
