import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "components:unit",
    include: ["src/**/*.test.ts", "checks/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
