import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildBootstrapFiles,
  BOOTSTRAP_MAX_BYTES,
  writeBootstrapFiles,
} from "./bootstrap-files.ts";
import { bootstrapScriptAttributes } from "./bootstrap-tag.ts";
import { CHANGE_EVENT, MAX_STORED_LENGTH, STORAGE_KEY, URL_PARAM_PREFIX } from "./constants.ts";
import { REGISTRY, STATE_KEYS } from "./registry.ts";
import { loadVariations, saveVariations } from "./storage.ts";
import { encodeVariations } from "./url.ts";

const SCRIPT = buildBootstrapFiles()["bootstrap.js"] ?? "";

interface Run {
  readonly root: HTMLElement;
  readonly window: Window;
}

/** Runs the built script in a fresh page, the way a browser would in `<head>`. */
function run(
  options: { search?: string; stored?: string; storage?: "throws" | "absent" } = {},
): Run {
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
  window.eval(SCRIPT);
  return { root: window.document.documentElement as unknown as HTMLElement, window };
}

function attributes(root: HTMLElement): Record<string, string | null> {
  return Object.fromEntries(
    STATE_KEYS.map((key) => [key, root.getAttribute(REGISTRY[key].attribute)]),
  );
}

const NONE = { theme: null, design: null, layout: null, ux: null, scheme: null };

describe("the bootstrap script", () => {
  it("sets nothing when there is neither a URL choice nor a stored one", () => {
    expect(attributes(run().root)).toEqual(NONE);
  });

  it("applies the choice in the URL", () => {
    const { root } = run({
      search: "?idg-theme=ember&idg-design=glass&idg-layout=bento&idg-ux=focus&idg-scheme=dark",
    });
    expect(attributes(root)).toEqual({
      theme: "ember",
      design: "glass",
      layout: "bento",
      ux: "focus",
      scheme: "dark",
    });
  });

  it("applies the choice in storage", () => {
    const { root } = run({
      stored: JSON.stringify({ theme: "tidal", ux: "calm", scheme: "light" }),
    });
    expect(attributes(root)).toEqual({ ...NONE, theme: "tidal", ux: "calm", scheme: "light" });
  });

  it("lets the URL win over storage, axis by axis", () => {
    const { root } = run({
      search: "?idg-theme=ember",
      stored: JSON.stringify({ theme: "tidal", design: "glass" }),
    });
    expect(attributes(root)).toEqual({ ...NONE, theme: "ember", design: "glass" });
  });

  it("falls back to storage for an axis whose URL value is invalid", () => {
    const { root } = run({ search: "?idg-theme=EMBER", stored: '{"theme":"tidal"}' });
    expect(root.getAttribute("data-theme")).toBe("tidal");
  });

  it("agrees with the runtime: whatever the runtime encodes, the script applies", () => {
    const state = {
      theme: "terminal",
      design: "pixel",
      layout: "immersive",
      ux: "power",
      scheme: "dark",
    } as const;
    const { root } = run({ search: `?${encodeVariations(state)}` });
    expect(attributes(root)).toEqual(state);
  });

  it("agrees with the runtime: whatever the runtime stores, the script applies", () => {
    const state = { theme: "paper", layout: "dashboard", scheme: "light" } as const;
    const store = new Map<string, string>();
    saveVariations(state, {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => void store.set(key, value),
      removeItem: (key) => void store.delete(key),
    });
    const { root } = run({ stored: store.get(STORAGE_KEY) ?? "" });
    expect(attributes(root)).toEqual({ ...NONE, ...state });
    expect(loadVariations({ getItem: () => store.get(STORAGE_KEY) ?? null } as never)).toEqual(
      state,
    );
  });

  it("removes data-scheme for an explicit system scheme in the URL", () => {
    const window = new Window({ url: "https://example.test/?idg-scheme=system" });
    window.document.documentElement.setAttribute("data-scheme", "dark");
    window.eval(SCRIPT);
    expect(window.document.documentElement.hasAttribute("data-scheme")).toBe(false);
  });

  it("applies every registry id, so the embedded lists are complete", () => {
    for (const key of STATE_KEYS) {
      const ids: readonly string[] =
        key === "scheme"
          ? REGISTRY.scheme.ids
          : REGISTRY[key].variations.map((variation) => variation.id);
      for (const id of ids) {
        const { root } = run({ search: `?${URL_PARAM_PREFIX}${key}=${id}` });
        expect(root.getAttribute(REGISTRY[key].attribute)).toBe(id === "system" ? null : id);
      }
    }
  });

  it.each([
    ["wrong case", "?idg-theme=Ember"],
    ["whitespace", "?idg-theme=%20ember"],
    ["a trailing newline", "?idg-theme=ember%0A"],
    ["a prototype key", "?idg-theme=__proto__&idg-design=constructor"],
    ["markup", "?idg-theme=%3Cscript%3E"],
    ["an id from another axis", "?idg-theme=glass"],
    ["a very long value", `?idg-theme=${"e".repeat(100_000)}`],
    ["a bare, unprefixed name", "?theme=ember"],
    ["malformed escapes", "?idg-theme=%E0%A4%A"],
  ])("rejects an invalid URL value: %s", (_name, search) => {
    expect(attributes(run({ search }).root)).toEqual(NONE);
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a string", '"ember"'],
    ["null", "null"],
    ["an array", '["ember"]'],
    ["invalid fields", '{"theme":"EMBER","design":7,"layout":null,"ux":{},"scheme":"sepia"}'],
    ["a prototype key", '{"__proto__":{"theme":"ember"}}'],
    ["an oversized value", `{"theme":"ember"${" ".repeat(MAX_STORED_LENGTH)}}`],
  ])("rejects an invalid stored value: %s", (_name, stored) => {
    expect(attributes(run({ stored }).root)).toEqual(NONE);
  });

  it("still applies the URL when storage throws, and does not throw", () => {
    const { root } = run({ search: "?idg-theme=ember", storage: "throws" });
    expect(attributes(root)).toEqual({ ...NONE, theme: "ember" });
  });

  it("does not throw when storage is absent", () => {
    expect(attributes(run({ storage: "absent" }).root)).toEqual(NONE);
  });

  it("does not throw when reading an item fails", () => {
    const window = new Window({ url: "https://example.test/?idg-ux=focus" });
    window.localStorage.getItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
    expect(() => window.eval(SCRIPT)).not.toThrow();
    expect(window.document.documentElement.getAttribute("data-ux")).toBe("focus");
  });

  it("does not throw on a document without a root element", () => {
    const window = new Window({ url: "https://example.test/" });
    window.document.documentElement.remove();
    expect(() => window.eval(SCRIPT)).not.toThrow();
  });

  it("does not announce a change: nothing is listening yet in <head>", () => {
    const window = new Window({ url: "https://example.test/?idg-theme=ember" });
    let heard = 0;
    window.document.addEventListener(CHANGE_EVENT, () => (heard += 1));
    window.eval(SCRIPT);
    expect(heard).toBe(0);
  });

  it("writes nothing to storage", () => {
    const window = new Window({ url: "https://example.test/?idg-theme=ember" });
    window.eval(SCRIPT);
    expect(window.localStorage.length).toBe(0);
  });
});

