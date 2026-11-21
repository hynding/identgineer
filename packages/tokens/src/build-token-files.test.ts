import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildTokenFiles, type TokenSources } from "./build-token-files.ts";

function readText(relative: string, base: "__fixtures__" | "__golden__"): string {
  return readFileSync(
    fileURLToPath(new URL(`./${base}/mini/${relative}`, import.meta.url)),
    "utf8",
  );
}

function readFixture(relative: string): unknown {
  return JSON.parse(readText(relative, "__fixtures__"));
}

function miniSources(): TokenSources {
  return {
    shared: [{ file: "mini/shared.json", json: readFixture("shared.json") }],
    themes: [
      { id: "alpha", file: "mini/themes/alpha.json", json: readFixture("themes/alpha.json") },
      { id: "beta", file: "mini/themes/beta.json", json: readFixture("themes/beta.json") },
    ],
    defaultThemeId: "alpha",
  };
}

describe("buildTokenFiles", () => {
  const files = buildTokenFiles(miniSources());

  it.each(["tokens.css", "themes/alpha.css", "themes/beta.css"])(
    "emits %s byte-for-byte as the golden file",
    (name) => {
      expect(files[name]).toBe(readText(name, "__golden__"));
    },
  );

  it("emits index.css as one layer statement followed by every stylesheet body", () => {
    const index = files["index.css"];
    expect(index?.match(/@layer idg\.tokens, idg\.theme;/g)).toHaveLength(1);
    expect(index).toContain("--idg-motion-duration-base: 200ms;");
    expect(index).toContain('[data-theme="alpha"]');
    expect(index).toContain('[data-theme="beta"]');
    expect(index?.indexOf("@layer idg.tokens {")).toBeLessThan(
      index?.indexOf("@layer idg.theme {") ?? -1,
    );
  });

  it("is idempotent: a second build is byte-identical", () => {
    expect(buildTokenFiles(miniSources())).toEqual(files);
    expect(JSON.stringify(buildTokenFiles(miniSources()))).toBe(JSON.stringify(files));
  });

  it("does not emit internal palette or stack tokens", () => {
    expect(files["index.css"]).not.toContain("palette");
    expect(files["index.css"]).not.toContain("--idg-stack");
  });

  it("rejects an invalid colour naming file and token", () => {
    const sources = miniSources();
    const broken = {
      color: { $type: "color", bg: { $value: "#12345" } },
    };
    expect(() =>
      buildTokenFiles({
        ...sources,
        shared: [...sources.shared, { file: "mini/broken.json", json: broken }],
      }),
    ).toThrow('invalid colour "#12345" for token "color.bg" in mini/broken.json');
  });

  it("rejects two tokens that map to the same custom property", () => {
    const sources = miniSources();
    const clash = {
      color: {
        $type: "color",
        "bg-subtle": { $value: "#000000" },
        bg: { subtle: { $value: "#000000" } },
      },
    };
    expect(() =>
      buildTokenFiles({
        ...sources,
        shared: [...sources.shared, { file: "mini/clash.json", json: clash }],
      }),
    ).toThrow("--idg-color-bg-subtle");
  });

  it("rejects a default theme that is not in the list", () => {
    expect(() => buildTokenFiles({ ...miniSources(), defaultThemeId: "gamma" })).toThrow(
      'default theme "gamma"',
    );
  });
});
