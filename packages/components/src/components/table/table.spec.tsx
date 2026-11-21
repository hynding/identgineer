import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { h, render } from "@stencil/vitest";
import { installAriaReflection } from "../../testing/aria-reflection";
import { stubConstructableStylesheets } from "../../testing/constructable-stylesheet";
import { stubMutationObserver } from "../../testing/mutation-observer";
import { removeHost } from "../../testing/remove-host";
import { stubResizeObserver } from "../../testing/resize-observer";
import "./table";

interface TableElement extends HTMLElement {
  sortKey: string;
  sortDirection: string;
}

beforeEach(() => {
  installAriaReflection();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const people = (
  <idg-table>
    <table>
      <caption>People</caption>
      <thead>
        <tr>
          <th scope="col" data-sortable="name">
            Name
          </th>
          <th scope="col" data-sortable="age">
            Age
          </th>
          <th scope="col">Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Grace</td>
          <td>45</td>
          <td>b</td>
        </tr>
        <tr>
          <td>Ada</td>
          <td data-sort-value="9">nine</td>
          <td>a</td>
        </tr>
        <tr>
          <td>Alan</td>
          <td>100</td>
          <td>c</td>
        </tr>
      </tbody>
    </table>
  </idg-table>
);

function within(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`nothing matches ${selector}`);
  return found;
}

const names = (root: HTMLElement) =>
  Array.from(root.querySelectorAll("tbody tr")).map((row) => row.children[0]?.textContent ?? "");

const header = (root: HTMLElement, index: number) => {
  const found = root.querySelectorAll<HTMLElement>("thead th")[index];
  if (!found) throw new Error(`no header ${String(index)}`);
  return found;
};

const sortButton = (root: HTMLElement, index: number) => {
  const found = header(root, index).querySelector<HTMLButtonElement>("button.idg-table-sort");
  if (!found) throw new Error(`no sort button in header ${String(index)}`);
  return found;
};

function scroller(root: HTMLElement): HTMLElement {
  const found = root.shadowRoot?.querySelector<HTMLElement>("[part='scroller']");
  if (!found) throw new Error("no scroller");
  return found;
}

describe("idg-table rendering", () => {
  it("wraps the slotted table in a scroll area and leaves the table alone", async () => {
    const { root } = await render(people);
    expect(scroller(root).querySelector("slot")).not.toBeNull();
    expect(root.querySelector("table > caption")?.textContent).toBe("People");
    expect(root.querySelector("table")?.getAttribute("role")).toBeNull();
  });

  it("has a live status region for sort announcements, empty until a sort", async () => {
    const { root } = await render(people);
    const status = root.shadowRoot?.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toBe("");
  });

  it("reflects striped and sticky-header for the stylesheet to read", async () => {
    const { root } = await render(
      <idg-table striped stickyHeader>
        <table />
      </idg-table>,
    );
    expect(root.hasAttribute("striped")).toBe(true);
    expect(root.hasAttribute("sticky-header")).toBe(true);
  });

  it("does not fail when no table is slotted", async () => {
    const { root } = await render(<idg-table />);
    expect(scroller(root)).not.toBeNull();
  });

  it("limits the height and the narrowness through custom properties of the scroll area", async () => {
    const { root } = await render(
      <idg-table maxHeight="20rem" minWidth="40rem">
        <table />
      </idg-table>,
    );
    expect(scroller(root).style.getPropertyValue("--_max-height")).toBe("20rem");
    expect(scroller(root).style.getPropertyValue("--_min-width")).toBe("40rem");
  });

  it("refuses a length that is not a plain length", async () => {
    const { root } = await render(
      <idg-table maxHeight="20rem; color: red" minWidth="url(x)">
        <table />
      </idg-table>,
    );
    expect(scroller(root).style.getPropertyValue("--_max-height")).toBe("");
    expect(scroller(root).style.getPropertyValue("--_min-width")).toBe("");
  });
});

describe("idg-table stylesheet for the table", () => {
  it("adopts a stylesheet into the document while it is in the page, and lets go when it leaves", async () => {
    const styles = stubConstructableStylesheets();
    const { root, waitForChanges } = await render(<div>{people}</div>);
    const table = within(root, "idg-table");
    expect(styles.sheets()).toHaveLength(1);
    expect(styles.sheets()[0]?.css).toContain("idg-table > table");
    removeHost(table);
    expect(styles.sheets()).toHaveLength(0);
    root.append(table);
    await waitForChanges();
    expect(styles.sheets()).toHaveLength(1);
    styles.restore();
  });

  it("shares one sheet between tables, and keeps it until the last one has left", async () => {
    const styles = stubConstructableStylesheets();
    const { root } = await render(
      <div>
        {people}
        {people}
      </div>,
    );
    const [first, second] = Array.from(root.querySelectorAll<HTMLElement>("idg-table"));
    if (!first || !second) throw new Error("expected two tables");
    expect(styles.sheets()).toHaveLength(1);
    removeHost(first);
    expect(styles.sheets()).toHaveLength(1);
    removeHost(second);
    expect(styles.sheets()).toHaveLength(0);
    styles.restore();
  });

  it("leaves the table unstyled, without failing, where constructable stylesheets do not exist", async () => {
    const { root } = await render(people);
    expect(names(root)).toEqual(["Grace", "Ada", "Alan"]);
  });
});

describe("idg-table sortable headers", () => {
  it("turns a header with data-sortable into a button holding its text, and leaves others alone", async () => {
    const { root } = await render(people);
    const button = sortButton(root, 0);
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Name");
    expect(button.querySelector(".idg-table-sort-mark")?.getAttribute("aria-hidden")).toBe("true");
    expect(header(root, 2).querySelector("button")).toBeNull();
    expect(header(root, 2).textContent).toBe("Note");
  });

  it("marks no column as sorted at first", async () => {
    const { root } = await render(people);
    expect(root.querySelector("[aria-sort]")).toBeNull();
    expect(names(root)).toEqual(["Grace", "Ada", "Alan"]);
  });

  it("sorts ascending on a first click, then flips, marking only that header", async () => {
    const { root, waitForChanges } = await render(people);
    sortButton(root, 0).click();
    await waitForChanges();
    expect(names(root)).toEqual(["Ada", "Alan", "Grace"]);
    expect(header(root, 0).getAttribute("aria-sort")).toBe("ascending");
    sortButton(root, 0).click();
    await waitForChanges();
    expect(names(root)).toEqual(["Grace", "Alan", "Ada"]);
    expect(header(root, 0).getAttribute("aria-sort")).toBe("descending");
    sortButton(root, 1).click();
    await waitForChanges();
    expect(header(root, 0).hasAttribute("aria-sort")).toBe(false);
    expect(header(root, 1).getAttribute("aria-sort")).toBe("ascending");
  });

  it("compares numbers as numbers and uses data-sort-value in place of the text", async () => {
    const { root, waitForChanges } = await render(people);
    sortButton(root, 1).click();
    await waitForChanges();
    // 9 (from data-sort-value), 45, 100.
    expect(names(root)).toEqual(["Ada", "Grace", "Alan"]);
  });

  it("reports the choice, and not a sort set from script", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(people);
    const spy = spyOnEvent("idgSort");
    sortButton(root, 0).click();
    await waitForChanges();
    sortButton(root, 0).click();
    await waitForChanges();
    expect(spy.events.map((event) => event.detail)).toEqual([
      { key: "name", direction: "ascending" },
      { key: "name", direction: "descending" },
    ]);
    (root as TableElement).sortKey = "age";
    await waitForChanges();
    expect(spy.length).toBe(2);
  });

  it("sorts by a sortKey and direction set from script", async () => {
    const { root, waitForChanges } = await render(people);
    (root as TableElement).sortKey = "name";
    (root as TableElement).sortDirection = "descending";
    await waitForChanges();
    expect(names(root)).toEqual(["Grace", "Alan", "Ada"]);
    expect(header(root, 0).getAttribute("aria-sort")).toBe("descending");
  });

  it("sorts from the first render when it is given a sort", async () => {
    const { root } = await render(
      <idg-table sortKey="name">
        <table>
          <thead>
            <tr>
              <th data-sortable="name">Name</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>b</td>
            </tr>
            <tr>
              <td>a</td>
            </tr>
          </tbody>
        </table>
      </idg-table>,
    );
    expect(names(root)).toEqual(["a", "b"]);
    expect(header(root, 0).getAttribute("aria-sort")).toBe("ascending");
  });

  it("uses the column's position when data-sortable has no value", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-table>
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th data-sortable>Name</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>b</td>
            </tr>
            <tr>
              <td>2</td>
              <td>a</td>
            </tr>
          </tbody>
        </table>
      </idg-table>,
    );
    const spy = spyOnEvent("idgSort");
    sortButton(root, 1).click();
    await waitForChanges();
    expect(spy.lastEvent?.detail).toEqual({ key: "1", direction: "ascending" });
    expect(
      Array.from(root.querySelectorAll("tbody tr")).map((row) => row.children[0]?.textContent),
    ).toEqual(["2", "1"]);
  });

  it("returns to the original order when the sort is cleared", async () => {
    const { root, waitForChanges } = await render(people);
    sortButton(root, 0).click();
    await waitForChanges();
    (root as TableElement).sortKey = "";
    await waitForChanges();
    expect(names(root)).toEqual(["Grace", "Ada", "Alan"]);
    expect(root.querySelector("[aria-sort]")).toBeNull();
  });

  it("leaves the rows to the page with manual-sort, still marking the column and reporting it", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-table manualSort>
        <table>
          <thead>
            <tr>
              <th data-sortable="name">Name</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>b</td>
            </tr>
            <tr>
              <td>a</td>
            </tr>
          </tbody>
        </table>
      </idg-table>,
    );
    const spy = spyOnEvent("idgSort");
    sortButton(root, 0).click();
    await waitForChanges();
    expect(names(root)).toEqual(["b", "a"]);
    expect(header(root, 0).getAttribute("aria-sort")).toBe("ascending");
    expect(spy.lastEvent?.detail).toEqual({ key: "name", direction: "ascending" });
  });

  it("announces a sort a user made, from its template", async () => {
    const { root, waitForChanges } = await render(people);
    sortButton(root, 0).click();
    await waitForChanges();
    expect(root.shadowRoot?.querySelector('[role="status"]')?.textContent).toBe(
      "Sorted by Name, ascending",
    );
    sortButton(root, 0).click();
    await waitForChanges();
    expect(root.shadowRoot?.querySelector('[role="status"]')?.textContent).toBe(
      "Sorted by Name, descending",
    );
  });

  it("announces the direction in the words it is given", async () => {
    const { root, waitForChanges } = await render(
      <idg-table sortAscendingLabel="croissant" sortDescendingLabel="décroissant">
        <table>
          <thead>
            <tr>
              <th scope="col" data-sortable="name">
                Nom
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ada</td>
            </tr>
            <tr>
              <td>Alan</td>
            </tr>
          </tbody>
        </table>
      </idg-table>,
    );
    sortButton(root, 0).click();
    await waitForChanges();
    expect(root.shadowRoot?.querySelector('[role="status"]')?.textContent).toBe(
      "Sorted by Nom, croissant",
    );
    sortButton(root, 0).click();
    await waitForChanges();
    expect(root.shadowRoot?.querySelector('[role="status"]')?.textContent).toBe(
      "Sorted by Nom, décroissant",
    );
  });

  it("ignores a click on a button that is not a sort button of its table", async () => {
    const { root, spyOnEvent } = await render(
      <idg-table>
        <table>
          <tbody>
            <tr>
              <td>
                <button id="other">Other</button>
              </td>
            </tr>
          </tbody>
        </table>
      </idg-table>,
    );
    const spy = spyOnEvent("idgSort");
    within(root, "#other").click();
    expect(spy.length).toBe(0);
  });

  it("takes up headers and rows that are added later", async () => {
    const watcher = stubMutationObserver();
    const { root, waitForChanges } = await render(people);
    const row = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = "Barbara";
    const age = document.createElement("td");
    age.textContent = "30";
    row.append(name, age);
    within(root, "tbody").append(row);
    (root as TableElement).sortKey = "name";
    await waitForChanges();
    watcher.notify([{ type: "childList", target: within(root, "tbody") }]);
    await waitForChanges();
    expect(names(root)).toEqual(["Ada", "Alan", "Barbara", "Grace"]);
    (root as TableElement).sortKey = "";
    await waitForChanges();
    expect(names(root)).toEqual(["Grace", "Ada", "Alan", "Barbara"]);
    watcher.restore();
  });

  it("stops watching its table when removed, and catches up when put back", async () => {
    const watcher = stubMutationObserver();
    const { root, waitForChanges } = await render(<div>{people}</div>);
    const table = within(root, "idg-table");
    const watching = () => watcher.observers.filter((observer) => observer.observing);
    expect(watching().length).toBeGreaterThan(0);
    removeHost(table);
    expect(watching()).toHaveLength(0);
    const head = within(table, "thead tr");
    const added = document.createElement("th");
    added.setAttribute("data-sortable", "extra");
    added.textContent = "Extra";
    head.append(added);
    root.append(table);
    await waitForChanges();
    expect(watching().length).toBeGreaterThan(0);
    expect(added.querySelector("button.idg-table-sort")).not.toBeNull();
    watcher.restore();
  });
});

