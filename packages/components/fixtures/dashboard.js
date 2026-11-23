// Wires the dashboard components on the page to one source of data, served from this origin as
// plain modules (built into /dashboard-sdk by the components build), so the strict policy holds.
// The page asks the source and hands the answers to the components as properties; the components
// never fetch. The source is the fake that stands in for the authenticated API.
import { createFakeDashboardSource } from "/dashboard-sdk/testing/fake-dashboard-source.js";
import { DashboardError } from "/dashboard-sdk/dashboard/dashboard-types.js";
import { validatedSource } from "/dashboard-sdk/dashboard/validated-source.js";

const TAGS = [
  "idg-property-picker",
  "idg-event-table",
  "idg-sparkline",
  "idg-stat",
  "idg-variation-switcher",
];
const NAMES = [
  "page_viewed",
  "signup_completed",
  "checkout_started",
  "button_clicked",
  "file_downloaded",
];
const PATHS = ["/", "/pricing", "/docs/install", "/blog/launch", undefined];
const params = new URLSearchParams(location.search);

// `?lang=de` and `?dir=rtl` stand for a page in another language or direction.
if (params.has("lang")) document.documentElement.lang = params.get("lang");
if (params.has("dir")) document.documentElement.dir = params.get("dir");

const EVENT_COUNT = Number(params.get("events") ?? 95);
const PAGE_SIZE = Number(params.get("page-size") ?? 10);

function sampleEvents(prefix, count) {
  return Array.from({ length: count }, (_, index) => {
    const name = NAMES[index % NAMES.length];
    const path = PATHS[index % PATHS.length];
    return {
      id: `${prefix}-${String(index)}`,
      name,
      occurredAt: new Date(Date.UTC(2026, 2, 1, 12, 0, 0) - index * 7 * 60_000).toISOString(),
      ...(path === undefined ? {} : { path }),
      ...(index % 3 === 0
        ? {
            properties: {
              plan: index % 2 === 0 ? "pro" : "free",
              seats: index % 7,
              trial: index % 4 === 0,
            },
          }
        : {}),
    };
  });
}

// `?hostile` is a property whose every string is the kind of text the public internet sends.
const LONG = "w".repeat(600);
const HOSTILE_EVENTS = [
  {
    id: "h-1",
    name: '<img src=x onerror="alert(1)"> pay‮fdp.exe',
    occurredAt: "2026-03-01T12:00:00Z",
    path: "javascript:alert(document.cookie)",
    properties: { "<b>bold</b>": "<script>alert(1)</script>", "a\u0000b": "line\nbreak⁦" },
  },
  {
    id: "h-2",
    name: LONG,
    occurredAt: "2026-03-01T11:00:00Z",
    path: `/${LONG}`,
    properties: { [LONG]: LONG },
  },
  {
    id: "h-3",
    name: "many_properties",
    occurredAt: "2026-03-01T10:00:00Z",
    properties: Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`key_${String(index)}`, `value_${String(index)}`]),
    ),
  },
  { id: "h-4", name: "שלום עולם", occurredAt: "2026-03-01T09:00:00Z", path: "/مرحبا" },
];

const properties = params.has("none")
  ? []
  : [
      { id: "p-docs", name: "Docs", origin: "https://docs.example.com" },
      { id: "p-shop", name: "Shop", origin: "https://shop.example.com" },
      { id: "p-blog", name: "Blog" },
      ...(params.has("hostile")
        ? [
            {
              id: "p-evil",
              name: "<img src=x onerror=alert(1)> pay‮fdp.exe " + LONG,
              origin: "https://evil.example.com",
            },
          ]
        : []),
    ];
const events = {
  "p-docs": sampleEvents("d", EVENT_COUNT),
  "p-shop": sampleEvents("s", 4),
  "p-blog": [],
  "p-evil": HOSTILE_EVENTS,
  // Someone else's property: it is not in the list, so no call can reach it.
  "p-stranger": sampleEvents("x", 3),
};

const fake = createFakeDashboardSource({ properties, events });
// `?hold` keeps every answer back until a test calls release().
const release = params.has("hold") ? fake.hold() : () => undefined;
// `?fail-events` makes the first events call fail, as an unreachable server would.
if (params.has("fail-events"))
  fake.failNext("listEvents", new DashboardError("unavailable", "down"));
