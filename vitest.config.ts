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
      {
        test: {
          name: "variations",
          include: ["packages/variations/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "identity",
          include: ["packages/identity/src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/*.live.test.ts"],
          // Every identity test runs on a manual clock in well under a second: a regression that
          // waits forever (a lock requested by its own holder) fails fast instead of hanging CI.
          testTimeout: 3_000,
          hookTimeout: 3_000,
          // The memory lock manager tracks lock holders with AsyncLocalStorage; this flag (the
          // default from Node 24) makes that tracking cost nothing instead of slowing every promise.
          execArgv: ["--experimental-async-context-frame"],
        },
      },
      {
        test: {
          // The SDK against a running strapi-php backend (pnpm contract:live). Skipped unless
          // IDENTITY_LIVE_BACKEND names the description cms/scripts/live-backend.js writes.
          name: "identity-live",
          include: ["packages/identity/src/**/*.live.test.ts"],
          // Real HTTP and bcrypt: seconds, not milliseconds. One PHP server per setting serves one
          // request at a time, so the files run one after another.
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
          execArgv: ["--experimental-async-context-frame"],
        },
      },
      {
        test: {
          name: "cms",
          include: ["cms/tests/**/*.test.ts"],
        },
      },
      "packages/components/vitest.*.config.ts",
    ],
  },
});
