import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadBatchVectors } from "../../packages/tracking/src/testing/batch-vectors.ts";

// strapi-php's validator and normaliser on the shared vectors with plain PHP, so CI runs them
// without a Laravel app (the PHPUnit suite needs one, and runs in pnpm contract:live). Required on
// CI, whose runner has PHP; skipped, saying so, on a machine without it.

const file = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const BATCH_VECTORS = file("../../packages/tracking/src/testing/batch-vectors.json");
const NORMALISE_VECTORS = file("./fixtures/ingest-normalise-vectors.json");

const php = spawnSync("php", ["-r", "echo PHP_VERSION;"], { encoding: "utf8" });
const hasPhp = php.status === 0;
const required = process.env.CI !== undefined && process.env.CI !== "";

interface Answers {
  readonly batches: { name: string; accepted: boolean }[];
  readonly paths: string[];
  readonly referrers: (string | null)[];
  readonly dedupeKey: string;
}

const run = (): Answers => {
  const result = spawnSync(
    "php",
    [file("./ingest-php-vectors.php"), BATCH_VECTORS, NORMALISE_VECTORS],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0) throw new Error(`php failed: ${result.stderr}${result.stdout}`);
  return JSON.parse(result.stdout) as Answers;
};

describe("the PHP runtime for strapi-php's ingestion tests", () => {
  it.runIf(required)("is present on CI", () => {
    expect(hasPhp, "CI must have PHP to run the strapi-php validator on the shared vectors").toBe(
      true,
    );
  });
});

describe.skipIf(!hasPhp)(
  `strapi-php's validator and normaliser on the shared vectors, with plain PHP${hasPhp ? "" : " (skipped: no php on PATH)"}`,
  () => {
    const answers = hasPhp ? run() : ({} as Answers);

    it("accepts and refuses each batch as parseTrackingBatch does", () => {
      const vectors = loadBatchVectors();
      expect(answers.batches).toEqual(
        vectors.map((vector) => ({ name: vector.name, accepted: vector.valid })),
      );
    });

    it("stores each path and referrer as the Strapi handler does", () => {
      const normalise = JSON.parse(readFileSync(NORMALISE_VECTORS, "utf8")) as {
        paths: { stored: string }[];
        referrers: { stored: string | null }[];
      };
      expect(answers.paths).toEqual(normalise.paths.map((vector) => vector.stored));
      expect(answers.referrers).toEqual(normalise.referrers.map((vector) => vector.stored));
    });

    it("derives the dedupe key the Strapi handler derives", () => {
      expect(answers.dedupeKey).toBe(
        "8d843a1ceb571c66e03617ae03248b8440bf598a58914236a75b24ed41084031",
      );
    });
  },
);
