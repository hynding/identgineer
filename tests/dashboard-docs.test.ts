import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codeBlocks, importsOf, namesIn } from "./docs-code.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "docs", "dashboard");
const GUIDES = ["plain-html.md", "react.md", "vue.md", "angular.md"];
const RULES = "rules.md";

const read = (path: string) => readFileSync(path, "utf8");
const component = (...path: string[]) => read(join(ROOT, "packages", "components", "src", ...path));

const COMPONENTS_INDEX = component("index.ts");
const COMPONENTS_TYPES = namesIn(COMPONENTS_INDEX, /export type \{([^}]*)\}/g);
const COMPONENTS_VALUES = namesIn(COMPONENTS_INDEX, /export \{([^}]*)\}/g);
const GENERATED = component("components.d.ts");
const GENERATED_NAMESPACES = new Set(
  [...GENERATED.matchAll(/^export namespace (\w+)/gm)].map((match) => match[1] ?? ""),
);
/** The tags the components package defines, from its generated declarations. */
const TAGS = new Set(
  [...GENERATED.matchAll(/^\s+"(idg-[a-z-]+)": HTMLIdg\w+Element;/gm)].map(
    (match) => match[1] ?? "",
  ),
);
/** The events the components emit, as `idgSort`, from the generated `onIdg…` props. */
const EVENTS = new Set(
  [...GENERATED.matchAll(/"on(Idg\w+)"\?:/g)].map(
    (match) => `idg${(match[1] ?? "").slice("Idg".length)}`,
  ),
);

/** The members of a generated element interface, so a guide cannot name one that is not there. */
function membersOf(element: string): Set<string> {
  const body = GENERATED.split(`interface ${element} {`)[1]?.split(/^ {4}\}/m)[0] ?? "";
  return new Set([...body.matchAll(/^\s+"(\w+)"\??:/gm)].map((match) => match[1] ?? ""));
}

const DASHBOARD_TAGS = {
  "idg-property-picker": "IdgPropertyPicker",
  "idg-event-table": "IdgEventTable",
  "idg-sparkline": "IdgSparkline",
  "idg-stat": "IdgStat",
} as const;

function isExported(source: string, name: string, typeOnly: boolean): boolean {
  switch (source) {
    case "@identgineer/components":
      return (
        COMPONENTS_VALUES.has(name) ||
        (typeOnly && (COMPONENTS_TYPES.has(name) || GENERATED_NAMESPACES.has(name)))
      );
    case "@identgineer/components/loader":
      return ["defineCustomElements", "applyPolyfills", "setNonce"].includes(name);
    default:
      return false;
  }
}

const code = (markdown: string) => codeBlocks(markdown).join("\n");

/** The members of an interface, from its source, so a new string cannot go untranslatable. */
function labelKeys(file: string, name: string): string[] {
  const body = component(file).split(`export interface ${name} {`)[1]?.split(/^\}/m)[0] ?? "";
  return [...body.matchAll(/^ {2}readonly (\w+):/gm)].map((match) => match[1] ?? "");
}

