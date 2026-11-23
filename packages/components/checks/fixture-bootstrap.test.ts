import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bootstrapScriptAttributes } from "@identgineer/variations/bootstrap-tag";

const FIXTURE = readFileSync(
  fileURLToPath(new URL("../fixtures/variation-switcher.html", import.meta.url)),
  "utf8",
);

// The fixture is static HTML, so its integrity attribute is written out. This is what keeps it
// from going stale when the registry (and so the built script) changes.
describe("the variation switcher fixture's bootstrap script", () => {
  const expected = bootstrapScriptAttributes("/variations/bootstrap.js");
  const tag = /<script\b[^>]*\bsrc="\/variations\/bootstrap\.js"[^>]*>/.exec(FIXTURE)?.[0] ?? "";

  it("is present, from the same origin", () => {
    expect(tag).not.toBe("");
  });

  it("carries the integrity of the script the package builds now", () => {
    expect(tag).toContain(`integrity="${expected.integrity}"`);
  });

  it("is a blocking classic script placed in the head before the stylesheets", () => {
    expect(tag).not.toMatch(/\b(?:async|defer|type)\b/);
    const head = FIXTURE.slice(0, FIXTURE.indexOf("</head>"));
    expect(head.indexOf("/variations/bootstrap.js")).toBeGreaterThan(-1);
    expect(head.indexOf("/variations/bootstrap.js")).toBeLessThan(head.indexOf("<link"));
  });
});
