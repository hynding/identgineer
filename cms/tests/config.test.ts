import { describe, expect, it } from "vitest";
import { loadConfig, readCmsText } from "./model";

const config = loadConfig();

describe("camis.config.json", () => {
  it("reads the IR, roles and protected directory beside it", () => {
    expect(config.ir).toBe("./camis.json");
    expect(config.roles).toBe("./roles.json");
    expect(config.protected).toBe("./protected");
  });

  it("generates exactly a strapi and a filament target", () => {
    expect(config.targets.map((t) => t.target)).toEqual(["strapi", "filament"]);
  });

  it("generates Strapi into generated/strapi", () => {
    expect(config.targets[0]).toMatchObject({ target: "strapi", out: "./generated/strapi" });
  });

  it("generates strapi-php: filament with the Strapi API style, into generated/strapi-php", () => {
    expect(config.targets[1]).toMatchObject({
      target: "filament",
      out: "./generated/strapi-php",
      apiStyle: "strapi",
    });
  });

  // The Strapi storage layout serves no public IR endpoint, which ingestion depends on.
  it("keeps strapi-php on the laravel storage layout", () => {
    expect(config.targets[1]?.storageLayout).toBeUndefined();
  });

  it("keeps every generated project inside the git-ignored generated directory", () => {
    expect(config.targets.filter((t) => !t.out.startsWith("./generated/"))).toEqual([]);
    expect(readCmsText("../.gitignore").split("\n")).toContain("cms/generated");
  });
});
