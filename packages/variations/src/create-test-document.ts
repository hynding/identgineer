import { Window } from "happy-dom";

/** Each call is a separate window, so tests and multiple-document cases share no state. */
export function createTestDocument(html = ""): Document {
  const window = new Window({ url: "https://example.test/" });
  window.document.documentElement.innerHTML = `<head></head><body>${html}</body>`;
  return window.document as unknown as Document;
}