describe("idg-table scroll region", () => {
  function overflow(element: HTMLElement, wide: boolean): void {
    Object.defineProperty(element, "scrollWidth", { configurable: true, value: wide ? 900 : 300 });
    Object.defineProperty(element, "clientWidth", { configurable: true, value: 300 });
    Object.defineProperty(element, "scrollHeight", { configurable: true, value: 100 });
    Object.defineProperty(element, "clientHeight", { configurable: true, value: 100 });
  }

  it("is a plain area while the table fits", async () => {
    const sizes = stubResizeObserver();
    const { root } = await render(people);
    overflow(scroller(root), false);
    sizes.notify();
    expect(scroller(root).hasAttribute("role")).toBe(false);
    expect(scroller(root).hasAttribute("tabindex")).toBe(false);
    sizes.restore();
  });

  it("is a focusable region named by its label when the table is wider than it", async () => {
    const sizes = stubResizeObserver();
    const { root, waitForChanges } = await render(
      <idg-table label="All people">
        <table>
          <caption>People</caption>
        </table>
      </idg-table>,
    );
    overflow(scroller(root), true);
    sizes.notify();
    await waitForChanges();
    expect(scroller(root).getAttribute("role")).toBe("region");
    expect(scroller(root).getAttribute("tabindex")).toBe("0");
    expect(scroller(root).getAttribute("aria-label")).toBe("All people");
    sizes.restore();
  });

  it("is named by the caption when there is no label", async () => {
    const sizes = stubResizeObserver();
    const { root, waitForChanges } = await render(people);
    overflow(scroller(root), true);
    sizes.notify();
    await waitForChanges();
    const named = scroller(root) as unknown as { ariaLabelledByElements: Element[] | null };
    expect(named.ariaLabelledByElements).toEqual([within(root, "caption")]);
    expect(scroller(root).hasAttribute("aria-label")).toBe(false);
    sizes.restore();
  });

  it("goes back to a plain area when the table fits again", async () => {
    const sizes = stubResizeObserver();
    const { root, waitForChanges } = await render(people);
    overflow(scroller(root), true);
    sizes.notify();
    await waitForChanges();
    overflow(scroller(root), false);
    sizes.notify();
    await waitForChanges();
    expect(scroller(root).hasAttribute("role")).toBe(false);
    expect(scroller(root).hasAttribute("tabindex")).toBe(false);
    sizes.restore();
  });

  it("measures the scroll area and the table, and stops when removed", async () => {
    const sizes = stubResizeObserver();
    const { root, waitForChanges } = await render(<div>{people}</div>);
    const table = within(root, "idg-table");
    const watched = () => sizes.observers.filter((observer) => observer.observing);
    expect(watched()).toHaveLength(1);
    expect(watched()[0]?.targets).toContain(scroller(table));
    expect(watched()[0]?.targets).toContain(within(table, "table"));
    removeHost(table);
    expect(watched()).toHaveLength(0);
    root.append(table);
    await waitForChanges();
    expect(watched()).toHaveLength(1);
    sizes.restore();
  });
});

