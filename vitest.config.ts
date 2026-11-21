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
    ],
  },
});
