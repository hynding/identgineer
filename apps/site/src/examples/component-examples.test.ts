import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOCS_JSON, readDocsFile } from "../reference/docs-file.ts";
import { COMPONENT_EXAMPLES, COMPONENT_EXAMPLE_NAMES } from "./component-examples.ts";
import { exampleElements, usageSnippet, type ExampleElement } from "./component-example.ts";

// Reads docs.json, a build output of the components package. CI builds it first and a missing
// file fails there; on a machine that has not built it, the checks are skipped.
const described = existsSync(DOCS_JSON) || process.env.CI !== undefined;

/** The elements of the page that are not components: what an example may put around them. */
const PLAIN_ELEMENTS = new Set([
  ...["div", "p", "span", "strong", "em", "ul", "li", "a", "code", "option"],
  ...["table", "caption", "thead", "tbody", "tr", "th", "td"],
]);

describe("the registry of live examples of the components", () => {
  it("names each example by the tag of its component, in the components' order", () => {
    expect(COMPONENT_EXAMPLE_NAMES).toEqual(Object.keys(COMPONENT_EXAMPLES));
    expect(COMPONENT_EXAMPLE_NAMES.every((name) => /^idg-[a-z0-9-]+$/.test(name))).toBe(true);
  });

  it("gives every example a caption and something to draw", () => {
    for (const [name, example] of Object.entries(COMPONENT_EXAMPLES)) {
      expect(example.caption.trim(), name).not.toBe("");
      expect(example.nodes.length, name).toBeGreaterThan(0);
    }
  });

  it("never gives an element a handler, a style or a link that leaves the page", () => {
    for (const [name, example] of Object.entries(COMPONENT_EXAMPLES)) {
      for (const element of exampleElements(example.nodes)) {
        for (const [attribute, value] of Object.entries(element.attributes ?? {})) {
          expect(attribute, `${name}: ${element.tag}`).not.toMatch(/^on|^style$|^src(set)?$/i);
          if (attribute === "href" && typeof value === "string") {
            expect(value, `${name}: ${element.tag}`).toMatch(/^#|^\//);
          }
        }
      }
    }
  });

  it("writes a snippet that holds every tag the example draws", () => {
    for (const [name, example] of Object.entries(COMPONENT_EXAMPLES)) {
      const snippet = usageSnippet(example.nodes);
      expect(snippet, name).toContain(`<${name}`);
      for (const element of exampleElements(example.nodes)) {
        expect(snippet, name).toContain(`<${element.tag}`);
      }
    }
  });
});

describe.skipIf(!described)("the registry against the components package's docs", () => {
  const docs = existsSync(DOCS_JSON) ? readDocsFile(DOCS_JSON) : [];
  const documented = new Map(docs.map((doc) => [doc.tag, doc]));

  it("has an example for every component, so a component added without one fails here", () => {
    const missing = docs.map((doc) => doc.tag).filter((tag) => !(tag in COMPONENT_EXAMPLES));
    expect(missing, "components without a live example").toEqual([]);
  });

  it("has no example for a component the package no longer has", () => {
    const stale = COMPONENT_EXAMPLE_NAMES.filter((name) => !documented.has(name));
    expect(stale).toEqual([]);
  });

  it("draws only components the package documents and plain elements", () => {
    const unknown = new Set<string>();
    for (const example of Object.values(COMPONENT_EXAMPLES)) {
      for (const element of exampleElements(example.nodes)) {
        if (!documented.has(element.tag) && !PLAIN_ELEMENTS.has(element.tag)) {
          unknown.add(element.tag);
        }
      }
    }
    expect([...unknown]).toEqual([]);
  });

  it("sets only attributes the component documents, to a value that is in its type", () => {
    const wrong: string[] = [];
    const check = (element: ExampleElement): void => {
      const doc = documented.get(element.tag);
      for (const [attribute, value] of Object.entries(element.attributes ?? {})) {
        if (doc === undefined || attribute === "slot" || attribute === "id") continue;
        const property = doc.properties.find(
          (candidate) => (candidate.attribute ?? "") === attribute,
        );
        if (property === undefined) {
          wrong.push(`${element.tag} has no attribute ${attribute}`);
          continue;
        }
        const allowed = [...property.type.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
        if (typeof value === "string" && allowed.length > 0 && !allowed.includes(value)) {
          wrong.push(`${element.tag} ${attribute}="${value}" is not one of ${allowed.join(", ")}`);
        }
        if (value === true && property.type !== "boolean") {
          wrong.push(`${element.tag} ${attribute} is set bare but is ${property.type}`);
        }
      }
    };
    for (const example of Object.values(COMPONENT_EXAMPLES)) {
      for (const element of exampleElements(example.nodes)) check(element);
    }
    expect(wrong).toEqual([]);
  });

  it("sets only properties the component documents, and gives every client a component asks for", () => {
    const wrong: string[] = [];
    for (const example of Object.values(COMPONENT_EXAMPLES)) {
      for (const element of exampleElements(example.nodes)) {
        const doc = documented.get(element.tag);
        for (const name of Object.keys(element.properties ?? {})) {
          if (!doc?.properties.some((property) => property.name === name)) {
            wrong.push(`${element.tag} has no property ${name}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
    // A component that asks a client or a consent object draws nothing without one.
    for (const tag of ["idg-consent-banner", "idg-consent-preferences"]) {
      const [element] = COMPONENT_EXAMPLES[tag as keyof typeof COMPONENT_EXAMPLES].nodes;
      expect(Object.keys(element.properties ?? {}), tag).toEqual(["consent"]);
    }
    for (const tag of ["idg-session-guard", "idg-user-menu"]) {
      const [element] = COMPONENT_EXAMPLES[tag as keyof typeof COMPONENT_EXAMPLES].nodes;
      expect(Object.keys(element.properties ?? {}), tag).toEqual(["client"]);
    }
  });

  it("puts a child in a slot only where its parent has that slot", () => {
    const wrong: string[] = [];
    const walk = (element: ExampleElement): void => {
      const doc = documented.get(element.tag);
      for (const child of element.children ?? []) {
        if (typeof child === "string") continue;
        const slot = child.attributes?.slot;
        if (
          typeof slot === "string" &&
          doc &&
          !doc.slots.some((candidate) => candidate.name === slot)
        ) {
          wrong.push(`${element.tag} has no slot ${slot}`);
        }
        walk(child);
      }
    };
    for (const example of Object.values(COMPONENT_EXAMPLES)) {
      for (const node of example.nodes) if (typeof node !== "string") walk(node);
    }
    expect(wrong).toEqual([]);
  });
});