describe("idg-table nested and spanning", () => {
  it("does not sort by a header of a table nested in one of its cells", async () => {
    const { root, spyOnEvent, waitForChanges } = await render(
      <idg-table>
        <table>
          <thead>
            <tr>
              <th scope="col" data-sortable="outer">
                Outer
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <idg-table id="inner">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col" data-sortable="inner">
                          Inner
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>b</td>
                      </tr>
                      <tr>
                        <td>a</td>
                      </tr>
                    </tbody>
                  </table>
                </idg-table>
              </td>
            </tr>
          </tbody>
        </table>
      </idg-table>,
    );
    const spy = spyOnEvent("idgSort");
    within(root, "#inner button.idg-table-sort").click();
    await waitForChanges();
    expect(spy.length).toBe(1);
    expect((root as TableElement).sortKey).toBe("");
    expect(within(root, "thead th").hasAttribute("aria-sort")).toBe(false);
  });

  const spanning = (
    <idg-table>
      <table>
        <thead>
          <tr>
            <th scope="col" data-sortable="name">
              Name
            </th>
            <th scope="col" data-sortable="age">
              Age
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Grace</td>
            <td>45</td>
          </tr>
          <tr>
            <td colSpan={2}>Ada, 9</td>
          </tr>
        </tbody>
      </table>
    </idg-table>
  );

  it("draws no sort buttons for a body with cells that span rows or columns", async () => {
    const { root } = await render(spanning);
    expect(root.querySelectorAll("button.idg-table-sort")).toHaveLength(0);
    expect(header(root, 0).textContent.trim()).toBe("Name");
  });

  it("does not sort such a table from script either", async () => {
    const { root, waitForChanges } = await render(spanning);
    (root as TableElement).sortKey = "name";
    await waitForChanges();
    expect(Array.from(root.querySelectorAll("tbody tr")).map((row) => row.textContent)).toEqual([
      "Grace45",
      "Ada, 9",
    ]);
    expect(header(root, 0).hasAttribute("aria-sort")).toBe(false);
  });

  it("offers sorting once the spanning cell is gone", async () => {
    const watcher = stubMutationObserver();
    const { root, waitForChanges } = await render(spanning);
    const cell = within(root, "td[colspan]");
    cell.removeAttribute("colspan");
    watcher.notify([{ type: "attributes", target: cell }]);
    await waitForChanges();
    expect(root.querySelectorAll("button.idg-table-sort")).toHaveLength(2);
    watcher.restore();
  });
});
