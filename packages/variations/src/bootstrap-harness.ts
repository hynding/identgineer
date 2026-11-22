import { Window } from "happy-dom";
import { buildBootstrapFiles } from "./bootstrap-files.ts";
import { STORAGE_KEY } from "./constants.ts";
import { REGISTRY, STATE_KEYS } from "./registry.ts";

export const SCRIPT = buildBootstrapFiles()["bootstrap.js"] ?? "";

export function execute(window: Window): void {
  window.eval(SCRIPT);
}

export interface Run {
  readonly root: HTMLElement;
  readonly window: Window;
}

export interface RunOptions {
  readonly search?: string;
  readonly stored?: string;
  readonly storage?: "throws" | "absent";
  /** Attributes the server already rendered on the root element. */
  readonly rendered?: Readonly<Record<string, string>>;
}

/** Runs the built script in a fresh page, the way a browser would in `<head>`. */
export function run(options: RunOptions = {}): Run {
  const window = new Window({ url: `https://example.test/${options.search ?? ""}` });
  if (options.stored !== undefined) window.localStorage.setItem(STORAGE_KEY, options.stored);
  if (options.storage === "throws") {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  }
  if (options.storage === "absent") {
    Object.defineProperty(window, "localStorage", { value: undefined });
  }
  for (const [name, value] of Object.entries(options.rendered ?? {})) {
    window.document.documentElement.setAttribute(name, value);
  }
  execute(window);
  return { root: window.document.documentElement as unknown as HTMLElement, window };
}

export function attributes(root: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(
    STATE_KEYS.map((key) => [key, root.getAttribute(REGISTRY[key].attribute)]),
  );
}

export const NONE = { theme: null, design: null, layout: null, ux: null, scheme: null };
