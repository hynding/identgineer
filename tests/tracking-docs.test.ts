import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as tracking from "../packages/tracking/src/index.ts";
import * as wire from "../packages/tracking/src/wire.ts";
import { STORAGE_KEYS } from "../packages/tracking/src/storage-keys.ts";
import { codeBlocks, importsOf, namesIn } from "./docs-code.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), "utf8");

const README = read("packages", "tracking", "README.md");
const SOURCE = (file: string) => read("packages", "tracking", "src", file);

const TYPE_NAMES = namesIn(SOURCE("index.ts"), /export type \{([^}]*)\}/g);
const WIRE_TYPE_NAMES = namesIn(SOURCE("wire.ts"), /export type \{([^}]*)\}/g);

const isExported = (source: string, name: string, typeOnly: boolean): boolean => {
  switch (source) {
    case "@identgineer/tracking":
      return name in tracking || (typeOnly && TYPE_NAMES.has(name));
    case "@identgineer/tracking/wire":
      return name in wire || (typeOnly && WIRE_TYPE_NAMES.has(name));
    default:
      return false;
  }
};

/** The members of an interface, from its source, so a new option cannot go undocumented. */
const membersOf = (file: string, name: string): string[] => {
  const body = SOURCE(file).split(`export interface ${name} {`)[1]?.split(/^\}/m)[0] ?? "";
  return [...body.matchAll(/^ {2}readonly (\w+)\??:/gm)].map((match) => match[1] ?? "");
};

describe("the tracking README", () => {
  it("documents every option, with its default in the same table row", () => {
    const rows = README.split("\n").filter((line) => line.startsWith("|"));
    const options = membersOf("tracker-types.ts", "TrackerOptions");
    expect(options).toContain("flushInterval");
    for (const option of options) {
      expect(
        rows.some((row) => row.startsWith(`| \`${option}\``)),
        `option ${option}`,
      ).toBe(true);
    }
    for (const [option, value] of Object.entries(tracking.TRACKER_DEFAULTS)) {
      const shown = (Array.isArray(value) ? "[]" : String(value)).replace(
        /[[\]]/g,
        String.raw`\$&`,
      );
      const row = rows.find((line) => line.startsWith(`| \`${option}\``));
      expect(row, `default of ${option}`).toMatch(new RegExp(String.raw`\|\s*\`${shown}\`\s*\|`));
    }
  });

  it("documents every method of the tracker and of its consent", () => {
    for (const method of membersOf("tracker-types.ts", "Tracker").filter((m) => m !== "consent")) {
      expect(README, method).toContain(`\`${method}(`);
    }
    for (const method of membersOf("tracker-types.ts", "ConsentApi")) {
      expect(README, method).toContain(`\`consent.${method}(`);
    }
  });

  it("lists every drop code and every key the SDK stores", () => {
    const codes = namesIn(
      SOURCE("drop-reason.ts").replace(/\|/g, ","),
      /export type DropCode =([^;]*);/g,
    );
    expect(codes.size).toBeGreaterThan(5);
    for (const code of [...codes].map((entry) => entry.replace(/"/g, ""))) {
      expect(README, code).toContain(`\`${code}\``);
    }
    for (const key of Object.values(STORAGE_KEYS)) expect(README, key).toContain(`\`${key}\``);
  });

  it("imports only names the package exports, from entry points it has", () => {
    const imports = importsOf(README, ["tracking"]);
    expect(imports.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "createTracker",
        "parseTrackingBatchText",
        "MAX_TRACKING_BATCH_BYTES",
      ]),
    );
    const missing = imports
      .filter(({ source, name, typeOnly }) => !isExported(source, name, typeOnly))
      .map(({ source, name }) => `${name} from ${source}`);
    expect(missing).toEqual([]);
  });

  it("shows a wire example that the validator accepts", () => {
    const example = codeBlocks(README).find((block) => block.trimStart().startsWith("{"));
    expect(example).toBeDefined();
    expect(wire.parseTrackingBatch(JSON.parse(example ?? "null")).ok).toBe(true);
  });

  it.each([
    "X-Idg-Write-Key",
    "is in the JSON body of a\n  beacon",
    "cannot be recalled",
    "origin allowlist",
    "rate limits",
    "schema validation",
    "scoped to one property",
    "public and write-only",
    "Global Privacy Control",
    "Do Not Track",
    "never in the URL",
    'reason: "gpc"',
    "TRACKING_BATCH_JSON_SCHEMA",
    "Other identifiers in a path segment",
    "the server must cap the body while",
    "returns **the same instance**",
    "`transport`",
    "merged by event id",
  ])("covers %s", (topic) => {
    expect(README).toContain(topic);
  });

  it("has the table of what is collected and what never is", () => {
    expect(README).toMatch(/\| Collected\s+\| Never collected\s+\|/);
  });

  it("is linked from the root README", () => {
    expect(read("README.md")).toContain("packages/tracking/README.md");
  });
});
