import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHANGE_EVENT } from "./constants.ts";
import { createTestDocument } from "./create-test-document.ts";
import { getVariations } from "./read-variations.ts";
import { onVariationsChange } from "./variations-events.ts";
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
