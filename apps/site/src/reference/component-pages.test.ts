import { existsSync } from "node:fs";
import { BUNDLES } from "@identgineer/components/bundles";
import { describe, expect, it } from "vitest";
import type { ContentPage } from "../content/content-page.ts";
import {
  describeContentProblem,
  parseContentPage,
  type ContentResult,
} from "../content/validate-content-page.ts";
import { el, type ComponentExample } from "../examples/component-example.ts";
import { livePaths } from "../routes.ts";
import type { ComponentDoc } from "./component-docs.ts";
import {
  checkReference,
  componentIndexPage,
  componentPage,
  componentRoute,
  referencePages,
} from "./component-pages.ts";
import { groupComponents } from "./component-groups.ts";
import { DOCS_JSON, readDocsFile } from "./docs-file.ts";

const EMPTY: ComponentDoc = {
  tag: "idg-empty",
  summary: [],
  properties: [],
  events: [],
  methods: [],
  slots: [],
  parts: [],
  cssProperties: [],
};

const SAMPLE: ComponentDoc = {
  tag: "idg-sample",
  summary: ["A sample with `code`.", "A second paragraph, about `tone` and `size`."],
  properties: [
    {
      name: "tone",
      attribute: "tone",
      type: '"calm" | "loud"',
      default: '"calm"',
      description: "How it sounds.",
    },
    { name: "payload", type: "Payload | undefined", description: "" },
  ],
  events: [{ name: "idgPick", detail: "PickDetail", cancelable: true, description: "Picked." }],
  methods: [
    { signature: "setFocus() => Promise<void>", returns: "Promise<void>", description: "" },
  ],
  slots: [
    { name: "", description: "The label." },
    { name: "start", description: "Before the label." },
  ],
  parts: [{ name: "control", description: "The native control." }],
  cssProperties: [{ name: "--idg-sample-gap", description: "The gap." }],
};

const EXAMPLES: Readonly<Record<string, ComponentExample>> = {
  "idg-sample": {
    stage: "row",
    caption: "A sample, as it is.",
    nodes: [el("idg-sample", { tone: "loud" })],
  },
};

const t = (text: string) => ({ type: "text", text }) as const;
const code = (text: string) => ({ type: "text", text, code: true }) as const;

function validated(page: ContentPage, extra: readonly string[] = []): ContentResult {
  return parseContentPage(JSON.parse(JSON.stringify(page)), {
    paths: new Set([...livePaths(), ...extra]),
  });
}

