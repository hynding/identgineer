import { describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "../avatar/avatar";
import "./avatar-group";

function group(root: HTMLElement): HTMLElement {
  const element = root.shadowRoot?.querySelector<HTMLElement>('[part="group"]');
  if (!element) throw new Error("idg-avatar-group rendered no group part");
  return element;
}

function avatars(root: HTMLElement): (HTMLElement & { size: string })[] {
  return [...root.querySelectorAll<HTMLElement & { size: string }>("idg-avatar")];
}

const PEOPLE = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Edsger Dijkstra", "Barbara Liskov"];

function people() {
  return PEOPLE.map((name) => <idg-avatar name={name} />);
}

describe("idg-avatar-group", () => {
  it("is a named group around the avatars", async () => {
    const { root } = await render(
      <idg-avatar-group label="Reviewers">{people()}</idg-avatar-group>,
    );
    expect(group(root).getAttribute("role")).toBe("group");
    expect(group(root).getAttribute("aria-label")).toBe("Reviewers");
    expect(group(root).querySelector("slot:not([name])")).not.toBeNull();
  });

  it("is not a group without a label, which would be an unnamed landmark", async () => {
    const { root } = await render(<idg-avatar-group>{people()}</idg-avatar-group>);
    expect(group(root).hasAttribute("role")).toBe(false);
  });

  it("gives the avatars its size", async () => {
    const { root } = await render(<idg-avatar-group size="lg">{people()}</idg-avatar-group>);
    expect(avatars(root).map((element) => element.size)).toEqual(PEOPLE.map(() => "lg"));
  });

  it("shows every avatar when there is no limit", async () => {
    const { root } = await render(<idg-avatar-group>{people()}</idg-avatar-group>);
    expect(avatars(root).every((element) => !element.hasAttribute("hidden"))).toBe(true);
    expect(root.shadowRoot?.querySelector('[part="more"]')).toBeNull();
  });

  it("hides the avatars past the limit and counts them", async () => {
    const { root } = await render(<idg-avatar-group max={3}>{people()}</idg-avatar-group>);
    expect(avatars(root).map((element) => element.hasAttribute("hidden"))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    const more = root.shadowRoot?.querySelector('[part="more"]');
    expect(more?.textContent).toBe("+2");
    expect(more?.getAttribute("role")).toBe("img");
    expect(more?.getAttribute("aria-label")).toBe("2 more");
  });

  it("names the count with the text it is given", async () => {
    const { root } = await render(
      <idg-avatar-group max={4} more-label="others">
        {people()}
      </idg-avatar-group>,
    );
    expect(root.shadowRoot?.querySelector('[part="more"]')?.getAttribute("aria-label")).toBe(
      "1 others",
    );
  });

  it("shows no count when everything fits", async () => {
    const { root } = await render(<idg-avatar-group max={9}>{people()}</idg-avatar-group>);
    expect(root.shadowRoot?.querySelector('[part="more"]')).toBeNull();
  });

  it("ignores a limit that is not a positive whole number", async () => {
    const { root } = await render(<idg-avatar-group max={0}>{people()}</idg-avatar-group>);
    expect(avatars(root).every((element) => !element.hasAttribute("hidden"))).toBe(true);
  });
});
