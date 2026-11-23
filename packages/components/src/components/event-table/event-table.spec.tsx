import { afterEach, describe, expect, it } from "vitest";
import { h, render } from "@stencil/vitest";
import "../alert/alert";
import "../pagination/pagination";
import "../skeleton/skeleton";
import "../table/table";
import "./event-table";

const MARK = "\uFFFD";

interface TableElement extends HTMLElement {
  events?: unknown;
  page?: number;
  pageSize?: number;
  total?: number;
  sortKey?: string;
  sortDirection?: string;
}

const at = (minute: number) => new Date(Date.UTC(2026, 2, 1, 12, minute, 0)).toISOString();

const events = (count: number, start = 0) =>
  Array.from({ length: count }, (_, index) => ({
    id: `e${String(start + index)}`,
    name: `event_${String(start + index)}`,
    occurredAt: at(start + index),
  }));

const shadow = (root: HTMLElement) => {
  if (!root.shadowRoot) throw new Error("no shadow root");
  return root.shadowRoot;
};
const rows = (root: HTMLElement) => Array.from(shadow(root).querySelectorAll("tbody tr"));
const firstRow = (root: HTMLElement): Element => {
  const row = rows(root)[0];
  if (!row) throw new Error("no rows");
  return row;
};
const cells = (row: Element) => Array.from(row.children).map((cell) => cell.textContent.trim());
const nameOf = (row: Element) => (row.querySelector("th")?.textContent ?? "").trim();
const names = (root: HTMLElement) => rows(root).map(nameOf);
const status = (root: HTMLElement) => shadow(root).querySelector("[role='status']");
const pagination = (root: HTMLElement) =>
  shadow(root).querySelector<HTMLElement & { page: number; pageCount: number }>("idg-pagination");

const heard: { type: string; listener: (event: Event) => void }[] = [];
function listen(type: string, listener: (event: Event) => void): void {
  document.addEventListener(type, listener);
  heard.push({ type, listener });
}
afterEach(() => {
  for (const { type, listener } of heard.splice(0)) document.removeEventListener(type, listener);
  document.documentElement.removeAttribute("lang");
});

async function mount(props: Record<string, unknown>) {
  const rendered = await render(
    <idg-event-table caption="Tracked events" timeZone="UTC" {...(props as object)} />,
  );
  return { ...rendered, root: rendered.root as TableElement };
}

