import { test as base, expect } from "@playwright/test";

/**
 * Every page is served with the headers the build wrote, so a policy or Trusted Types violation
 * shows up as a console error. Treating any console error or warning, uncaught exception or request
 * to another origin as a failure turns each browser test into a policy test as well.
 *
 * The one expected error is the browser's note that the 404 page itself came with a 404 status.
 */
export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    const origin = new URL(baseURL ?? "http://invalid").origin;
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error" && message.type() !== "warning") return;
      const location = message.location().url;
      const ownStatus =
        message.text().includes("status of 404") &&
        page.mainFrame().url().split("#")[0] === location;
      if (!ownStatus) problems.push(`console ${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      problems.push(`page error: ${error.message}`);
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol !== "data:" && url.origin !== origin) {
        problems.push(`request to another origin: ${request.url()}`);
      }
    });
    await use(page);
    expect(problems, "console errors, policy violations, page errors or foreign requests").toEqual(
      [],
    );
  },
});

export { expect };
