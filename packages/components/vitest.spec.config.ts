import { fileURLToPath } from "node:url";
import { defineVitestConfig } from "@stencil/vitest/config";
import { stencilVitestPlugin } from "@stencil/vitest/plugin";

export default defineVitestConfig({
  stencilConfig: fileURLToPath(new URL("./stencil.config.ts", import.meta.url)),
  // Compiles each component on the fly, so specs need no build first.
  plugins: [stencilVitestPlugin()],
  test: {
    name: "components:spec",
    include: ["src/**/*.spec.tsx"],
    environment: "stencil",
  },
});
