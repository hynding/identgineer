import { expect, test } from "./fixtures";
import { inspectExample } from "./examples";
import type { ComponentExample } from "../src/examples/component-example";
import { COMPONENT_EXAMPLES } from "../src/examples/component-examples";
import { COMPONENT_ROUTES, hydrated } from "./pages";

// Every component's example shows the component doing its job, and stays in the stage it is drawn
// in. An example that draws nothing, or paints over the page around it, is a page that lies.
for (const scripting of [true, false]) {
  test.describe(`the examples of the components, ${scripting ? "with" : "without"} JavaScript`, () => {
    test.use({ javaScriptEnabled: scripting });

    for (const route of COMPONENT_ROUTES) {
      const example: ComponentExample =
        COMPONENT_EXAMPLES[route.content as keyof typeof COMPONENT_EXAMPLES];
      // A dialog is closed until its button is pressed, and the button needs a script.
      if (!scripting && example.opener !== undefined) continue;
      test(`${route.path} draws something to see, inside its stage`, async ({ page }) => {
        await page.setViewportSize({ width: 1152, height: 900 });
        await page.goto(route.path);
        if (scripting) await hydrated(page, "site-content-page");
        const report = await inspectExample(page);
        expect(report.empty, "elements that draw nothing").toEqual([]);
        expect(report.escaping, "painted outside the stage").toEqual([]);
        expect(report.size.height, "the stage is more than its padding").toBeGreaterThan(48);
        // An example laid out as blocks takes the stage's whole width, each; one in a row does not
        // have to.
        if (example.stage === "block") {
          expect(report.widths.own.map((width) => width >= report.widths.room - 1)).not.toContain(
            false,
          );
        }
      });
    }
  });
}
