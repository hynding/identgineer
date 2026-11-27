import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HEADERS_FILE } from "../scripts/security-headers.ts";
import { expect, test } from "./fixtures";
import { PAGES, hydrated } from "./pages";

const HEADERS = JSON.parse(
  readFileSync(fileURLToPath(new URL(`../www/${HEADERS_FILE}`, import.meta.url)), "utf8"),
) as Record<string, string>;

for (const { name, path, component } of PAGES) {
  test(`${name} is served with the headers the build wrote, and hydrates under them`, async ({
    page,
  }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Trusted Type/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    const response = await page.goto(path);
    const headers = response?.headers() ?? {};
    for (const [header, value] of Object.entries(HEADERS)) {
      expect(headers[header.toLowerCase()], header).toBe(value);
    }
    expect(HEADERS["Content-Security-Policy"]).toContain("require-trusted-types-for 'script'");
    await hydrated(page, component);
    // Proof that the module script ran under the policy: the client build defined the page.
    expect(await page.evaluate((tag) => customElements.get(tag) !== undefined, component)).toBe(
      true,
    );
    expect(violations).toEqual([]);
  });
}
