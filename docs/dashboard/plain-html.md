# Dashboard components in plain HTML

Four custom elements of `@identgineer/components` draw a dashboard of tracked events:
`<idg-property-picker>` chooses the property (site) to look at, `<idg-stat>` shows a figure,
`<idg-sparkline>` draws its trend and `<idg-event-table>` lists the events one page at a time.
They are **presentational**: each takes its data as JavaScript properties and never fetches,
never stores and never imports the API's client. The page asks a **source**, a
`DashboardSource` that the server task implements over the authenticated API, and hands the
answers to the elements. Read [rules.md](./rules.md) for what the source must enforce and how the
elements treat text that came from the public internet.

## 1. Load the tokens and the components

The components are styled by the design tokens and loaded by the lazy loader of the built package
(`dist/identgineer/identgineer.esm.js`, served here as `/build/identgineer.esm.js`):

```html
<!doctype html>
<html lang="en" data-theme="aurora" data-design="flat" data-layout="top-bar" data-ux="comfortable">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="/tokens/index.css" />
    <link rel="stylesheet" href="/dashboard.css" />
    <script type="module" src="/build/identgineer.esm.js"></script>
    <script type="module" src="/dashboard.js"></script>
  </head>
</html>
```

Hide the elements until they have hydrated, so a browser does not draw them half-made. The rule
belongs in a stylesheet, not inline, because of the Content-Security-Policy in
[rules.md](./rules.md#csp):

```css
/* dashboard.css */
idg-property-picker:not(.hydrated),
idg-event-table:not(.hydrated),
idg-sparkline:not(.hydrated) {
  visibility: hidden;
}
```

## 2. The markup

A sparkline goes in the `chart` slot of a stat, and the stat sits in whatever surface the page
likes. Every element that stands alone has a name: the picker a `label`, the table a `caption`,
a sparkline a `label` (the stat's own name, say).

```html
<header>
  <idg-property-picker id="picker" label="Property" loading></idg-property-picker>
</header>

<main>
  <section id="overview" aria-labelledby="overview-title">
    <h2 id="overview-title">Overview</h2>
    <idg-card>
      <idg-stat id="stat-visitors" label="Visitors" value="—">
        <idg-sparkline id="spark-visitors" slot="chart" label="Visitors, last 7 days" area>
        </idg-sparkline>
      </idg-stat>
    </idg-card>
  </section>

  <section aria-labelledby="events-title">
    <h2 id="events-title">Events</h2>
    <idg-event-table id="events" caption="Tracked events" sortable loading></idg-event-table>
  </section>
</main>
```

## 3. Ask the source and hand the answers over

The page owns the requests. Guard each with a counter, so an answer that arrives after the user
has moved on is dropped:

```js
// dashboard.js
import { DashboardError, validatedSource } from "@identgineer/components";
import { createApiSource } from "./api-source.js"; // the page's own, over its authenticated API

// validatedSource checks every answer and every request against the contract, and never lets a
// raw failure through: what it throws is a DashboardError.
const source = validatedSource(createApiSource());

const picker = document.getElementById("picker");
const table = document.getElementById("events");
let propertyId = "";
let eventsRequest = 0;

// The order the table shows, as the source wants it; none means the server's own (newest first).
const sortOf = (element) =>
  element.sortKey === "" ? undefined : { key: element.sortKey, direction: element.sortDirection };

async function loadEvents(page, sort) {
  const mine = ++eventsRequest;
  table.loading = true;
  table.error = undefined;
  try {
    const answer = await source.listEvents(propertyId, { page, pageSize: 10, sort });
    if (mine !== eventsRequest) return;
    table.total = answer.total; // with a total, the table draws the events as given
    table.events = answer.events;
    table.page = page;
  } catch (error) {
    if (mine !== eventsRequest) return;
    // The reason is for the console, not for the page to print.
    console.debug(error instanceof DashboardError ? error.code : "failed");
    table.error = "Events could not be loaded. Try again.";
  } finally {
    if (mine === eventsRequest) table.loading = false;
  }
}

picker.properties = await source.listProperties();
picker.loading = false;
```

The types of the seam are exported for TypeScript: `TrackedProperty`, `TrackedEvent`, `EventQuery`,
`EventPage`, `StatSummary`, `StatMetric`, `StatRange` and `DashboardSource`. The parsers
`parseTrackedProperties`, `parseTrackedEvents`, `parseEventPage` and `parseStatSummary` are the
same ones `validatedSource` uses, for a source that wants to check what it builds.

## 4. Events

Every event bubbles out of the shadow root and has `composed: true`.

| Element               | Event           | Detail                                                               |
| --------------------- | --------------- | -------------------------------------------------------------------- |
| `idg-property-picker` | `idgChange`     | `{ value }`: the id of the property chosen                           |
| `idg-event-table`     | `idgPageChange` | `{ page }`, cancelable; the table keeps its page when you prevent it |
| `idg-event-table`     | `idgSort`       | `{ key, direction }`: `time` or `name`, `ascending` or `descending`  |

```js
picker.addEventListener("idgChange", (event) => {
  propertyId = event.detail.value;
  table.sortKey = "";
  void loadEvents(1);
});

// Prevented, so the page is the one that changes, once the events of the page have arrived.
table.addEventListener("idgPageChange", (event) => {
  event.preventDefault();
  void loadEvents(event.detail.page, sortOf(table));
});

table.addEventListener("idgSort", (event) => {
  void loadEvents(1, event.detail);
});
```

Without `total`, the table keeps all the events it was given and sorts and pages them itself, which
suits a short list. With `total`, the server pages and sorts and the table draws what it is given.

## 5. The stats

```js
const summary = await source.summary(propertyId, "7d");
const visitors = document.getElementById("stat-visitors");
visitors.value = new Intl.NumberFormat(document.documentElement.lang).format(
  summary.visitors.value,
);
visitors.delta = "12%";
visitors.direction = "up";
visitors.period = "vs the 7 days before";
document.getElementById("spark-visitors").values = summary.visitors.series;
```

`period` says what the change is measured against; it is shown beside the change and spoken with
it. A sparkline's `values` may be an array of numbers or a string of comma-separated numbers; a
value that is not a finite number is dropped, and a long series is thinned to its shape.

## 6. Properties

| Element               | Property                                         | What it does                                                         |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| `idg-property-picker` | `properties`, `value`, `label`                   | The choices (`TrackedProperty[]`), the chosen id, its name           |
| `idg-property-picker` | `loading`, `disabled`, `name`                    | A loading state, off, and the name it submits under in a form        |
| `idg-property-picker` | `setFocus()`                                     | Focus the select                                                     |
| `idg-event-table`     | `events`, `caption`, `loading`, `error`          | The rows, the table's name, a loading state, an error message        |
| `idg-event-table`     | `page`, `pageSize`, `total`                      | The page from 1, the rows per page (at most 100), the server's count |
| `idg-event-table`     | `sortable`, `sortKey`, `sortDirection`           | Header buttons, and the order that is shown                          |
| `idg-event-table`     | `timeZone`                                       | An IANA zone for the time column, the viewer's by default            |
| `idg-sparkline`       | `values`, `label`, `area`                        | The series, its name, a filled area under the line                   |
| `idg-stat`            | `label`, `value`, `delta`, `direction`, `period` | The figure and its change (`period` is new)                          |

Every element also takes `labels`, a partial object of its strings merged over the English
defaults (`PropertyPickerLabels`, `EventTableLabels`, `SparklineLabels`). See
[rules.md](./rules.md#localisation).
