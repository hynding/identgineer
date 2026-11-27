import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSummaryVectors, SUMMARY_VECTORS_PATH } from "./summary-vectors.ts";

// strapi-php's property summary (protected/app/Summary) on the shared vectors with plain PHP and
// sqlite, so CI holds both targets to one set of answers without a Laravel app (the endpoint's
// PHPUnit tests need one, and run in pnpm contract:live). Required on CI, whose runner has PHP
// with pdo_sqlite; skipped, saying so, on a machine without PHP.

const script = fileURLToPath(new URL("./summary-php-vectors.php", import.meta.url));
const php = spawnSync("php", ["-r", "echo extension_loaded('pdo_sqlite') ? 'yes' : 'no';"], {
  encoding: "utf8",
});
const hasPhp = php.status === 0;
const required = process.env.CI !== undefined && process.env.CI !== "";

describe("the PHP runtime for strapi-php's summary tests", () => {
  it.runIf(required)("is present on CI, with pdo_sqlite", () => {
    expect(hasPhp, "CI must have PHP to run strapi-php's summary on the shared vectors").toBe(true);
    expect(php.stdout).toBe("yes");
  });
});

describe.skipIf(!hasPhp)(
  `strapi-php's summary on the shared vectors, with plain PHP${hasPhp ? "" : " (skipped: no php on PATH)"}`,
  () => {
    const vectors = loadSummaryVectors();
    const run = () => {
      const result = spawnSync("php", [script, SUMMARY_VECTORS_PATH], { encoding: "utf8" });
      if (result.status !== 0) throw new Error(`php failed: ${result.stderr}${result.stdout}`);
      return JSON.parse(result.stdout) as {
        answers: { name: string; figures: unknown }[];
        sql: Record<string, { buckets: string; visitors: string }>;
      };
    };
    const { answers, sql } = hasPhp && php.stdout === "yes" ? run() : { answers: [], sql: {} };

    it("ran on every vector", () => {
      expect(php.stdout, "PHP needs pdo_sqlite for these tests").toBe("yes");
      expect(answers.map((answer) => answer.name)).toEqual(vectors.map((vector) => vector.name));
    });

    // MySQL's and MariaDB's default collations fold case; session ids are base64url.
    it("counts distinct sessions by their bytes on mysql and mariadb, and leaves sqlite and pgsql as they are", () => {
      expect(sql.pgsql).toEqual(sql.sqlite);
      expect(JSON.stringify(sql.sqlite)).not.toMatch(/BINARY/);
      for (const driver of ["mysql", "mariadb"]) {
        const queries = sql[driver];
        expect(queries?.buckets).toContain("CAST(session_id AS BINARY) AS session_id");
        expect(queries?.visitors.match(/THEN CAST\(session_id AS BINARY\) END/g)).toHaveLength(2);
      }
    });

    it.each(vectors.map((vector, index) => [vector.name, index] as const))("%s", (_name, index) => {
      expect(answers[index]?.figures).toEqual(vectors[index]?.expected);
    });
  },
);
