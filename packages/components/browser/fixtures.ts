import { test as base, expect } from "@playwright/test";

/**
 * Every page is served under the strict policy, so a CSP or Trusted Types violation shows up as a
 * console error. Treating any console error, warning or uncaught exception as a failure turns each
 * browser test into a policy test as well.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        problems.push(`console ${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      problems.push(`page error: ${error.message}`);
    });
    await use(page);
    expect(problems, "console errors, policy violations or page errors").toEqual([]);
  },
});

export { expect };
