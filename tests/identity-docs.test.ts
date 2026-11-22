import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as identity from "../packages/identity/src/index.ts";
import { codeBlocks, importsOf, namesIn } from "./docs-code.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "docs", "identity");
const GUIDES = ["plain-html.md", "react.md", "vue.md", "angular.md"];
const SECURITY = "security.md";

const read = (path: string) => readFileSync(path, "utf8");

const COMPONENTS_INDEX = read(join(ROOT, "packages", "components", "src", "index.ts"));
const COMPONENTS_TYPES = namesIn(COMPONENTS_INDEX, /export type \{([^}]*)\}/g);
const COMPONENTS_VALUES = namesIn(COMPONENTS_INDEX, /export \{([^}]*)\}/g);
const GENERATED = read(join(ROOT, "packages", "components", "src", "components.d.ts"));
const GENERATED_NAMESPACES = new Set(
  [...GENERATED.matchAll(/^export namespace (\w+)/gm)].map((match) => match[1] ?? ""),
);
/** The tags the components package defines, from its generated declarations. */
const TAGS = new Set(
  [...GENERATED.matchAll(/^\s+"(idg-[a-z-]+)": HTMLIdg\w+Element;/gm)].map(
    (match) => match[1] ?? "",
  ),
);
/** The events the components emit, as `idgSignedIn`, from the generated `onIdg…` props. */
const EVENTS = new Set(
  [...GENERATED.matchAll(/"on(Idg\w+)"\?:/g)].map(
    (match) => `idg${(match[1] ?? "").slice("Idg".length)}`,
  ),
);

const IDENTITY_SOURCE = read(join(ROOT, "packages", "identity", "src", "index.ts"));
const IDENTITY_TYPES = namesIn(IDENTITY_SOURCE, /export type \{([^}]*)\}/g);

function isExported(source: string, name: string, typeOnly: boolean): boolean {
  switch (source) {
    case "@identgineer/components":
      return (
        COMPONENTS_VALUES.has(name) ||
        (typeOnly && (COMPONENTS_TYPES.has(name) || GENERATED_NAMESPACES.has(name)))
      );
    case "@identgineer/components/loader":
      return ["defineCustomElements", "applyPolyfills", "setNonce"].includes(name);
    case "@identgineer/identity":
      return name in identity || (typeOnly && IDENTITY_TYPES.has(name));
    default:
      return false;
  }
}

const code = (markdown: string) => codeBlocks(markdown).join("\n");

describe("the identity components guides", () => {
  it("exist, one for each way of adopting the components and one on security", () => {
    expect(readdirSync(DOCS).sort()).toEqual([...GUIDES, SECURITY].sort());
  });

  it("know the tags and events of the generated declarations, so the checks cannot pass on nothing", () => {
    expect(TAGS).toContain("idg-sign-in");
    expect(TAGS).toContain("idg-session-guard");
    expect(EVENTS).toContain("idgSignedIn");
    expect(EVENTS).toContain("idgSessionChange");
    expect(isExported("@identgineer/identity", "createIdentityClient", false)).toBe(true);
    expect(isExported("@identgineer/identity", "IdentityClient", false)).toBe(false);
    expect(isExported("@identgineer/identity", "IdentityClient", true)).toBe(true);
  });

  describe.each(GUIDES)("%s", (guide) => {
    const markdown = read(join(DOCS, guide));
    const imports = importsOf(markdown, ["components", "identity"]);

    it("creates the client with the identity package and hands it to the components", () => {
      expect(imports.map(({ name }) => name)).toContain("createIdentityClient");
      expect(code(markdown)).toMatch(/\.client\s*=|\[client\]=/);
    });

    it("imports only names the packages really export, from entry points they have", () => {
      const missing = imports
        .filter(({ source, name, typeOnly }) => !isExported(source, name, typeOnly))
        .map(({ source, name }) => `${name} from ${source}`);
      expect(missing).toEqual([]);
    });

    it("uses only tags the components package defines", () => {
      const used = [...code(markdown).matchAll(/<(idg-[a-z-]+)/g)].map((match) => match[1] ?? "");
      expect(used.length).toBeGreaterThan(0);
      expect(used.filter((tag) => !TAGS.has(tag))).toEqual([]);
    });

    it("listens only for events the components emit", () => {
      const used = [...code(markdown).matchAll(/\b(idg[A-Z]\w*)\b/g)].map(
        (match) => match[1] ?? "",
      );
      expect(used.length).toBeGreaterThan(0);
      expect(used.filter((event) => !EVENTS.has(event))).toEqual([]);
    });

    it("says the session guard is not access control and links the security notes", () => {
      expect(markdown).toContain("not access control");
      expect(markdown).toContain(`(./${SECURITY})`);
    });
  });

  describe(SECURITY, () => {
    const markdown = read(join(DOCS, SECURITY));

    it.each([
      "not access control",
      "in memory",
      "Content-Security-Policy",
      "labels",
      "enumeration",
      "localStorage",
      "autocomplete",
      ":not(.hydrated)",
    ])("covers %s", (topic) => {
      expect(markdown).toContain(topic);
    });
  });

  it("are linked from the root README and from the components README", () => {
    for (const readme of ["README.md", join("packages", "components", "README.md")]) {
      const text = read(join(ROOT, readme));
      for (const guide of [...GUIDES, SECURITY])
        expect(text, `${readme} links ${guide}`).toContain(`docs/identity/${guide}`);
    }
  });
});
