import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * The parts CI runs the site's browser suite in, each a job of its own of a few minutes on two
 * workers. Playwright's shards split by the number of tests, not their length, so the fit sweep's
 * tests carry a tag that names their part (by engine, then by page), the axe sweep of the looks one
 * of its own, the layouts suite another, and the last part is every test without a tag.
 *
 * Run one with `node browser/parts.ts <part>`, and check with `node browser/parts.ts --check` that
 * the parts hold every test of the suite exactly once.
 */
export const ENGINE_KEYS = ["chromium", "no-calc-size", "no-style-queries"] as const;

/**
 * The pages whose fit sweep is a part of its own in each engine, by the part's name: the two longest
 * of the original sweeps together, the components' index and a component's page together, and the
 * gallery, which is swept at seven widths, alone.
 */
const OWN_PART: Readonly<Record<string, string>> = {
  "/": "1",
  "/identity/": "1",
  "/components/": "reference",
  "/components/idg-input/": "reference",
  "/variations/": "gallery",
};
const OTHER_PART = "2";
const PART_NAMES = ["1", OTHER_PART, "reference", "gallery"] as const;

export type EngineKey = (typeof ENGINE_KEYS)[number];

/** The tag of a fit test, which names the part it runs in. */
export function fitTag(engine: EngineKey, path: string): string {
  return `@fit-${engine}-${OWN_PART[path] ?? OTHER_PART}`;
}

/**
 * The suite of every layout with every look, which is as long as the rest of the untagged suites
 * together, so it is a part of its own and the last part is every untagged suite but this one. A
 * file filter is a regular expression on the path, so the last part names it as a negative.
 */
const LAYOUTS_FILE = "layouts.browser";

/** The tag of the axe sweep of every page in every look, a part of its own. */
export const AXE_TAG = "@axe";

const FIT_TAGS = ENGINE_KEYS.flatMap((engine) =>
  PART_NAMES.map((part) => `@fit-${engine}-${part}`),
);

/** Each part by its short name, as Playwright's filter arguments. */
export const PARTS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(FIT_TAGS.map((tag) => [tag.slice("@fit-".length), ["--grep", tag]])),
  axe: ["--grep", AXE_TAG],
  layouts: ["--grep-invert", `@fit-|${AXE_TAG}`, LAYOUTS_FILE],
  rest: ["--grep-invert", `@fit-|${AXE_TAG}`, `^(?!.*${LAYOUTS_FILE.replace(".", "\\.")})`],
};

const SITE = fileURLToPath(new URL("..", import.meta.url));

function playwright(args: readonly string[]) {
  return spawnSync("pnpm", ["exec", "playwright", "test", ...args], {
    cwd: SITE,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** The tests a filter selects, one line each, as `--list` names them. */
function listed(filter: readonly string[]): string[] {
  const result = playwright(["--list", "--reporter=list", ...filter]);
  if (result.status !== 0) throw new Error(`playwright --list ${filter.join(" ")} failed`);
  return result.stdout.split("\n").filter((line) => line.includes(" › "));
}

/** What is wrong with the parts: a test in none of them, or in more than one. */
export function partProblems(
  all: readonly string[],
  parts: Readonly<Record<string, readonly string[]>>,
): string[] {
  const counts = new Map(all.map((test) => [test, [] as string[]]));
  const problems: string[] = [];
  for (const [part, tests] of Object.entries(parts)) {
    for (const test of tests) {
      const holders = counts.get(test);
      if (holders) holders.push(part);
      else problems.push(`${test.trim()}: in ${part}, but not in the whole suite`);
    }
  }
  for (const [test, holders] of counts) {
    if (holders.length !== 1) {
      problems.push(`${test.trim()}: in ${holders.length === 0 ? "no part" : holders.join(", ")}`);
    }
  }
  return problems;
}

function main(args: readonly string[]): number {
  const [name, ...rest] = args;
  if (name === "--check") {
    const all = listed([]);
    const parts = Object.fromEntries(
      Object.entries(PARTS).map(([part, filter]) => [part, listed(filter)]),
    );
    const problems = partProblems(all, parts);
    for (const problem of problems) console.error(problem);
    const sizes = Object.entries(parts).map(([part, tests]) => `${part} ${String(tests.length)}`);
    console.log(`${String(all.length)} tests in ${sizes.join(", ")}`);
    return problems.length === 0 ? 0 : 1;
  }
  const filter = name === undefined ? undefined : PARTS[name];
  if (filter === undefined) {
    console.error(`Name a part: ${Object.keys(PARTS).join(", ")}, or --check`);
    return 2;
  }
  return (
    spawnSync("pnpm", ["exec", "playwright", "test", "--trace", "off", ...filter, ...rest], {
      cwd: SITE,
      stdio: "inherit",
    }).status ?? 1
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2));
