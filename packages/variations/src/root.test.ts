import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDocument } from "./create-test-document.ts";
import { getVariations } from "./read-variations.ts";
import { resolveRoot } from "./root.ts";
import { applyVariations, resetVariations } from "./variations-state.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function withoutRootElement(): Document {
  const doc = createTestDocument();
  doc.documentElement.remove();
  return doc;
}

describe("a document that has no root element", () => {
  it("resolves to no root, and never falls through to the global document", () => {
    const global = createTestDocument();
    global.documentElement.setAttribute("data-theme", "ember");
    vi.stubGlobal("document", global);
    expect(resolveRoot(withoutRootElement())).toBeUndefined();
    expect(resolveRoot()).toBe(global.documentElement);
  });

  it("reads as the defaults, not as the global document", () => {
    const global = createTestDocument();
    global.documentElement.setAttribute("data-theme", "ember");
    vi.stubGlobal("document", global);
    expect(getVariations(withoutRootElement()).theme).toBe("aurora");
  });

  it("makes apply and reset a no-op on the global document, and reports what it did", () => {
    const global = createTestDocument();
    vi.stubGlobal("document", global);
    const result = applyVariations({ theme: "ember" }, { root: withoutRootElement() });
    expect(result.state.theme).toBe("ember");
    expect(result.changed).toEqual(["theme"]);
    expect(global.documentElement.hasAttribute("data-theme")).toBe(false);
    global.documentElement.setAttribute("data-ux", "focus");
    resetVariations({ root: withoutRootElement() });
    expect(global.documentElement.getAttribute("data-ux")).toBe("focus");
  });

  it("is also no root when the global document has none", () => {
    vi.stubGlobal("document", withoutRootElement());
    expect(resolveRoot()).toBeUndefined();
  });
});
