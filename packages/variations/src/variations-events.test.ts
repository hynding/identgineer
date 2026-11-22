import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHANGE_EVENT } from "./constants.ts";
import { createTestDocument } from "./create-test-document.ts";
import { getVariations } from "./read-variations.ts";
import { MAX_ANNOUNCEMENTS_PER_DISPATCH, onVariationsChange } from "./variations-events.ts";
import type { VariationsChange } from "./variations-events.ts";
import { applyVariations, resetVariations } from "./variations-state.ts";

// happy-dom delivers mutation records in a microtask.
const flushMutations = async (): Promise<void> => {
  await Promise.resolve();
};

let doc: Document;
let root: HTMLElement;

beforeEach(() => {
  doc = createTestDocument();
  root = doc.documentElement;
});

function collect(target: Element = root): VariationsChange[] {
  const received: VariationsChange[] = [];
  onVariationsChange((change) => received.push(change), { root: target });
  return received;
}

describe("the change event", () => {
  it("is named idg-variations-change", () => {
    expect(CHANGE_EVENT).toBe("idg-variations-change");
  });

  it("is dispatched on the root with the state and what changed, and bubbles", () => {
    const seen: CustomEvent<VariationsChange>[] = [];
    doc.addEventListener(CHANGE_EVENT, (event) =>
      seen.push(event as CustomEvent<VariationsChange>),
    );
    applyVariations({ theme: "ember", scheme: "dark" }, { root });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.target).toBe(root);
    expect(seen[0]?.detail.changed).toEqual(["theme", "scheme"]);
    expect(seen[0]?.detail.state).toEqual(getVariations(root));
  });

  it("is dispatched without any listener subscribed", () => {
    const seen: Event[] = [];
    root.addEventListener(CHANGE_EVENT, (event) => seen.push(event));
    applyVariations({ ux: "focus" }, { root });
    expect(seen).toHaveLength(1);
  });

  it("is not dispatched when nothing changed", () => {
    applyVariations({ theme: "ember" }, { root });
    const seen: Event[] = [];
    root.addEventListener(CHANGE_EVENT, (event) => seen.push(event));
    applyVariations({ theme: "ember" }, { root });
    applyVariations({ theme: "nope" } as never, { root });
    expect(seen).toHaveLength(0);
  });

  it("is dispatched by a reset", () => {
    applyVariations({ theme: "ember" }, { root });
    const received = collect();
    resetVariations({ root });
    expect(received).toHaveLength(1);
    expect(received[0]?.changed).toEqual(["theme"]);
  });
});

