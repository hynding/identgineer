import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserPage } from "./browser-page.ts";

interface FakeDocument extends EventTarget {
  referrer: string;
  visibilityState: string;
}

interface FakeHistory {
  pushState: (...args: unknown[]) => unknown;
  replaceState: (...args: unknown[]) => unknown;
}

interface Dom {
  readonly win: EventTarget;
  readonly doc: FakeDocument;
  readonly history: FakeHistory;
  readonly navigator: Record<string, unknown>;
  readonly location: { href: string };
  readonly seen: string[];
  readonly listeners: () => number;
}

// A window assembled from stubbed globals; counting add/remove proves nothing stays attached.
const stubDom = (): Dom => {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { referrer: "", visibilityState: "visible" });
  const seen: string[] = [];
  const location = { href: "https://a.example/start" };
  const history: FakeHistory = {
    pushState: (_state, _title, url) => {
      location.href = String(url);
      seen.push(`push ${String(url)}`);
    },
    replaceState: (_state, _title, url) => {
      location.href = String(url);
      seen.push(`replace ${String(url)}`);
    },
  };
  const navigator: Record<string, unknown> = { onLine: true };
  let count = 0;
  const counting = (target: EventTarget) => ({
    addEventListener: (type: string, listener: EventListener) => {
      count += 1;
      EventTarget.prototype.addEventListener.call(target, type, listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      count -= 1;
      EventTarget.prototype.removeEventListener.call(target, type, listener);
    },
  });
  Object.assign(doc, counting(doc));
  vi.stubGlobal("addEventListener", counting(win).addEventListener);
  vi.stubGlobal("removeEventListener", counting(win).removeEventListener);
  vi.stubGlobal("dispatchEvent", win.dispatchEvent.bind(win));
  vi.stubGlobal("document", doc);
  vi.stubGlobal("history", history);
  vi.stubGlobal("location", location);
  vi.stubGlobal("navigator", navigator);
  return { win, doc, history, navigator, location, seen, listeners: () => count };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createBrowserPage", () => {
  it("does nothing, and throws nothing, where there is no DOM", () => {
    for (const name of ["document", "history", "location", "navigator", "addEventListener"]) {
      vi.stubGlobal(name, undefined);
    }
    const page = createBrowserPage();
    expect(page.location()).toBeUndefined();
    expect(page.referrer()).toBe("");
    expect(page.signals()).toEqual({});
    for (const subscribe of [page.onHidden, page.onOnline, page.onNavigate]) {
      expect(() => {
        subscribe(() => undefined)();
      }).not.toThrow();
    }
  });

  it("attaches nothing until a listener subscribes", () => {
    const dom = stubDom();
    const original = dom.history.pushState;
    createBrowserPage();
    expect(dom.listeners()).toBe(0);
    expect(dom.history.pushState).toBe(original);
  });

  it("reads the location, the referrer and the signals when asked", () => {
    const dom = stubDom();
    const page = createBrowserPage();
    expect(page.location()).toBe("https://a.example/start");
    dom.location.href = "https://a.example/next";
    dom.doc.referrer = "https://b.example/page";
    dom.navigator.globalPrivacyControl = true;
    expect(page.location()).toBe("https://a.example/next");
    expect(page.referrer()).toBe("https://b.example/page");
    expect(page.signals()).toMatchObject({ globalPrivacyControl: true, onLine: true });
  });

  it.each([
    ["navigator.doNotTrack", (dom: Dom) => (dom.navigator.doNotTrack = "1")],
    ["window.doNotTrack", () => vi.stubGlobal("doNotTrack", "1")],
    ["navigator.msDoNotTrack", (dom: Dom) => (dom.navigator.msDoNotTrack = "1")],
  ])("reports Do Not Track from %s", (_label, set) => {
    const dom = stubDom();
    set(dom);
    expect(createBrowserPage().signals().doNotTrack).toBe("1");
  });

  it("does not report Do Not Track when it is off or unspecified", () => {
    const dom = stubDom();
    dom.navigator.doNotTrack = "0";
    expect(createBrowserPage().signals().doNotTrack).not.toBe("1");
    dom.navigator.doNotTrack = "unspecified";
    expect(createBrowserPage().signals().doNotTrack).not.toBe("1");
  });

  it("tells a listener when the page is hidden, and only then", () => {
    const dom = stubDom();
    let calls = 0;
    const stop = createBrowserPage().onHidden(() => calls++);
    dom.doc.visibilityState = "visible";
    dom.doc.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toBe(0);
    dom.doc.visibilityState = "hidden";
    dom.doc.dispatchEvent(new Event("visibilitychange"));
    expect(calls).toBe(1);
    dom.win.dispatchEvent(new Event("pagehide"));
    expect(calls).toBe(2);
    stop();
    expect(dom.listeners()).toBe(0);
  });

  it("tells a listener when the browser comes back online", () => {
    const dom = stubDom();
    let calls = 0;
    const stop = createBrowserPage().onOnline(() => calls++);
    dom.win.dispatchEvent(new Event("online"));
    expect(calls).toBe(1);
    stop();
    dom.win.dispatchEvent(new Event("online"));
    expect(calls).toBe(1);
    expect(dom.listeners()).toBe(0);
  });

  describe("navigation", () => {
    it("reports pushState and replaceState after they ran, and popstate", () => {
      const dom = stubDom();
      const locations: string[] = [];
      createBrowserPage().onNavigate(() => locations.push(dom.location.href));
      dom.history.pushState({}, "", "/one");
      dom.history.replaceState({}, "", "/two");
      dom.win.dispatchEvent(new Event("popstate"));
      expect(dom.seen).toEqual(["push /one", "replace /two"]);
      expect(locations).toEqual(["/one", "/two", "/two"]);
    });

    it("hands the arguments and the result through", () => {
      const dom = stubDom();
      dom.history.pushState = (...args) => args.length;
      createBrowserPage().onNavigate(() => undefined);
      expect(dom.history.pushState({}, "", "/x")).toBe(3);
    });

    it("lets a throwing listener neither break the history call nor skip it", () => {
      const dom = stubDom();
      createBrowserPage().onNavigate(() => {
        throw new Error("listener");
      });
      expect(() => {
        dom.history.pushState({}, "", "/one");
      }).not.toThrow();
      expect(dom.seen).toEqual(["push /one"]);
    });

    it("restores the original methods and the listener when it stops", () => {
      const dom = stubDom();
      const { pushState, replaceState } = dom.history;
      const stop = createBrowserPage().onNavigate(() => undefined);
      expect(dom.history.pushState).not.toBe(pushState);
      stop();
      stop();
      expect(dom.history.pushState).toBe(pushState);
      expect(dom.history.replaceState).toBe(replaceState);
      expect(dom.listeners()).toBe(0);
    });

    it("leaves another script's wrapper alone and goes quiet", () => {
      const dom = stubDom();
      let calls = 0;
      const stop = createBrowserPage().onNavigate(() => calls++);
      const ours = dom.history.pushState;
      const theirs = (...args: unknown[]): unknown => ours.apply(dom.history, args);
      dom.history.pushState = theirs;
      stop();
      expect(dom.history.pushState).toBe(theirs);
      dom.history.pushState({}, "", "/after");
      expect(calls).toBe(0);
      expect(dom.seen).toEqual(["push /after"]);
    });
  });
});
