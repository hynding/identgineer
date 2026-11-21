import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "./stat";

function part(root: HTMLElement, name: string): HTMLElement | null {
  return root.shadowRoot?.querySelector<HTMLElement>(`[part="${name}"]`) ?? null;
}

describe("idg-stat rendering", () => {
  it("shows a label and a value", async () => {
    const { root } = await render(<idg-stat label="Revenue" value="$12,400" />);
    expect(part(root, "label")?.textContent).toBe("Revenue");
    expect(part(root, "value")?.textContent).toBe("$12,400");
  });

  it("shows no delta without one", async () => {
    const { root } = await render(<idg-stat label="Revenue" value="$12,400" />);
    expect(part(root, "delta")).toBeNull();
  });

  it("offers a slot for a chart beside the figures", async () => {
    const { root } = await render(
      <idg-stat label="Revenue" value="$12,400">
        <span slot="chart">spark</span>
      </idg-stat>,
    );
    expect(root.shadowRoot?.querySelector('slot[name="chart"]')).not.toBeNull();
  });
});

describe("idg-stat delta", () => {
  it.each([
    ["up", "arrow-up", "Increased by 12%", "positive"],
    ["down", "arrow-down", "Decreased by 12%", "negative"],
    ["flat", "minus", "No change 12%", "neutral"],
  ] as const)(
    "%s shows the %s icon and says %j to a screen reader",
    async (direction, icon, spoken, sentiment) => {
      const { root } = await render(
        <idg-stat label="Revenue" value="$12,400" delta="12%" direction={direction} />,
      );
      const delta = part(root, "delta");
      expect(delta?.classList.contains(`sentiment-${sentiment}`)).toBe(true);
      expect(delta?.querySelector("idg-icon")?.getAttribute("name")).toBe(icon);
      expect(delta?.querySelector("idg-icon")?.getAttribute("aria-hidden")).toBe("true");
      expect(delta?.querySelector(".visually-hidden")?.textContent).toBe(spoken);
      const visible = delta?.querySelector(".delta-text");
      expect(visible?.textContent).toBe("12%");
      expect(visible?.getAttribute("aria-hidden")).toBe("true");
    },
  );

  it("is flat unless told otherwise", async () => {
    const { root } = await render(<idg-stat label="Revenue" value="1" delta="0%" />);
    expect(part(root, "delta")?.querySelector("idg-icon")?.getAttribute("name")).toBe("minus");
  });

  it("is flat for a direction it does not know", async () => {
    const { root } = await render(
      <idg-stat label="Revenue" value="1" delta="0%" direction={"sideways" as "up"} />,
    );
    expect(part(root, "delta")?.querySelector("idg-icon")?.getAttribute("name")).toBe("minus");
  });

  it("separates what the figure did from whether it is good, since a rising churn rate is bad", async () => {
    const { root } = await render(
      <idg-stat label="Churn" value="4%" delta="1%" direction="up" sentiment="negative" />,
    );
    const delta = part(root, "delta");
    expect(delta?.querySelector("idg-icon")?.getAttribute("name")).toBe("arrow-up");
    expect(delta?.classList.contains("sentiment-negative")).toBe(true);
    expect(delta?.querySelector(".visually-hidden")?.textContent).toBe("Increased by 1%");
  });

  it("takes the spoken words from the props, for other languages", async () => {
    const { root } = await render(
      <idg-stat
        label="Umsatz"
        value="1"
        delta="5%"
        direction="up"
        up-label="Gestiegen um"
        down-label="Gesunken um"
        flat-label="Unverändert"
      />,
    );
    expect(part(root, "delta")?.querySelector(".visually-hidden")?.textContent).toBe(
      "Gestiegen um 5%",
    );
  });
});
