import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { outputName, sdkModules, transpileSdkModule } from "./sdk-fixture-modules";

const IDENTITY = fileURLToPath(new URL("../../identity/src", import.meta.url));
const TRACKING = fileURLToPath(new URL("../../tracking/src", import.meta.url));

describe("the identity fixture's modules", () => {
  const modules = sdkModules(IDENTITY, ["testing/memory-locks.ts", "testing/index.ts"]).map(
    (path) => outputName(IDENTITY, path),
  );

  it("take the SDK and the fake, without tests or the node-only lock manager", () => {
    expect(modules).toContain("index.js");
    expect(modules).toContain("testing/fake-identity-api.js");
    expect(modules).not.toContain("testing/memory-locks.js");
    expect(modules).not.toContain("testing/index.js");
    expect(modules).not.toContain("test-harness.js");
    expect(modules.some((name) => name.endsWith(".test.js"))).toBe(false);
  });
});

describe("the consent fixture's modules", () => {
  const modules = sdkModules(TRACKING, []).map((path) => outputName(TRACKING, path));

  it("take the tracker, its browser page and its fakes, without tests or the test harness", () => {
    expect(modules).toContain("index.js");
    expect(modules).toContain("create-tracker.js");
    expect(modules).toContain("browser-page.js");
    expect(modules).toContain("testing/fake-collector.js");
    expect(modules).toContain("testing/index.js");
    expect(modules).not.toContain("test-harness.js");
    expect(modules.some((name) => name.endsWith(".test.js"))).toBe(false);
  });
});

describe("a module of an SDK", () => {
  it("is browser JavaScript whose imports name .js files", () => {
    const code = transpileSdkModule(
      'import { a } from "./a.ts";\nimport type { B } from "./b.ts";\nexport const c: B = a;\n',
      "c.ts",
    );
    expect(code).toContain('from "./a.js"');
    expect(code).not.toContain("b.ts");
    expect(code).toContain("export const c = a;");
  });
});
