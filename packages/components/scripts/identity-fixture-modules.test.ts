import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { identityModules, outputName, transpileIdentityModule } from "./identity-fixture-modules";

const SOURCE = fileURLToPath(new URL("../../identity/src", import.meta.url));

describe("the identity fixture's modules", () => {
  const modules = identityModules(SOURCE).map((path) => outputName(SOURCE, path));

  it("take the SDK and the fake, without tests or the node-only lock manager", () => {
    expect(modules).toContain("index.js");
    expect(modules).toContain("testing/fake-identity-api.js");
    expect(modules).not.toContain("testing/memory-locks.js");
    expect(modules).not.toContain("testing/index.js");
    expect(modules).not.toContain("test-harness.js");
    expect(modules.some((name) => name.endsWith(".test.js"))).toBe(false);
  });

  it("are browser JavaScript whose imports name .js files", () => {
    const code = transpileIdentityModule(
      'import { a } from "./a.ts";\nimport type { B } from "./b.ts";\nexport const c: B = a;\n',
      "c.ts",
    );
    expect(code).toContain('from "./a.js"');
    expect(code).not.toContain("b.ts");
    expect(code).toContain("export const c = a;");
  });
});