describe("the page of one component", () => {
  it("is made of everything the package documents, in a fixed order, as text and code", () => {
    expect(componentPage(SAMPLE, EXAMPLES)).toEqual({
      slug: "idg-sample",
      title: "idg-sample",
      summary: "A sample with code.",
      seo: {},
      body: [
        {
          type: "paragraph",
          content: [
            t("A second paragraph, about "),
            code("tone"),
            t(" and "),
            code("size"),
            t("."),
          ],
        },
        { type: "heading", level: 2, text: "Example" },
        { type: "example", name: "idg-sample", caption: "A sample, as it is." },
        { type: "heading", level: 2, text: "Properties" },
        {
          type: "table",
          caption: "Properties of idg-sample",
          columns: ["Property", "Attribute", "Type", "Default", "Description"],
          rows: [
            [
              [code("tone")],
              [code("tone")],
              [code('"calm" | "loud"')],
              [code('"calm"')],
              [t("How it sounds.")],
            ],
            [
              [code("payload")],
              [t("None")],
              [code("Payload | undefined")],
              [t("None")],
              [t("Not documented")],
            ],
          ],
        },
        { type: "heading", level: 2, text: "Events" },
        {
          type: "table",
          caption: "Events of idg-sample",
          columns: ["Event", "Detail", "Cancelable", "Description"],
          rows: [[[code("idgPick")], [code("PickDetail")], [t("Yes")], [t("Picked.")]]],
        },
        { type: "heading", level: 2, text: "Methods" },
        {
          type: "table",
          caption: "Methods of idg-sample",
          columns: ["Method", "Returns", "Description"],
          rows: [
            [[code("setFocus() => Promise<void>")], [code("Promise<void>")], [t("Not documented")]],
          ],
        },
        { type: "heading", level: 2, text: "Slots" },
        {
          type: "table",
          caption: "Slots of idg-sample",
          columns: ["Slot", "Description"],
          rows: [
            [[t("Default")], [t("The label.")]],
            [[code("start")], [t("Before the label.")]],
          ],
        },
        { type: "heading", level: 2, text: "CSS parts" },
        {
          type: "table",
          caption: "CSS parts of idg-sample",
          columns: ["Part", "Description"],
          rows: [[[code("control")], [t("The native control.")]]],
        },
        { type: "heading", level: 2, text: "CSS custom properties" },
        {
          type: "table",
          caption: "CSS custom properties of idg-sample",
          columns: ["Name", "Description"],
          rows: [[[code("--idg-sample-gap")], [t("The gap.")]]],
        },
      ],
    });
  });

  it("is valid content, so the one renderer draws it", () => {
    const result = validated(componentPage(SAMPLE, {}));
    expect(result.ok ? "valid" : describeContentProblem(result.error)).toBe("valid");
  });

  it("has no example section for a component without an example, and says so in no way", () => {
    const page = componentPage(SAMPLE, {});
    expect(page.body.some((block) => block.type === "example")).toBe(false);
    expect(
      page.body.filter((block) => block.type === "heading").map((block) => block.text),
    ).toEqual(["Properties", "Events", "Methods", "Slots", "CSS parts", "CSS custom properties"]);
  });

  it("leaves out each section the component has nothing for, and has a lede when it has no docs", () => {
    expect(componentPage(EMPTY, {})).toEqual({
      slug: "idg-empty",
      title: "idg-empty",
      summary: "The idg-empty web component.",
      seo: {},
      body: [],
    });
  });

  it("takes the first sentence as the lede and leaves the rest of the paragraph first in the body", () => {
    const page = componentPage(
      {
        ...EMPTY,
        summary: ["A text field. Enter submits `form` as SubmitEvent.submitter is null. More."],
      },
      {},
    );
    expect(page.summary).toBe("A text field.");
    expect(page.body).toEqual([
      {
        type: "paragraph",
        content: [t("Enter submits "), code("form"), t(" as SubmitEvent.submitter is null. More.")],
      },
    ]);
  });

  it("keeps the first paragraph out of the body when it is one sentence", () => {
    const page = componentPage({ ...EMPTY, summary: ["One sentence, with `code`.", "Next."] }, {});
    expect(page.summary).toBe("One sentence, with code.");
    expect(page.body).toEqual([{ type: "paragraph", content: [t("Next.")] }]);
  });

  it("cuts a first sentence longer than a lede may be at a word, and goes on with the rest in the body", () => {
    const long = `${"Word ".repeat(100)}end. After.`;
    const page = componentPage({ ...EMPTY, summary: [long] }, {});
    expect(page.summary.length).toBeLessThanOrEqual(200);
    expect(page.summary.endsWith("…")).toBe(true);
    const spoken = page.summary.slice(0, -1);
    expect(spoken.split(" ").every((word) => word === "Word")).toBe(true);
    const [first] = page.body;
    expect(first?.type).toBe("paragraph");
    const rest = first?.type === "paragraph" ? first.content : [];
    const [run] = rest;
    expect(rest).toHaveLength(1);
    expect(run?.type === "text" ? run.text.startsWith("…Word") : false).toBe(true);
    // Said once: the lede and the body together are the paragraph, word for word.
    const continued = run?.type === "text" ? run.text.slice(1) : "";
    expect(`${spoken} ${continued}`).toBe(long);
  });

  it("splits a table of more than 60 rows into tables that each hold at most 60", () => {
    const many = Array.from({ length: 130 }, (_, index) => ({
      name: `prop${String(index)}`,
      type: "string",
      description: "",
    }));
    const page = componentPage({ ...EMPTY, properties: many }, {});
    const tables = page.body.filter((block) => block.type === "table");
    expect(tables.map((table) => table.rows.length)).toEqual([60, 60, 10]);
    expect(tables.map((table) => table.caption)).toEqual([
      "Properties of idg-empty, 1 to 60",
      "Properties of idg-empty, 61 to 120",
      "Properties of idg-empty, 121 to 130",
    ]);
    expect(validated(page).ok).toBe(true);
  });

  it("reads backticks in text as code, and nothing else in it as anything", () => {
    const markup = '<img src=x onerror="alert(1)"> `<b>` **bold** [link](javascript:alert(1)) `';
    const page = componentPage({ ...EMPTY, summary: ["Lede.", markup] }, {});
    expect(page.body).toEqual([
      {
        type: "paragraph",
        content: [
          t('<img src=x onerror="alert(1)"> '),
          code("<b>"),
          t(" **bold** [link](javascript:alert(1)) `"),
        ],
      },
    ]);
  });

  it("falls back to plain text when a description has more code spans than a cell may hold", () => {
    const spans = Array.from({ length: 80 }, (_, index) => `\`s${String(index)}\``).join(" ");
    const page = componentPage({ ...EMPTY, summary: ["Lede.", spans] }, {});
    expect(page.body).toEqual([{ type: "paragraph", content: [t(spans)] }]);
  });

  it("stays valid, whatever docs.json holds, when its text is at the bounds", () => {
    const long = "x".repeat(2_000);
    const hostile: ComponentDoc = {
      tag: "idg-hostile",
      summary: [long, `<script>alert(1)</script>${"y".repeat(1_900)}`],
      properties: [
        {
          name: long.slice(0, 200),
          attribute: long.slice(0, 200),
          type: long,
          default: long,
          description: long,
        },
      ],
      events: [{ name: "e".repeat(200), detail: long, cancelable: false, description: long }],
      methods: [{ signature: long, returns: long, description: long }],
      slots: [{ name: "s".repeat(200), description: long }],
      parts: [{ name: "p".repeat(200), description: long }],
      cssProperties: [{ name: "--" + "c".repeat(198), description: long }],
    };
    const result = validated(componentPage(hostile, {}));
    expect(result.ok ? "valid" : describeContentProblem(result.error)).toBe("valid");
  });
});

