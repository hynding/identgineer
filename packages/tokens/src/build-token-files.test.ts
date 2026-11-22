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
    designs: [
      { id: "plain", file: "mini/designs/plain.json", json: readFixture("designs/plain.json") },
      { id: "bold", file: "mini/designs/bold.json", json: readFixture("designs/bold.json") },
    ],
    layouts: [
      { id: "roomy", file: "mini/layouts/roomy.json", json: readFixture("layouts/roomy.json") },
      { id: "snug", file: "mini/layouts/snug.json", json: readFixture("layouts/snug.json") },
    ],
    uxModes: [
      { id: "steady", file: "mini/ux/steady.json", json: readFixture("ux/steady.json") },
      { id: "swift", file: "mini/ux/swift.json", json: readFixture("ux/swift.json") },
    ],
    preferences: { file: "mini/preferences.json", json: readFixture("preferences.json") },
    defaultThemeId: "alpha",
    defaultDesignId: "plain",
    defaultLayoutId: "roomy",
    defaultUxModeId: "steady",
  };
}

describe("buildTokenFiles", () => {
  const files = buildTokenFiles(miniSources());

  it.each([
    "tokens.css",
    "themes/alpha.css",
    "themes/beta.css",
    "designs/plain.css",
    "designs/bold.css",
    "layouts/roomy.css",
    "layouts/snug.css",
    "ux/steady.css",
    "ux/swift.css",
    "preferences.css",
  ])("emits %s byte-for-byte as the golden file", (name) => {
    expect(files[name]).toBe(readText(name, "__golden__"));
  });

  it("emits index.css as one layer statement followed by every stylesheet body", () => {
    const index = files["index.css"];
    expect(
      index?.match(
        /@layer idg\.tokens, idg\.theme, idg\.design, idg\.layout, idg\.ux, idg\.brand, idg\.preferences;/g,
      ),
    ).toHaveLength(1);
    expect(index).toContain("--idg-motion-duration-base: 200ms;");
    expect(index).toContain('[data-theme="alpha"]');
    expect(index).toContain('[data-theme="beta"]');
    expect(index).toContain('[data-layout="snug"]');
    const positions = [
      "@layer idg.tokens {",
      "@layer idg.theme {",
      "@layer idg.design {",
      "@layer idg.layout {",
      "@layer idg.ux {",
      "@layer idg.preferences {",
    ].map((marker) => index?.indexOf(marker) ?? -1);
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("makes only the default design, layout and UX mode answer to a bare :root", () => {
    expect(files["designs/plain.css"]).toContain(":where(:root)");
    expect(files["designs/bold.css"]).not.toContain(":root");
    expect(files["layouts/roomy.css"]).toContain(":where(:root)");
    expect(files["layouts/snug.css"]).not.toContain(":root");
    expect(files["ux/steady.css"]).toContain(":where(:root)");
    expect(files["ux/swift.css"]).not.toContain(":root");
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

  it.each([
    ["defaultDesignId", 'default design "gamma"'],
    ["defaultLayoutId", 'default layout "gamma"'],
    ["defaultUxModeId", 'default UX mode "gamma"'],
  ] as const)("rejects %s that is not in the list", (key, message) => {
    expect(() => buildTokenFiles({ ...miniSources(), [key]: "gamma" })).toThrow(message);
  });

  it("rejects a design that omits its label, naming the file", () => {
    const sources = miniSources();
    expect(() =>
      buildTokenFiles({
        ...sources,
        designs: [{ id: "plain", file: "mini/designs/nameless.json", json: { tokens: {} } }],
      }),
    ).toThrow('mini/designs/nameless.json: design "plain" needs $extensions.identgineer.label');
  });

  it("rejects a layout that omits its label, naming the file", () => {
    const sources = miniSources();
    expect(() =>
      buildTokenFiles({
        ...sources,
        layouts: [{ id: "roomy", file: "mini/layouts/nameless.json", json: { tokens: {} } }],
      }),
    ).toThrow('mini/layouts/nameless.json: layout "roomy" needs $extensions.identgineer.label');
  });

  it("rejects a preference group it has no media query for", () => {
    const sources = miniSources();
    expect(() =>
      buildTokenFiles({
        ...sources,
        preferences: { file: "mini/prefs.json", json: { "reduced-motion": {}, "dark-mode": {} } },
      }),
    ).toThrow('mini/prefs.json: unknown preference group "dark-mode"');
  });

  it("rejects a default theme that is not in the list", () => {
    expect(() => buildTokenFiles({ ...miniSources(), defaultThemeId: "gamma" })).toThrow(
      'default theme "gamma"',
    );
  });
});
