import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "workspace",
          include: ["tests/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "tokens",
          include: ["packages/tokens/src/**/*.test.ts"],
        },
      },
      "packages/components/vitest.*.config.ts",
    ],
  },
});