describe("the dashboard components guides", () => {
  it("exist, one for each way of adopting the components and one on the rules", () => {
    expect(readdirSync(DOCS).sort()).toEqual([...GUIDES, RULES].sort());
  });

  it("know the tags and events of the generated declarations, so the checks cannot pass on nothing", () => {
    for (const tag of Object.keys(DASHBOARD_TAGS)) expect(TAGS).toContain(tag);
    for (const event of ["idgChange", "idgPageChange", "idgSort"]) expect(EVENTS).toContain(event);
    expect(isExported("@identgineer/components", "validatedSource", false)).toBe(true);
    expect(isExported("@identgineer/components", "DashboardSource", false)).toBe(false);
    expect(isExported("@identgineer/components", "DashboardSource", true)).toBe(true);
  });

  describe.each(GUIDES)("%s", (guide) => {
    const markdown = read(join(DOCS, guide));
    const imports = importsOf(markdown, ["components"]);

    it("builds the source with validatedSource, so every answer is checked before an element sees it", () => {
      expect(code(markdown)).toMatch(/validatedSource\(/);
    });

    it("imports only names the package really exports, from entry points it has", () => {
      const missing = imports
        .filter(({ source, name, typeOnly }) => !isExported(source, name, typeOnly))
        .map(({ source, name }) => `${name} from ${source}`);
      expect(missing).toEqual([]);
    });

    it("uses only tags the components package defines, and all four dashboard elements", () => {
      const used = [...code(markdown).matchAll(/<(idg-[a-z-]+)/g)].map((match) => match[1] ?? "");
      expect(used.filter((tag) => !TAGS.has(tag))).toEqual([]);
      if (guide !== "plain-html.md") {
        for (const tag of ["idg-property-picker", "idg-event-table", "idg-sparkline", "idg-stat"])
          expect(used, `${guide} uses ${tag}`).toContain(tag);
      }
    });

    it("listens only for events the components emit, and handles the page change itself", () => {
      const used = [...code(markdown).matchAll(/\b(idg[A-Z]\w*)\b/g)].map(
        (match) => match[1] ?? "",
      );
      expect(used.length).toBeGreaterThan(0);
      expect(used.filter((event) => !EVENTS.has(event))).toEqual([]);
      expect(code(markdown)).toMatch(/preventDefault\(\)/);
    });

    it("sets only properties the elements have", () => {
      const text = code(markdown);
      const names = [
        ...text.matchAll(/(?:^|[\s.:[])(?:table|picker|visitors|spark)\.(\w+) =/gm),
        ...text.matchAll(/\[(\w+)\]="/g),
        ...text.matchAll(/:(\w+)\.prop=/g),
      ].map((match) => match[1] ?? "");
      const known = new Set(
        Object.values(DASHBOARD_TAGS).flatMap((element) => [...membersOf(element)]),
      );
      const unknown = names.filter(
        (name) => !known.has(name) && !["propertyId", "summary", "visitors"].includes(name),
      );
      expect(unknown).toEqual([]);
    });

    it("links the rules", () => {
      expect(markdown).toContain(`(./${RULES}`);
    });
  });

  describe(RULES, () => {
    const markdown = read(join(DOCS, RULES));

    it.each([
      "Ownership is the source's to enforce",
      "not-found",
      "unauthenticated",
      "invalid-response",
      "Untrusted text",
      "innerHTML",
      "<bdi>",
      "javascript:",
      "bidirectional",
      "Content-Security-Policy",
      "No browser storage",
      "labels",
      "Intl",
      "legal advice",
    ])("covers %s", (topic) => {
      expect(markdown.toLowerCase()).toContain(topic.toLowerCase());
    });

    it("translates only strings the elements really have", () => {
      const sources = {
        EventTableLabels: "components/event-table/event-table-labels.ts",
        PropertyPickerLabels: "components/property-picker/property-picker-labels.ts",
        SparklineLabels: "components/sparkline/sparkline-labels.ts",
      } as const;
      const example = codeBlocks(markdown).find((block) => block.includes("Partial<")) ?? "";
      for (const [type, file] of Object.entries(sources)) {
        const keys = labelKeys(file, type);
        expect(keys.length).toBeGreaterThan(2);
        const block =
          example.split(new RegExp(`Partial<${type}> = \\{`))[1]?.split(/^\};/m)[0] ?? "";
        const used = [...block.matchAll(/^ {2}(\w+): /gm)].map((match) => match[1] ?? "");
        expect(used.length, `${type} has an example`).toBeGreaterThan(0);
        expect(used.filter((key) => !keys.includes(key))).toEqual([]);
      }
    });
  });

  it("are linked from the root README and from the components README", () => {
    for (const readme of ["README.md", join("packages", "components", "README.md")]) {
      const text = read(join(ROOT, readme));
      for (const guide of [...GUIDES, RULES])
        expect(text, `${readme} links ${guide}`).toContain(`docs/dashboard/${guide}`);
    }
  });
});
