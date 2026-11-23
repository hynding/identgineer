import { expect, test } from "./fixtures";

const CASES = ["flex", "table"].flatMap((place) =>
  ["checkbox", "radio", "switch"].map((kind) => `${place}-${kind}`),
);

// A label sized by its content must be at least as wide as its longest word: breaking inside a
// word is for a word that does not fit at all, not for a label that merely has to share a row.
for (const name of CASES) {
  test(`the label of a ${name.replace("-", " in a ")} keeps the width of its longest word`, async ({
    page,
  }) => {
    await page.goto("/fixtures/choice-width.html");
    await expect(
      page.locator("[data-case] :not(.hydrated):is(idg-checkbox, idg-radio, idg-switch)"),
    ).toHaveCount(0);
    const measured = await page
      .locator(`[data-case="${name}"]`)
      .locator("idg-checkbox, idg-radio, idg-switch")
      .evaluate((host) => {
        const text = host.shadowRoot?.querySelector<HTMLElement>(".text");
        if (!text) throw new Error("no label text");
        const style = getComputedStyle(text);
        const context = document.createElement("canvas").getContext("2d");
        if (!context) throw new Error("no canvas");
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const longest = Math.max(
          ...(host.textContent ?? "").split(/\s+/).map((word) => context.measureText(word).width),
        );
        return {
          width: text.getBoundingClientRect().width,
          longest,
          height: text.getBoundingClientRect().height,
        };
      });
    expect(measured.width).toBeGreaterThanOrEqual(measured.longest - 1);
    // Not stacked letters: a short sentence in a 220px box is a few lines at most.
    expect(measured.height).toBeLessThan(200);
  });
}
