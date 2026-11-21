import { defineVitestConfig } from "@stencil/vitest/config";

export default defineVitestConfig({
  stencilConfig: "./stencil.config.ts",
  test: {
    name: "components",
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