describe("the bootstrap source", () => {
  it("is under 2 KB", () => {
    expect(BOOTSTRAP_MAX_BYTES).toBe(2048);
    expect(Buffer.byteLength(SCRIPT)).toBeLessThan(BOOTSTRAP_MAX_BYTES);
  });

  it("is one IIFE: classic script, no module syntax", () => {
    expect(SCRIPT.startsWith("(function(){")).toBe(true);
    expect(SCRIPT.endsWith("})();")).toBe(true);
    expect(SCRIPT).not.toMatch(/\b(import|export)\b/);
  });

  it("uses nothing newer than ES2017 and nothing that CSP forbids", () => {
    expect(SCRIPT).not.toMatch(/\beval\b|\bFunction\b|innerHTML|document\.write|setTimeout/);
    expect(SCRIPT).not.toMatch(/\?\.|\?\?|=>|`|\b(let|const|class|async|await)\b/);
  });

  it("is minified: one line, no comments", () => {
    expect(SCRIPT).not.toMatch(/[\n\r]|\/\*|\/\/|\s{2,}/);
  });

  it("embeds exactly the registry's id lists, so it cannot drift from the tokens", () => {
    const literal = /var c=(\{.*?\});/.exec(SCRIPT)?.[1];
    const config = JSON.parse(literal ?? "null") as {
      k: string;
      m: number;
      p: string;
      a: [string, string, string[]][];
    };
    expect(config.k).toBe(STORAGE_KEY);
    expect(config.m).toBe(MAX_STORED_LENGTH);
    expect(config.p).toBe(URL_PARAM_PREFIX);
    expect(config.a).toEqual(
      STATE_KEYS.map((key) => [
        key,
        REGISTRY[key].attribute,
        key === "scheme"
          ? [...REGISTRY.scheme.ids]
          : REGISTRY[key].variations.map((variation) => variation.id),
      ]),
    );
  });

  it("builds to identical bytes every time", () => {
    expect(buildBootstrapFiles()).toEqual(buildBootstrapFiles());
  });
});

describe("the bootstrap files", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  });

  function written(): string {
    const directory = mkdtempSync(join(tmpdir(), "idg-bootstrap-"));
    directories.push(directory);
    writeBootstrapFiles(directory);
    return directory;
  }

  it("writes bootstrap.js and bootstrap.sri.json", () => {
    const directory = written();
    expect(readFileSync(join(directory, "bootstrap.js"), "utf8")).toBe(SCRIPT);
  });

  it("records a sha384 integrity value that matches the file", () => {
    const directory = written();
    const metadata = JSON.parse(readFileSync(join(directory, "bootstrap.sri.json"), "utf8")) as {
      file: string;
      integrity: string;
      bytes: number;
    };
    const bytes = readFileSync(join(directory, "bootstrap.js"));
    expect(metadata.file).toBe("bootstrap.js");
    expect(metadata.integrity).toBe(
      `sha384-${createHash("sha384").update(bytes).digest("base64")}`,
    );
    expect(metadata.integrity).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    expect(metadata.bytes).toBe(bytes.length);
  });

  it("writes identical bytes when built twice", () => {
    const first = written();
    const second = written();
    for (const name of ["bootstrap.js", "bootstrap.sri.json"]) {
      expect(readFileSync(join(first, name)).equals(readFileSync(join(second, name)))).toBe(true);
    }
  });

  it("gives the script tag attributes the site needs", () => {
    const directory = written();
    const { integrity } = JSON.parse(
      readFileSync(join(directory, "bootstrap.sri.json"), "utf8"),
    ) as { integrity: string };
    expect(bootstrapScriptAttributes("/variations/bootstrap.js")).toEqual({
      src: "/variations/bootstrap.js",
      integrity,
    });
  });
});