describe("the route of a component's page", () => {
  it("is a page of the components section, found by the component's tag", () => {
    expect(componentRoute(SAMPLE)).toEqual({
      path: "/components/idg-sample/",
      parent: "/components/",
      label: "idg-sample",
      title: "idg-sample",
      description: "idg-sample: A sample with code.",
      status: "live",
      component: "site-content-page",
      content: "idg-sample",
    });
  });

  it("describes a page for search in at most 160 characters", () => {
    const route = componentRoute({ ...EMPTY, summary: ["Word ".repeat(100)] });
    expect(route.description.length).toBeLessThanOrEqual(160);
    expect(route.description.startsWith("idg-empty: Word")).toBe(true);
  });

  it("ends a description at a whole word, with an ellipsis", () => {
    const route = componentRoute({ ...EMPTY, summary: ["Word ".repeat(100)] });
    expect(route.description.endsWith("…")).toBe(true);
    const words = route.description.slice(0, -1).split(" ");
    expect(words.slice(1).every((word) => word === "Word")).toBe(true);
  });
});

describe("the index of the components", () => {
  const groups = groupComponents(
    [SAMPLE, { ...EMPTY, summary: ["First sentence. Second sentence."] }],
    [
      { name: "controls", components: ["idg-sample"] },
      { name: "chips", components: ["idg-empty"] },
    ],
  );

  it("ends a line of the index at a whole word, never inside one", () => {
    const long = `${"Alphabetical ".repeat(30)}end.`;
    const [group] = groupComponents(
      [{ ...EMPTY, summary: [long] }],
      [{ name: "controls", components: ["idg-empty"] }],
    );
    const index = componentIndexPage(group ? [group] : []);
    const table = index.body.find((block) => block.type === "table");
    const cell = table?.type === "table" ? table.rows[0]?.[1]?.[0] : undefined;
    const said = cell?.type === "text" ? cell.text : "";
    expect(said.length).toBeLessThanOrEqual(140);
    expect(said.endsWith("…")).toBe(true);
    expect(
      said
        .slice(0, -1)
        .split(" ")
        .every((word) => word === "Alphabetical"),
    ).toBe(true);
  });

  it("is a table of each group's components, each linked to its page with its first sentence", () => {
    expect(componentIndexPage(groups)).toEqual({
      slug: "components",
      title: "Components",
      summary:
        "Every idg- web component, with its properties, events, slots and parts and a live example of each, generated from the component library.",
      seo: {},
      body: [
        {
          type: "paragraph",
          content: [
            t(
              "2 components in 2 groups, as the library loads them. Every page is generated from the library's own documentation, so a component added to it appears here.",
            ),
          ],
        },
        { type: "heading", level: 2, text: "Controls and feedback" },
        {
          type: "paragraph",
          content: [
            t("The small parts every interface is made of: buttons, links, badges and notices."),
          ],
        },
        {
          type: "table",
          caption: "Controls and feedback",
          columns: ["Component", "Summary"],
          rows: [
            [
              [{ type: "link", href: "/components/idg-sample/", text: "idg-sample" }],
              [t("A sample with code.")],
            ],
          ],
        },
        { type: "heading", level: 2, text: "Chips" },
        {
          type: "table",
          caption: "Chips",
          columns: ["Component", "Summary"],
          rows: [
            [
              [{ type: "link", href: "/components/idg-empty/", text: "idg-empty" }],
              [t("First sentence.")],
            ],
          ],
        },
      ],
    });
  });

  it("is valid content that links only to pages of the generated routes", () => {
    const result = validated(componentIndexPage(groups), [
      "/components/idg-sample/",
      "/components/idg-empty/",
    ]);
    expect(result.ok ? "valid" : describeContentProblem(result.error)).toBe("valid");
    expect(validated(componentIndexPage(groups)).ok).toBe(false);
  });
});

