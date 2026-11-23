import { describe, expect, it } from "vitest";
import { createFakePage } from "./fake-page.ts";

describe("createFakePage", () => {
  it("reads its location, referrer and signals", () => {
    const page = createFakePage({ href: "https://a.example/x", referrer: "https://b.example/y" });
    expect(page.location()).toBe("https://a.example/x");
    expect(page.referrer()).toBe("https://b.example/y");
    expect(page.signals()).toEqual({ onLine: true });
    page.setGpc(true);
    page.setDnt("1");
    expect(page.signals()).toEqual({ onLine: true, globalPrivacyControl: true, doNotTrack: "1" });
  });

  it("tells navigation listeners about a push, a replace and a pop with the new location in place", () => {
    const page = createFakePage({ href: "https://a.example/" });
    const seen: (string | undefined)[] = [];
    page.onNavigate(() => seen.push(page.location()));
    page.navigate("https://a.example/one");
    page.navigate("https://a.example/two", "replace");
    page.navigate("https://a.example/", "pop");
    expect(seen).toEqual(["https://a.example/one", "https://a.example/two", "https://a.example/"]);
  });

  it("tells listeners the page is hidden and that the connection came back", () => {
    const page = createFakePage();
    let hidden = 0;
    let online = 0;
    page.onHidden(() => hidden++);
    page.onOnline(() => online++);
    page.hide();
    page.goOffline();
    expect(page.signals().onLine).toBe(false);
    page.goOnline();
    expect(hidden).toBe(1);
    expect(online).toBe(1);
    expect(page.signals().onLine).toBe(true);
  });

  it("counts the listeners that are still subscribed", () => {
    const page = createFakePage();
    const stops = [
      page.onHidden(() => undefined),
      page.onOnline(() => undefined),
      page.onNavigate(() => undefined),
    ];
    expect(page.listenerCount()).toBe(3);
    for (const stop of stops) stop();
    expect(page.listenerCount()).toBe(0);
    page.hide();
  });
});
