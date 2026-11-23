import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as tracking from "../packages/tracking/src/index.ts";
import { codeBlocks, importsOf, namesIn } from "./docs-code.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "docs", "consent");
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
/** The events the components emit, as `idgConsentChange`, from the generated `onIdg…` props. */
const EVENTS = new Set(
  [...GENERATED.matchAll(/"on(Idg\w+)"\?:/g)].map(
    (match) => `idg${(match[1] ?? "").slice("Idg".length)}`,
  ),
);

const TRACKING_TYPES = namesIn(
  read(join(ROOT, "packages", "tracking", "src", "index.ts")),
  /export type \{([^}]*)\}/g,
);

function isExported(source: string, name: string, typeOnly: boolean): boolean {
  switch (source) {
    case "@identgineer/components":
      return (
        COMPONENTS_VALUES.has(name) ||
        (typeOnly && (COMPONENTS_TYPES.has(name) || GENERATED_NAMESPACES.has(name)))
      );
    case "@identgineer/components/loader":
      return ["defineCustomElements", "applyPolyfills", "setNonce"].includes(name);
    case "@identgineer/tracking":
      return name in tracking || (typeOnly && TRACKING_TYPES.has(name));
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

describe("the consent components guides", () => {
  it("exist, one for each way of adopting the components and one on the rules", () => {
    expect(readdirSync(DOCS).sort()).toEqual([...GUIDES, RULES].sort());
  });

  it("know the tags and events of the generated declarations, so the checks cannot pass on nothing", () => {
    expect(TAGS).toContain("idg-consent-banner");
    expect(TAGS).toContain("idg-consent-preferences");
    expect(EVENTS).toContain("idgConsentChange");
    expect(EVENTS).toContain("idgConsentChoose");
    expect(isExported("@identgineer/tracking", "createTracker", false)).toBe(true);
    expect(isExported("@identgineer/tracking", "Tracker", false)).toBe(false);
    expect(isExported("@identgineer/tracking", "Tracker", true)).toBe(true);
  });

  describe.each(GUIDES)("%s", (guide) => {
    const markdown = read(join(DOCS, guide));
    const imports = importsOf(markdown, ["components", "tracking"]);

    it("creates the tracker with the tracking package and hands its consent object to the elements", () => {
      expect(imports.map(({ name }) => name)).toContain("createTracker");
      expect(code(markdown)).toMatch(
        /\.consent\s*=\s*tracker\.consent|\[consent\]=|:consent\.prop=/,
      );
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

    it("places the banner last in the body or says where it goes, and links the rules", () => {
      expect(markdown).toMatch(/\*\*last[^*]*\*\*/);
      expect(markdown).toContain(`(./${RULES}`);
    });
  });

  describe(RULES, () => {
    const markdown = read(join(DOCS, RULES));

    it.each([
      "No dark patterns",
      "same variant",
      "Escape",
      "Global Privacy Control",
      "Do Not Track",
      "announce-signal",
      "never blocks the page",
      "Focus Not Obscured",
      "scroll-padding-block-end",
      "window.confirm",
      "Content-Security-Policy",
      "labels",
      "Intl.DateTimeFormat",
      "legal advice",
      "consentVersion",
    ])("covers %s", (topic) => {
      expect(markdown).toContain(topic);
    });

    it("translates only strings the elements really have", () => {
      const banner = labelKeys(
        "components/consent-banner/consent-banner-labels.ts",
        "ConsentBannerLabels",
      );
      const preferences = labelKeys(
        "components/consent-preferences/consent-preferences-labels.ts",
        "ConsentPreferencesLabels",
      );
      expect(banner).toContain("accept");
      expect(preferences).toContain("save");
      const [bannerExample = "", preferencesExample = ""] = codeBlocks(markdown)
        .filter((block) => block.includes("Partial<Consent"))
        .flatMap((block) => block.split(/(?=const PREFERENCES)/));
      const keysOf = (block: string) =>
        [...block.matchAll(/^ {2}(\w+): /gm)].map((match) => match[1] ?? "");
      expect(keysOf(bannerExample).length).toBeGreaterThan(3);
      expect(keysOf(bannerExample).filter((key) => !banner.includes(key))).toEqual([]);
      expect(keysOf(preferencesExample).filter((key) => !preferences.includes(key))).toEqual([]);
    });
  });

  it("are linked from the root README and from the components README", () => {
    for (const readme of ["README.md", join("packages", "components", "README.md")]) {
      const text = read(join(ROOT, readme));
      for (const guide of [...GUIDES, RULES])
        expect(text, `${readme} links ${guide}`).toContain(`docs/consent/${guide}`);
    }
  });
});