describe("onVariationsChange", () => {
  it("tells the listener synchronously when applyVariations changes something", () => {
    const received = collect();
    applyVariations({ theme: "ember" }, { root });
    expect(received).toEqual([
      { state: { ...getVariations(root), theme: "ember" }, changed: ["theme"] },
    ]);
  });

  it("returns an unsubscribe function that stops further notifications and is safe to repeat", async () => {
    const listener = vi.fn();
    const unsubscribe = onVariationsChange(listener, { root });
    unsubscribe();
    unsubscribe();
    applyVariations({ theme: "ember" }, { root });
    root.setAttribute("data-design", "glass");
    await flushMutations();
    expect(listener).not.toHaveBeenCalled();
  });

  it("hears changes made by markup or other scripts", async () => {
    const received = collect();
    root.setAttribute("data-layout", "bento");
    await flushMutations();
    expect(received).toEqual([{ state: { ...getVariations(root) }, changed: ["layout"] }]);
    expect(received[0]?.state.layout).toBe("bento");
  });

  it("hears the removal of an attribute", async () => {
    root.setAttribute("data-scheme", "dark");
    const received = collect();
    root.removeAttribute("data-scheme");
    await flushMutations();
    expect(received.map((change) => change.changed)).toEqual([["scheme"]]);
    expect(received[0]?.state.scheme).toBe("system");
  });

  it("gives one notification for one change, not one from the call and one from the observer", async () => {
    const received = collect();
    applyVariations({ theme: "ember" }, { root });
    await flushMutations();
    expect(received).toHaveLength(1);
  });

  it("gives one notification for several attributes changed in one go", async () => {
    const received = collect();
    root.setAttribute("data-theme", "tidal");
    root.setAttribute("data-ux", "calm");
    await flushMutations();
    expect(received).toHaveLength(1);
    expect(received[0]?.changed).toEqual(["theme", "ux"]);
  });

  it("stays quiet about other attributes and about values that read as the default", async () => {
    const received = collect();
    root.setAttribute("class", "x");
    root.setAttribute("data-theme", "<script>");
    await flushMutations();
    expect(received).toHaveLength(0);
  });

  it("keeps the baseline right when attributes change while nobody listens", async () => {
    const first = onVariationsChange(vi.fn(), { root });
    first();
    root.setAttribute("data-theme", "ember");
    await flushMutations();
    const received = collect();
    root.setAttribute("data-theme", "tidal");
    await flushMutations();
    expect(received.map((change) => change.changed)).toEqual([["theme"]]);
  });

  it("serves several listeners on one root and keeps observing until the last leaves", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = onVariationsChange(first, { root });
    onVariationsChange(second, { root });
    stopFirst();
    root.setAttribute("data-ux", "focus");
    await flushMutations();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("works per root: another document's changes are not heard", async () => {
    const other = createTestDocument();
    const received = collect();
    applyVariations({ theme: "ember" }, { root: other });
    other.documentElement.setAttribute("data-ux", "focus");
    await flushMutations();
    expect(received).toHaveLength(0);
  });

  it("accepts a document as the root", () => {
    const received: VariationsChange[] = [];
    onVariationsChange((change) => received.push(change), { root: doc });
    applyVariations({ theme: "ember" }, { root: doc });
    expect(received).toHaveLength(1);
  });

  it("is not fooled by a forged event: listeners only get what the package computed", () => {
    const received = collect();
    root.dispatchEvent(
      new (doc.defaultView as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent(
        CHANGE_EVENT,
        { detail: { state: { theme: "<script>" }, changed: ["theme"] } },
      ),
    );
    expect(received).toHaveLength(0);
  });

  it("isolates a throwing listener from the others and from applyVariations", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const after = vi.fn();
    onVariationsChange(
      () => {
        throw new Error("listener bug");
      },
      { root },
    );
    onVariationsChange(after, { root });
    expect(() => applyVariations({ theme: "ember" }, { root })).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it("is a harmless no-op where there is no DOM", () => {
    const unsubscribe = onVariationsChange(vi.fn());
    expect(unsubscribe).not.toThrow();
    expect(() => applyVariations({ theme: "ember" })).not.toThrow();
  });
});

describe("changes made from outside in the same tick as a call", () => {
  it("are announced together with the call's own change, not lost", async () => {
    const received = collect();
    const events: VariationsChange[] = [];
    root.addEventListener(CHANGE_EVENT, (event) =>
      events.push((event as CustomEvent<VariationsChange>).detail),
    );
    root.setAttribute("data-design", "glass");
    const result = applyVariations({ theme: "ember" }, { root });
    await flushMutations();
    expect(received).toHaveLength(1);
    expect(received[0]?.changed).toEqual(["theme", "design"]);
    expect(received[0]?.state).toMatchObject({ theme: "ember", design: "glass" });
    expect(events.map((change) => change.changed)).toEqual([["theme", "design"]]);
    // What the call returns stays relative to the state before the call.
    expect(result.changed).toEqual(["theme"]);
  });
});

describe("a listener that applies a change", () => {
  it("makes every listener and the event see the states in order, ending on the final one", () => {
    const seen = { first: [] as string[], second: [] as string[], event: [] as string[] };
    onVariationsChange(
      ({ state }) => {
        seen.first.push(state.theme);
        if (state.theme === "ember") applyVariations({ theme: "tidal" }, { root });
      },
      { root },
    );
    onVariationsChange(({ state }) => seen.second.push(state.theme), { root });
    root.addEventListener(CHANGE_EVENT, (event) =>
      seen.event.push((event as CustomEvent<VariationsChange>).detail.state.theme),
    );
    applyVariations({ theme: "ember" }, { root });
    expect(seen.first).toEqual(["ember", "tidal"]);
    expect(seen.second).toEqual(["ember", "tidal"]);
    expect(seen.event).toEqual(["ember", "tidal"]);
    expect(getVariations(root).theme).toBe("tidal");
  });

  it("does not announce the nested change twice when the observer catches up", async () => {
    const received = collect();
    onVariationsChange(
      ({ state }) => {
        if (state.theme === "ember") applyVariations({ theme: "tidal" }, { root });
      },
      { root },
    );
    applyVariations({ theme: "ember" }, { root });
    await flushMutations();
    expect(received.map((change) => change.state.theme)).toEqual(["ember", "tidal"]);
  });
});

describe("unsubscribing during a dispatch", () => {
  it("means the listener is not called afterwards, even in that same dispatch", () => {
    const second = vi.fn();
    let stopSecond = (): void => undefined;
    onVariationsChange(
      () => {
        stopSecond();
      },
      { root },
    );
    stopSecond = onVariationsChange(second, { root });
    applyVariations({ theme: "ember" }, { root });
    expect(second).not.toHaveBeenCalled();
  });
});

describe("what listeners and the event are given", () => {
  it("is frozen, so a handler cannot corrupt the state, the dedup or the return value", () => {
    const events: VariationsChange[] = [];
    root.addEventListener(CHANGE_EVENT, (event) => {
      const { detail } = event as CustomEvent<VariationsChange>;
      events.push(detail);
      expect(() => {
        (detail.state as { theme: string }).theme = "forged";
      }).toThrow(TypeError);
      expect(() => {
        (detail.changed as string[]).push("forged");
      }).toThrow(TypeError);
      expect(() => {
        (detail as { state: unknown }).state = {};
      }).toThrow(TypeError);
    });
    const listened: VariationsChange[] = [];
    onVariationsChange((change) => listened.push(change), { root });
    const result = applyVariations({ theme: "ember" }, { root });
    expect(Object.isFrozen(events[0]) && Object.isFrozen(events[0]?.state)).toBe(true);
    expect(Object.isFrozen(events[0]?.changed)).toBe(true);
    expect(Object.isFrozen(listened[0]?.state)).toBe(true);
    expect(Object.isFrozen(result.state) && Object.isFrozen(result.changed)).toBe(true);
    expect(result.state.theme).toBe("ember");
    // The next call is still compared with the true last state.
    const next = applyVariations({ theme: "tidal" }, { root });
    expect(next.changed).toEqual(["theme"]);
    expect(listened.map((change) => change.changed)).toEqual([["theme"], ["theme"]]);
  });

  it("does not share one object between the listeners' view and the internal baseline", async () => {
    const received = collect();
    applyVariations({ theme: "ember" }, { root });
    expect(Object.isFrozen(received[0])).toBe(true);
    root.setAttribute("data-theme", "ember");
    await flushMutations();
    expect(received).toHaveLength(1);
  });
});

describe("two listeners that keep undoing each other", () => {
  function pingPong(): { calls: () => number } {
    let calls = 0;
    onVariationsChange(
      ({ state, changed }) => {
        calls += 1;
        if (changed.includes("theme") && state.theme === "ember")
          applyVariations({ theme: "tidal" }, { root });
      },
      { root },
    );
    onVariationsChange(
      ({ state, changed }) => {
        if (changed.includes("theme") && state.theme === "tidal")
          applyVariations({ theme: "ember" }, { root });
      },
      { root },
    );
    return { calls: () => calls };
  }

  it("is stopped at the limit: the call returns and the problem is logged once, precisely", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { calls } = pingPong();
    expect(() => applyVariations({ theme: "ember" }, { root })).not.toThrow();
    expect(MAX_ANNOUNCEMENTS_PER_DISPATCH).toBe(100);
    expect(calls()).toBeLessThanOrEqual(MAX_ANNOUNCEMENTS_PER_DISPATCH);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain(String(MAX_ANNOUNCEMENTS_PER_DISPATCH));
    error.mockRestore();
  });

  it("leaves the baseline equal to the DOM, so the next ordinary change is announced correctly", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const received = collect();
    pingPong();
    applyVariations({ theme: "ember" }, { root });
    received.length = 0;
    const result = applyVariations({ ux: "focus" }, { root });
    expect(received.map((change) => change.changed)).toEqual([["ux"]]);
    expect(received[0]?.state).toEqual(getVariations(root));
    expect(result.changed).toEqual(["ux"]);
    error.mockRestore();
  });
});