describe("the whole reference", () => {
  it("is the index and a page for each component, and a component added appears in all of it", () => {
    const docs = [SAMPLE, { ...EMPTY, tag: "idg-ninth" }];
    const reference = referencePages(
      docs,
      [{ name: "controls", components: ["idg-sample"] }],
      EXAMPLES,
    );
    expect(reference.index.body.filter((block) => block.type === "table")).toHaveLength(2);
    expect(reference.components.map(({ route }) => route.path)).toEqual([
      "/components/idg-sample/",
      "/components/idg-ninth/",
    ]);
    expect(reference.components.map(({ page }) => page.slug)).toEqual(["idg-sample", "idg-ninth"]);
    const index = JSON.stringify(reference.index);
    expect(index).toContain("/components/idg-ninth/");
    expect(index).toContain("Other components");
  });
});

describe("checking the whole reference before it is written", () => {
  it("accepts a reference of valid pages", () => {
    expect(() => {
      checkReference(
        referencePages([SAMPLE], [{ name: "controls", components: ["idg-sample"] }], {}),
      );
    }).not.toThrow();
  });

  it("names the component whose page the content format refuses, and why", () => {
    const long = "x".repeat(2_000);
    const heavy: ComponentDoc = {
      ...EMPTY,
      tag: "idg-heavy",
      properties: Array.from({ length: 30 }, (_, index) => ({
        name: `prop${String(index)}`,
        type: long,
        default: long,
        description: long,
      })),
    };
    expect(() => {
      checkReference(referencePages([SAMPLE, heavy], [], {}));
    }).toThrow(/^The page of idg-heavy is not valid content: .*text/);
  });
});

// Reads docs.json, a build output of the components package: CI builds it first, and a machine
// that has not built it skips the checks.
describe.skipIf(!existsSync(DOCS_JSON) && process.env.CI === undefined)(
  "the reference of the real components",
  () => {
    const reference = referencePages(readDocsFile(DOCS_JSON), BUNDLES);
    const paths = reference.components.map(({ route }) => route.path);

    it("has a valid page for every component and a valid index", () => {
      const problems = [reference.index, ...reference.components.map(({ page }) => page)].flatMap(
        (page) => {
          const result = validated(page, paths);
          return result.ok ? [] : [`${page.slug}: ${describeContentProblem(result.error)}`];
        },
      );
      expect(problems).toEqual([]);
    });

    it("gives every component a lede of its own, so no page is left with a placeholder", () => {
      const bare = reference.components
        .filter(
          ({ page }) => page.summary.startsWith("The ") && page.summary.endsWith(" web component."),
        )
        .map(({ page }) => page.slug);
      expect(bare, "components with no description in their doc comment").toEqual([]);
    });

    it("gives every component a live example in its page", () => {
      const without = reference.components
        .filter(({ page }) => !page.body.some((block) => block.type === "example"))
        .map(({ page }) => page.slug);
      expect(without).toEqual([]);
    });
  },
);
