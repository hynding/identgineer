# Dashboard components in React

The dashboard elements are custom elements that take their data as JavaScript properties. React
needs only a ref for that: React 18 would write an object prop as the attribute
`events="[object Object]"`, and React 19 does the same while the element is not yet defined. The
page asks a `DashboardSource` and hands the answers to the elements; the elements never fetch.
Read [rules.md](./rules.md) for what the source must enforce and how the elements treat text from
the public internet.

## 1. The source and the components

```ts
// dashboard-source.ts
import { validatedSource, type DashboardSource } from "@identgineer/components";
import { createApiSource } from "./api-source"; // the app's own, over its authenticated API

export const source: DashboardSource = validatedSource(createApiSource());
```

```tsx
// main.tsx
import { defineCustomElements } from "@identgineer/components/loader";

void defineCustomElements();
```

Load `/tokens/index.css`, and put the pre-hydration rule from
[plain-html.md](./plain-html.md#1-load-the-tokens-and-the-components) in a stylesheet.

## 2. Types for JSX

```tsx
// dashboard-elements.d.ts
import type { Components } from "@identgineer/components";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type Element<T> = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Partial<T>;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "idg-property-picker": Element<Pick<Components.IdgPropertyPicker, "label" | "loading">>;
      "idg-event-table": Element<
        Pick<Components.IdgEventTable, "caption" | "sortable" | "loading" | "total">
      >;
      "idg-sparkline": Element<Pick<Components.IdgSparkline, "label" | "area">>;
      "idg-stat": Element<Pick<Components.IdgStat, "label" | "value" | "delta" | "direction">>;
    }
  }
}
```

## 3. A hook that sets properties and listens

```tsx
// use-element.ts
import { useEffect, useRef } from "react";

/**
 * A ref for a custom element: `properties` are set on it as properties and `listeners` added as
 * event listeners, removed again when the component goes.
 */
export function useElement<T extends HTMLElement>(
  properties: Record<string, unknown>,
  listeners: Record<string, (event: CustomEvent) => void> = {},
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    Object.assign(element, properties);
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const entries = Object.entries(listeners).map(
      ([type, listener]) => [type, (event: Event) => listener(event as CustomEvent)] as const,
    );
    for (const [type, listener] of entries) element.addEventListener(type, listener);
    return () => {
      for (const [type, listener] of entries) element.removeEventListener(type, listener);
    };
  });
  return ref;
}
```

## 4. The dashboard

Each request carries a counter, so an answer that arrives after the user moved on is dropped:

```tsx
import type {
  EventSort,
  StatSummary,
  TrackedEvent,
  TrackedProperty,
} from "@identgineer/components";
import { useEffect, useRef, useState } from "react";
import { source } from "./dashboard-source";
import { useElement } from "./use-element";

export function Dashboard() {
  const [properties, setProperties] = useState<readonly TrackedProperty[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [events, setEvents] = useState<readonly TrackedEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<EventSort | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [summary, setSummary] = useState<StatSummary | undefined>();
  const request = useRef(0);

  useEffect(() => {
    void source.listProperties().then((list) => {
      setProperties(list);
      setPropertyId(list[0]?.id ?? "");
    });
  }, []);

  useEffect(() => {
    if (propertyId === "") return;
    const mine = ++request.current;
    setLoading(true);
    setError(undefined);
    source
      .listEvents(propertyId, { page, pageSize: 10, ...(sort ? { sort } : {}) })
      .then((answer) => {
        if (mine !== request.current) return;
        setEvents(answer.events);
        setTotal(answer.total);
      })
      .catch(() => {
        if (mine === request.current) setError("Events could not be loaded. Try again.");
      })
      .finally(() => {
        if (mine === request.current) setLoading(false);
      });
    void source.summary(propertyId, "7d").then(setSummary);
  }, [propertyId, page, sort]);

  const picker = useElement<HTMLElement>(
    { properties, value: propertyId },
    {
      idgChange: (event) => {
        setPropertyId((event.detail as { value: string }).value);
        setPage(1);
        setSort(undefined);
      },
    },
  );
  const table = useElement<HTMLElement>(
    { events, total, page, loading, error },
    {
      idgPageChange: (event) => {
        event.preventDefault();
        setPage((event.detail as { page: number }).page);
      },
      idgSort: (event) => {
        setSort(event.detail as EventSort);
        setPage(1);
      },
    },
  );
  const spark = useElement<HTMLElement>({ values: summary?.visitors.series ?? [] });

  return (
    <>
      <idg-property-picker ref={picker} label="Property" />
      <idg-stat label="Visitors" value={String(summary?.visitors.value ?? "—")}>
        <idg-sparkline ref={spark} slot="chart" label="Visitors, last 7 days" area />
      </idg-stat>
      <idg-event-table ref={table} caption="Tracked events" sortable />
    </>
  );
}
```

Preventing `idgPageChange` leaves the page to your state: the table moves when `page` changes.
Keep the objects you pass stable between renders (`useMemo`, or state as above).

## 5. Text

`labels` is a property too. Pass a partial object of strings, which is merged over the English
defaults:

```tsx
const GERMAN = { labels: { empty: "Keine Ereignisse", loading: "Ereignisse werden geladen" } };

const table = useElement<HTMLElement>({ ...GERMAN, events });
```

## 6. Server rendering

The elements draw nothing on the server. Call `defineCustomElements()` on the client only, for
example in a `"use client"` module in Next.js, and fetch through the authenticated API from the
client or a server component, never with the user's session cookie forwarded by hand. The server's
HTML then has the bare tags, which the pre-hydration rule keeps out of sight until they hydrate.
