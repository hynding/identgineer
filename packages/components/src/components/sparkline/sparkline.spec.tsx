import { afterEach, describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./sparkline";

const svg = (root: HTMLElement) => root.shadowRoot?.querySelector("svg") ?? null;
const part = (root: HTMLElement, name: string) =>
  root.shadowRoot?.querySelector(`[part="${name}"]`) ?? null;
const name = (root: HTMLElement) => svg(root)?.getAttribute("aria-label");

afterEach(() => {
  document.documentElement.removeAttribute("lang");
});

describe("idg-sparkline drawing", () => {
  it("draws the line as an svg path in a view box that scales to its container", async () => {
    const { root } = await render(<idg-sparkline label="Visitors" values={[1, 3, 2]} />);
    expect(svg(root)?.getAttribute("viewBox")).toBe("0 0 100 30");
    expect(part(root, "line")?.getAttribute("d")).toMatch(/^M[\d. ]+L[\d. ]+L[\d. ]+$/);
    expect(svg(root)?.getAttribute("preserveAspectRatio") ?? "xMidYMid meet").toBe("xMidYMid meet");
  });

  it("marks the last point, so the end of the line is not told by colour alone", async () => {
    const { root } = await render(<idg-sparkline label="Visitors" values={[1, 3, 2]} />);
    expect(part(root, "end")?.localName).toBe("circle");
  });

  it("draws no area unless asked, and an area closed to the baseline when asked", async () => {
    const plain = await render(<idg-sparkline label="Visitors" values={[1, 3, 2]} />);
    expect(part(plain.root, "area")).toBeNull();
    const filled = await render(<idg-sparkline label="Visitors" values={[1, 3, 2]} area />);
    expect(part(filled.root, "area")?.getAttribute("d")).toMatch(/Z$/);
  });

  it.each([
    ["no values", []],
    ["one value", [7]],
    ["equal values", [4, 4, 4]],
    ["negative values", [-3, -9, -1]],
    ["every kind of bad value", [Number.NaN, Number.POSITIVE_INFINITY, "5", null, 2, 9]],
    ["extremes", [Number.MAX_VALUE, -Number.MAX_VALUE]],
    ["text of numbers", "1, 2, x, 4"],
    ["a JSON array in text", "[5, null, 6]"],
  ])("draws %s without a NaN or an Infinity anywhere", async (_label, values) => {
    const { root } = await render(
      <idg-sparkline label="Visitors" values={values as number[]} area />,
    );
    expect(root.shadowRoot?.innerHTML ?? "").not.toMatch(/NaN|Infinity|undefined/);
  });

  it("draws nothing for no values, and a mark alone for one", async () => {
    const none = await render(<idg-sparkline label="Visitors" values={[]} />);
    expect(part(none.root, "line")).toBeNull();
    expect(part(none.root, "end")).toBeNull();
    const one = await render(<idg-sparkline label="Visitors" values={[7]} />);
    expect(part(one.root, "line")).toBeNull();
    expect(part(one.root, "end")).not.toBeNull();
  });

  it("reads values given as an attribute, as JSON or as comma separated numbers", async () => {
    const json = await render(<idg-sparkline label="Visitors" values="[1,2,3]" />);
    const commas = await render(<idg-sparkline label="Visitors" values="1,2,3" />);
    const array = await render(<idg-sparkline label="Visitors" values={[1, 2, 3]} />);
    const d = (root: HTMLElement) => part(root, "line")?.getAttribute("d");
    expect(d(json.root)).toBe(d(array.root));
    expect(d(commas.root)).toBe(d(array.root));
  });

  it("follows a change of the values", async () => {
    const { root, waitForChanges } = await render(
      <idg-sparkline label="Visitors" values={[1, 2]} />,
    );
    (root as HTMLElement & { values: number[] }).values = [5, 1, 5];
    await waitForChanges();
    expect(part(root, "line")?.getAttribute("d")?.match(/L/g)).toHaveLength(2);
  });

  it("draws no more points than its cap, however long the series", async () => {
    const long = Array.from({ length: 500_000 }, (_, index) => Math.sin(index / 100));
    const { root } = await render(<idg-sparkline label="Visitors" values={long} />);
    const points = (part(root, "line")?.getAttribute("d") ?? "").match(/[ML]/g) ?? [];
    expect(points.length).toBeGreaterThan(10);
    expect(points.length).toBeLessThanOrEqual(120);
  });
});

describe("idg-sparkline text alternative", () => {
  it("is an image named by the label and a summary of the series", async () => {
    const { root } = await render(<idg-sparkline label="Visitors" values={[3, 1, 5, 4]} />);
    expect(svg(root)?.getAttribute("role")).toBe("img");
    expect(svg(root)?.getAttribute("focusable")).toBe("false");
    expect(name(root)).toBe("Visitors: From 3 to 4, lowest 1, highest 5, rising.");
  });

  it("says falling and steady in words", async () => {
    const falling = await render(<idg-sparkline label="Churn" values={[9, 4]} />);
    expect(name(falling.root)).toContain("falling");
    const steady = await render(<idg-sparkline label="Churn" values={[4, 9, 4]} />);
    expect(name(steady.root)).toContain("steady");
  });

  it("formats the numbers in the language of the page", async () => {
    document.documentElement.setAttribute("lang", "de");
    const { root } = await render(<idg-sparkline label="Besucher" values={[1234.5, 2000.25]} />);
    expect(name(root)).toContain("1.234,5");
    expect(name(root)).toContain("2.000,25");
  });

  it("falls back to the browser's formatting for a language tag it refuses", async () => {
    document.documentElement.setAttribute("lang", "not a tag!");
    const { root } = await render(<idg-sparkline label="Visitors" values={[1, 2]} />);
    expect(name(root)).toContain("From 1 to 2");
  });

  it("says what there is to say for one value and for none", async () => {
    const one = await render(<idg-sparkline label="Visitors" values={[7]} />);
    expect(name(one.root)).toBe("Visitors: One value, 7.");
    const none = await render(<idg-sparkline label="Visitors" values={[]} />);
    expect(name(none.root)).toBe("Visitors: No data.");
    const missing = await render(<idg-sparkline label="Visitors" />);
    expect(name(missing.root)).toBe("Visitors: No data.");
  });

  it("describes the series without the label when none is given", async () => {
    const { root } = await render(<idg-sparkline values={[1, 2]} />);
    expect(name(root)).toBe("From 1 to 2, lowest 1, highest 2, rising.");
  });

  it("describes the whole series, not only what is drawn", async () => {
    const long = Array.from({ length: 100_000 }, (_, index) => index);
    long[50_000] = 9_999_999;
    const { root } = await render(<idg-sparkline label="Visitors" values={long} />);
    expect(name(root)).toContain("highest 9,999,999");
  });

  it("takes every word from labels, merged over the English ones", async () => {
    const { root } = await render(
      <idg-sparkline
        label="Besucher"
        values={[1, 2]}
        labels={{ rising: "steigend", summary: "Von {first} bis {last}, {trend}." }}
      />,
    );
    expect(name(root)).toBe("Besucher: Von 1 bis 2, steigend.");
  });

  it("keeps the label as text and never as markup", async () => {
    const { root } = await render(
      <idg-sparkline label={'<img src=x onerror="alert(1)">'} values={[1, 2]} />,
    );
    expect(name(root)).toContain("<img src=x");
    expect(root.shadowRoot?.querySelector("img")).toBeNull();
  });
});