if (params.has("fail-properties")) {
  fake.failNext("listProperties", new DashboardError("unavailable", "down"));
}
const source = validatedSource(fake.source);

await Promise.all(TAGS.map((tag) => customElements.whenDefined(tag)));
const picker = document.getElementById("picker");
const table = document.getElementById("events");
const overview = document.getElementById("overview");
const STATS = [
  { metric: "visitors", stat: "stat-visitors", spark: "spark-visitors" },
  { metric: "pageViews", stat: "stat-pageviews", spark: "spark-pageviews" },
  { metric: "events", stat: "stat-events", spark: "spark-events" },
];
const language = () => document.documentElement.lang || undefined;

let propertyId = "";
let eventsRequest = 0;
let summaryRequest = 0;

// A change as people read it: a whole percent, and which way it went.
function changeOf(metric) {
  if (metric.previous === undefined || metric.previous === 0) return {};
  const share = (metric.value - metric.previous) / metric.previous;
  const direction = share > 0 ? "up" : share < 0 ? "down" : "flat";
  const text = new Intl.NumberFormat(language(), {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(Math.abs(share));
  return { delta: text, direction };
}

async function loadSummary() {
  const mine = ++summaryRequest;
  overview.setAttribute("aria-busy", "true");
  try {
    const summary = await source.summary(propertyId, "7d");
    if (mine !== summaryRequest) return;
    for (const { metric, stat, spark } of STATS) {
      const figures = summary[metric];
      const element = document.getElementById(stat);
      element.value = new Intl.NumberFormat(language()).format(figures.value);
      const { delta, direction } = changeOf(figures);
      element.delta = delta;
      element.direction = direction ?? "flat";
      element.period = delta === undefined ? undefined : "vs the 7 days before";
      document.getElementById(spark).values = figures.series;
    }
  } catch {
    if (mine !== summaryRequest) return;
    for (const { stat, spark } of STATS) {
      const element = document.getElementById(stat);
      element.value = "—";
      element.delta = undefined;
      element.period = undefined;
      document.getElementById(spark).values = [];
    }
  } finally {
    if (mine === summaryRequest) overview.removeAttribute("aria-busy");
  }
}

async function loadEvents(page, sort) {
  const mine = ++eventsRequest;
  table.loading = true;
  table.error = undefined;
  try {
    const answer = await source.listEvents(propertyId, {
      page,
      pageSize: PAGE_SIZE,
      ...(sort ? { sort } : {}),
    });
    if (mine !== eventsRequest) return;
    table.total = answer.total;
    table.events = answer.events;
    table.page = page;
  } catch {
    if (mine !== eventsRequest) return;
    // The reason is for the console, not for the page to print.
    table.error = "Events could not be loaded. Try again.";
  } finally {
    if (mine === eventsRequest) table.loading = false;
  }
}

function choose(id) {
  propertyId = id;
  picker.value = id;
  // Back to the first page of the new property, in the order the server gives.
  table.sortKey = "";
  return Promise.all([loadSummary(), loadEvents(1)]);
}

picker.addEventListener("idgChange", (event) => {
  void choose(event.detail.value);
});
// Prevented, so the page is the one that changes, once the events of the page have arrived.
table.addEventListener("idgPageChange", (event) => {
  event.preventDefault();
  void loadEvents(
    event.detail.page,
    table.sortKey === "" ? undefined : { key: table.sortKey, direction: table.sortDirection },
  );
});
table.addEventListener("idgSort", (event) => {
  void loadEvents(1, event.detail);
});

const log = [];
for (const name of ["idgChange", "idgPageChange", "idgSort"]) {
  document.addEventListener(name, (event) => {
    log.push({ type: event.type, detail: event.detail ?? null, target: event.target.localName });
  });
}

async function start() {
  try {
    picker.properties = await source.listProperties();
  } catch {
    picker.properties = [];
    table.error = "Properties could not be loaded.";
  }
  picker.loading = false;
  const first = picker.properties[0];
  const wanted = params.get("property");
  const initial = picker.properties.some((property) => property.id === wanted) ? wanted : first?.id;
  if (initial === undefined) {
    table.loading = false;
    return;
  }
  await choose(initial);
}

window.dashboardFixture = { source, fake, calls: fake.calls, release, log };
document.documentElement.dataset.dashboardBooted = "true";
await start();
document.documentElement.dataset.dashboardReady = "true";
