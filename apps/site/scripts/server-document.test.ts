import { MockWindow } from "@stencil/core/mock-doc";
import { describe, expect, it } from "vitest";
import { prepareServerDocument } from "./server-document";

function serverDocument(): Document {
  const window = new MockWindow("http://localhost/") as unknown as Window;
  return window.document;
}

describe("the prerender document", () => {
  it("lacks what the components reach for, which is why it is prepared", () => {
    const document = serverDocument();
    const view = document.defaultView as unknown as Record<string, unknown>;
    expect(Array.isArray(document.adoptedStyleSheets)).toBe(false);
    expect(typeof view.MutationObserver).not.toBe("function");
    expect(document.createElement("select").validity).toBeUndefined();
  });

  it("takes adopted style sheets once prepared", () => {
    const document = serverDocument();
    prepareServerDocument(document);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets];
    expect(document.adoptedStyleSheets).toEqual([]);
  });

  it("has a mutation observer that never reports a change", () => {
    const document = serverDocument();
    prepareServerDocument(document);
    const view = document.defaultView;
    if (!view) throw new Error("no window");
    const observer = new view.MutationObserver(() => {
      throw new Error("an inert observer must not call back");
    });
    observer.observe(document.documentElement, { attributes: true });
    document.documentElement.setAttribute("data-theme", "ember");
    expect(observer.takeRecords()).toEqual([]);
    observer.disconnect();
  });

  it("reports every native control as valid", () => {
    const document = serverDocument();
    prepareServerDocument(document);
    const validity = document.createElement("select").validity;
    expect(validity.valid).toBe(true);
    expect(validity.valueMissing).toBe(false);
  });

  it("can be prepared twice", () => {
    const document = serverDocument();
    prepareServerDocument(document);
    expect(() => {
      prepareServerDocument(document);
    }).not.toThrow();
  });
});