describe("idg-event-table rendering", () => {
  it("is a table named by its caption, in a group of the same name", async () => {
    const { root } = await mount({ events: events(3) });
    expect(shadow(root).querySelector("table > caption")?.textContent).toBe("Tracked events");
    expect(shadow(root).querySelector("[role='group']")?.getAttribute("aria-label")).toBe(
      "Tracked events",
    );
  });

  it("has a row for each event, the name as the row header, then time, path and properties", async () => {
    const { root } = await mount({
      events: [
        {
          id: "a",
          name: "signup",
          occurredAt: "2026-03-01T12:30:45Z",
          path: "/pricing",
          properties: { plan: "pro", seats: 3 },
        },
      ],
    });
    const headers = Array.from(shadow(root).querySelectorAll("thead th")).map((th) =>
      th.textContent.trim(),
    );
    expect(headers).toEqual(["Event", "Time", "Path", "Properties"]);
    expect(rows(root)[0]?.querySelector("th")?.getAttribute("scope")).toBe("row");
    const [name, time, path, properties] = cells(firstRow(root));
    expect(name).toBe("signup");
    expect(time).toContain("2026");
    expect(path).toBe("/pricing");
    expect(properties).toContain("plan: pro");
    expect(properties).toContain("seats: 3");
  });

  it("puts the time in a time element with the exact instant, formatted in the page's language", async () => {
    document.documentElement.setAttribute("lang", "de");
    const { root } = await mount({
      events: [{ id: "a", name: "x", occurredAt: "2026-03-01T12:30:45+02:00" }],
    });
    const time = shadow(root).querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-03-01T10:30:45.000Z");
    expect(time?.textContent).toBe(
      new Intl.DateTimeFormat("de", {
        dateStyle: "medium",
        timeStyle: "medium",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(Date.parse("2026-03-01T10:30:45.000Z")),
    );
  });

  it("says in words, and not by an empty cell, that an event has no path and no properties", async () => {
    const { root } = await mount({ events: events(1) });
    const [, , path, properties] = Array.from(firstRow(root).children);
    expect(path?.textContent).toContain("No path");
    expect(properties?.textContent).toContain("No properties");
  });

  it("drops events that are malformed or repeat an id", async () => {
    const { root } = await mount({
      events: [...events(2), { id: "e0", name: "again", occurredAt: at(5) }, { id: "z" }, null],
    });
    expect(names(root)).toEqual(["event_0", "event_1"]);
  });

  it("treats events that are not a list as none", async () => {
    const { root } = await mount({ events: "a,b" });
    expect(rows(root)).toHaveLength(0);
    expect(status(root)?.textContent).toContain("No events");
  });

  it("takes the words of the columns and messages from labels", async () => {
    const { root } = await mount({
      events: events(1),
      labels: { columnName: "Ereignis", columnTime: "Zeit", noPath: "Kein Pfad" },
    });
    const headers = Array.from(shadow(root).querySelectorAll("thead th")).map((th) =>
      th.textContent.trim(),
    );
    expect(headers.slice(0, 2)).toEqual(["Ereignis", "Zeit"]);
    expect(firstRow(root).textContent).toContain("Kein Pfad");
  });
});

describe("idg-event-table paging in the browser's own list", () => {
  it("shows the page asked for, and says which events these are, politely", async () => {
    const { root } = await mount({ events: events(25), pageSize: 10, page: 2 });
    expect(names(root)[0]).toBe("event_10");
    expect(names(root)).toHaveLength(10);
    expect(status(root)?.textContent).toBe("Showing 11–20 of 25 events");
    expect(pagination(root)?.pageCount).toBe(3);
    expect(pagination(root)?.page).toBe(2);
  });

  it("shows a last page that is shorter", async () => {
    const { root } = await mount({ events: events(25), pageSize: 10, page: 3 });
    expect(names(root)).toHaveLength(5);
    expect(status(root)?.textContent).toBe("Showing 21–25 of 25 events");
  });

  it("holds a page that is out of range to the pages there are, and leaves the prop as it was", async () => {
    const { root } = await mount({ events: events(25), pageSize: 10, page: 99 });
    expect(names(root)[0]).toBe("event_20");
    expect(root.page).toBe(99);
    const low = await mount({ events: events(25), pageSize: 10, page: -4 });
    expect(names(low.root)[0]).toBe("event_0");
  });

  it("holds the page size to what it will draw", async () => {
    const { root } = await mount({ events: events(500), pageSize: 100000 });
    expect(names(root)).toHaveLength(100);
    const bad = await mount({ events: events(30), pageSize: Number.NaN });
    expect(names(bad.root)).toHaveLength(10);
  });

  it("draws no pagination when everything is on one page", async () => {
    const { root } = await mount({ events: events(5), pageSize: 10 });
    expect(pagination(root)).toBeNull();
    expect(status(root)?.textContent).toBe("Showing 1–5 of 5 events");
  });

  it("changes page when the pagination does, and says so with idgPageChange, once", async () => {
    const { root, waitForChanges } = await mount({ events: events(25), pageSize: 10 });
    const seen: unknown[] = [];
    listen("idgPageChange", (event) => seen.push((event as CustomEvent).detail));
    pagination(root)?.dispatchEvent(
      new CustomEvent("idgPageChange", {
        detail: { page: 3 },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    await waitForChanges();
    expect(seen).toEqual([{ page: 3 }]);
    expect(root.page).toBe(3);
    expect(names(root)[0]).toBe("event_20");
  });

  it("keeps the page where it is when a listener prevents the change", async () => {
    const { root, waitForChanges } = await mount({ events: events(25), pageSize: 10 });
    root.addEventListener("idgPageChange", (event) => {
      event.preventDefault();
    });
    pagination(root)?.dispatchEvent(
      new CustomEvent("idgPageChange", {
        detail: { page: 2 },
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );
    await waitForChanges();
    expect(root.page ?? 1).toBe(1);
    expect(names(root)[0]).toBe("event_0");
  });
});

describe("idg-event-table with a page of events from a server", () => {
  it.each([1e300, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE])(
    "draws a pager for a total of %s without throwing",
    async (total) => {
      const { root } = await mount({ events: events(10), total, pageSize: 10 });
      expect(shadow(root).querySelector("idg-pagination")).not.toBeNull();
      expect(rows(root)).toHaveLength(10);
    },
  );

  it("draws the events it is given as they are, and pages by the total", async () => {
    const { root } = await mount({ events: events(10, 20), total: 45, pageSize: 10, page: 3 });
    expect(names(root)[0]).toBe("event_20");
    expect(names(root)).toHaveLength(10);
    expect(pagination(root)?.pageCount).toBe(5);
    expect(status(root)?.textContent).toBe("Showing 21–30 of 45 events");
  });

  it("never draws more rows than a page holds, whatever the server sent", async () => {
    const { root } = await mount({ events: events(300), total: 300, pageSize: 10 });
    expect(names(root)).toHaveLength(10);
  });

  it("does not sort what it is given, since the server did", async () => {
    const { root } = await mount({
      events: [...events(3)].reverse(),
      total: 30,
      sortable: true,
      sortKey: "name",
      sortDirection: "ascending",
    });
    expect(names(root)).toEqual(["event_2", "event_1", "event_0"]);
    const header = shadow(root).querySelector("th[data-sortable='name']");
    expect(header?.getAttribute("aria-sort")).toBe("ascending");
  });
});

describe("idg-event-table sorting", () => {
  const sample = [
    { id: "a", name: "signup", occurredAt: at(5) },
    { id: "b", name: "checkout", occurredAt: at(1) },
    { id: "c", name: "alpha", occurredAt: at(9) },
  ];

  it("has no sort buttons unless sortable, and only on the time and the event name", async () => {
    const plain = await mount({ events: sample });
    expect(shadow(plain.root).querySelector("[data-sortable]")).toBeNull();
    const { root } = await mount({ events: sample, sortable: true });
    const sortable = Array.from(shadow(root).querySelectorAll("th[data-sortable]")).map((th) =>
      th.getAttribute("data-sortable"),
    );
    expect(sortable).toEqual(["name", "time"]);
  });

  it("sorts the rows by time and marks only that column with aria-sort", async () => {
    const { root } = await mount({
      events: sample,
      sortable: true,
      sortKey: "time",
      sortDirection: "ascending",
    });
    expect(names(root)).toEqual(["checkout", "signup", "alpha"]);
    const marked = Array.from(shadow(root).querySelectorAll("th[aria-sort]")).map((th) => [
      th.getAttribute("data-sortable"),
      th.getAttribute("aria-sort"),
    ]);
    expect(marked).toEqual([["time", "ascending"]]);
  });

  it("sorts descending, and by name", async () => {
    const { root } = await mount({
      events: sample,
      sortable: true,
      sortKey: "name",
      sortDirection: "descending",
    });
    expect(names(root)).toEqual(["signup", "checkout", "alpha"]);
    expect(shadow(root).querySelector("th[data-sortable='name']")?.getAttribute("aria-sort")).toBe(
      "descending",
    );
  });

  it("keeps the order it was given for a sort key it does not know", async () => {
    const { root } = await mount({ events: sample, sortable: true, sortKey: "path" });
    expect(names(root)).toEqual(["signup", "checkout", "alpha"]);
    expect(shadow(root).querySelector("th[aria-sort]")).toBeNull();
  });

  it("sorts the whole list and then pages it", async () => {
    const { root } = await mount({
      events: events(25).reverse(),
      pageSize: 10,
      sortable: true,
      sortKey: "name",
      sortDirection: "ascending",
    });
    expect(names(root)[0]).toBe("event_0");
    expect(names(root)).toHaveLength(10);
  });

  it("follows the table's sort, and says so with idgSort, once", async () => {
    const { root, waitForChanges } = await mount({ events: sample, sortable: true });
    const seen: unknown[] = [];
    listen("idgSort", (event) => seen.push((event as CustomEvent).detail));
    shadow(root)
      .querySelector("idg-table")
      ?.dispatchEvent(
        new CustomEvent("idgSort", {
          detail: { key: "name", direction: "ascending" },
          bubbles: true,
          composed: true,
        }),
      );
    await waitForChanges();
    expect(seen).toEqual([{ key: "name", direction: "ascending" }]);
    expect(names(root)).toEqual(["alpha", "checkout", "signup"]);
    expect(root.sortKey).toBe("name");
  });

  it("ignores a sort of a column it does not offer", async () => {
    const { root, waitForChanges } = await mount({ events: sample, sortable: true });
    const seen: unknown[] = [];
    listen("idgSort", (event) => seen.push(event));
    shadow(root)
      .querySelector("idg-table")
      ?.dispatchEvent(
        new CustomEvent("idgSort", {
          detail: { key: "__proto__", direction: "ascending" },
          bubbles: true,
          composed: true,
        }),
      );
    await waitForChanges();
    expect(seen).toEqual([]);
    expect(root.sortKey ?? "").toBe("");
  });
});

describe("idg-event-table: what a screen reader reads", () => {
  it("reads a property's key and value with a separator that is read, so they do not run together", async () => {
    const { root } = await mount({
      events: [{ id: "a", name: "x", occurredAt: at(1), properties: { plan: "pro", seats: 0 } }],
    });
    const items = Array.from(shadow(root).querySelectorAll(".props li"));
    expect(items.map((item) => item.textContent)).toEqual(["plan: pro", "seats: 0"]);
    for (const item of items) expect(item.querySelector("[aria-hidden]")).toBeNull();
  });
});

describe("idg-event-table: the page is held to the pages there are", () => {
  it("draws, and reflects, the last page for a page beyond it", async () => {
    const { root } = await mount({ events: events(25), pageSize: 10, page: 999 });
    expect(root.page).toBe(3);
    expect(root.getAttribute("page")).toBe("3");
    expect(names(root)).toEqual(events(5, 20).map((event) => event.name));
  });

  it("moves back when the events shrink under the page, and says nothing of it", async () => {
    const { root, waitForChanges } = await mount({ events: events(25), pageSize: 10, page: 3 });
    const heardChanges: Event[] = [];
    listen("idgPageChange", (event) => heardChanges.push(event));
    root.events = events(5);
    await waitForChanges();
    expect(root.page).toBe(1);
    expect(heardChanges).toEqual([]);
  });

  it("leaves the page alone while events are on their way", async () => {
    const { root, waitForChanges } = await mount({
      events: events(10),
      total: 100,
      pageSize: 10,
      page: 4,
    });
    root.loading = true;
    root.events = [];
    root.total = 0;
    await waitForChanges();
    expect(root.page).toBe(4);
    root.events = events(10, 30);
    root.total = 100;
    root.loading = false;
    await waitForChanges();
    expect(root.page).toBe(4);
  });

  it("leaves a page alone when no events were ever given", async () => {
    const { root } = await mount({ page: 3 });
    expect(root.page).toBe(3);
  });
});

describe("idg-event-table: rows that are shown stay while the next page loads", () => {
  it("keeps the table and the pager, busy, and the skeleton is for the first load only", async () => {
    const { root, waitForChanges } = await mount({ events: events(30), pageSize: 10 });
    root.loading = true;
    await waitForChanges();
    expect(shadow(root).querySelector("table")).not.toBeNull();
    expect(pagination(root)).not.toBeNull();
    expect(shadow(root).querySelector("idg-skeleton")).toBeNull();
    expect(shadow(root).querySelector("[aria-busy='true']")).not.toBeNull();
    expect(status(root)?.textContent).toBe("Loading events");
  });

  it("asks for nothing while it loads: a press on the pager says no event", async () => {
    const { root, waitForChanges } = await mount({ events: events(30), pageSize: 10 });
    root.loading = true;
    await waitForChanges();
    const heardChanges: Event[] = [];
    listen("idgPageChange", (event) => heardChanges.push(event));
    pagination(root)?.dispatchEvent(
      new CustomEvent("idgPageChange", { detail: { page: 2 }, cancelable: true }),
    );
    await waitForChanges();
    expect(heardChanges).toEqual([]);
    expect(root.page).toBe(1);
  });

  it("goes back to a skeleton when the rows were gone before the load", async () => {
    const { root, waitForChanges } = await mount({ events: [] });
    root.loading = true;
    await waitForChanges();
    expect(shadow(root).querySelector("idg-skeleton")).not.toBeNull();
    expect(shadow(root).querySelector("table")).toBeNull();
  });
});

describe("idg-event-table states", () => {
  it("shows a skeleton and says it is loading, politely, with no table", async () => {
    const { root } = await mount({ events: events(3), loading: true });
    expect(shadow(root).querySelector("idg-skeleton")).not.toBeNull();
    expect(shadow(root).querySelector("table")).toBeNull();
    expect(shadow(root).querySelector("[aria-busy='true']")).not.toBeNull();
    expect(status(root)?.textContent).toBe("Loading events");
  });

  it("is not busy once loaded", async () => {
    const { root } = await mount({ events: events(3) });
    expect(shadow(root).querySelector("[aria-busy]")).toBeNull();
    expect(shadow(root).querySelector("idg-skeleton")).toBeNull();
  });

  it("shows an error in an alert inside the polite region, and no table", async () => {
    const { root } = await mount({ events: events(3), error: "Events could not be loaded." });
    expect(shadow(root).querySelector("table")).toBeNull();
    const alert = status(root)?.querySelector("idg-alert");
    expect(alert?.getAttribute("variant")).toBe("danger");
    expect(alert?.hasAttribute("quiet")).toBe(true);
    expect(alert?.textContent).toBe("Events could not be loaded.");
    expect(pagination(root)).toBeNull();
  });

  it("shows the error as text, never as markup", async () => {
    const { root } = await mount({ error: "<img src=x onerror=alert(1)>" });
    expect(status(root)?.querySelector("img")).toBeNull();
    expect(status(root)?.textContent).toContain("<img src=x");
  });

  it("says there are no events, in the polite region, and still names the table", async () => {
    const { root } = await mount({ events: [] });
    expect(shadow(root).querySelector("table")).toBeNull();
    expect(status(root)?.textContent).toBe("No events yet.");
    expect(shadow(root).querySelector("[part='caption']")?.textContent).toBe("Tracked events");
  });

  it("puts loading before an error, as the next answer is on its way", async () => {
    const { root } = await mount({ loading: true, error: "Failed" });
    expect(shadow(root).querySelector("idg-skeleton")).not.toBeNull();
    expect(shadow(root).querySelector("idg-alert")).toBeNull();
  });
});

describe("idg-event-table untrusted text", () => {
  const hostile = {
    id: "x",
    name: '<img src=x onerror="alert(1)"> pay‮fdp.exe',
    occurredAt: at(1),
    path: "javascript:alert(document.cookie)",
    properties: {
      "<b>key</b>": '<script>alert("v")</script>',
      "a\u0000b": "line\nbreak⁦",
    },
  };

  it("draws every value as text: no element is made from it", async () => {
    const { root } = await mount({ events: [hostile] });
    const table = shadow(root).querySelector("table");
    expect(table?.querySelector("img, script, b")).toBeNull();
    expect(table?.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(table?.textContent).toContain('<script>alert("v")</script>');
  });

  it("makes no link, no address and no handler from any value", async () => {
    const { root } = await mount({ events: [hostile] });
    const table = shadow(root).querySelector("table");
    expect(table?.querySelector("a, [href], [src], [srcset], [action], [formaction]")).toBeNull();
    for (const element of Array.from(table?.querySelectorAll("*") ?? [])) {
      const names = Array.from(element.attributes).map((attribute) => attribute.name);
      expect(names.filter((attribute) => attribute.startsWith("on"))).toEqual([]);
      expect(element.getAttribute("style")).toBeNull();
    }
  });

  it("replaces bidirectional and control characters with a mark, so a name cannot reorder or hide", async () => {
    const { root } = await mount({ events: [hostile] });
    const text = shadow(root).querySelector("tbody")?.textContent ?? "";
    expect(text).toContain(`pay${MARK}fdp.exe`);
    expect(text).toContain(`a${MARK}b`);
    expect(text).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(text).toContain("line break");
  });

  it("isolates each value's direction, so right to left text cannot reorder what is beside it", async () => {
    const { root } = await mount({ events: [hostile] });
    const row = firstRow(root);
    expect(row.querySelector("th bdi")).not.toBeNull();
    expect(row.querySelector("td.path bdi")).not.toBeNull();
    expect(row.querySelectorAll("td.properties bdi").length).toBeGreaterThanOrEqual(4);
  });

  it("cuts a name, a path and property values to the limits", async () => {
    const long = "w".repeat(5000);
    const { root } = await mount({
      events: [{ id: "x", name: long, occurredAt: at(1), path: long, properties: { k: long } }],
    });
    const row = firstRow(root);
    expect((row.querySelector("th")?.textContent ?? "").length).toBeLessThanOrEqual(121);
    expect((row.querySelector("td.path")?.textContent ?? "").length).toBeLessThanOrEqual(201);
    expect((row.querySelector("td.properties")?.textContent ?? "").length).toBeLessThanOrEqual(200);
  });

  it("shows only the first properties of an event and counts the rest", async () => {
    const properties = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`key${String(index)}`, "v"]),
    );
    const { root } = await mount({
      events: [{ id: "x", name: "n", occurredAt: at(1), properties }],
    });
    const cell = firstRow(root).querySelector("td.properties");
    expect(cell?.querySelectorAll("li:not(.more)")).toHaveLength(10);
    expect(cell?.querySelector("li.more")?.textContent).toBe("+15 more");
  });

  it("shows a property called __proto__ as data", async () => {
    const properties = JSON.parse('{"__proto__": "x"}') as unknown;
    const { root } = await mount({
      events: [{ id: "x", name: "n", occurredAt: at(1), properties }],
    });
    expect(firstRow(root).querySelector("td.properties")?.textContent).toContain("__proto__: x");
  });

  it("shows a time that is not a time as no event at all, not as Invalid Date", async () => {
    const { root } = await mount({ events: [{ id: "x", name: "n", occurredAt: "soon" }] });
    expect(rows(root)).toHaveLength(0);
    expect(shadow(root).innerHTML).not.toContain("Invalid");
  });
});
