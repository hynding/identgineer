# Dashboard components in Angular

The dashboard elements are custom elements that take their data as JavaScript properties. Angular
binds `[events]="events"` as a property of the element, which is what they need. The page asks a
`DashboardSource` and hands the answers to the elements; the elements never fetch. Read
[rules.md](./rules.md) for what the source must enforce and how the elements treat text from the
public internet.

## 1. The source and the components

```ts
// dashboard-source.ts
import { InjectionToken } from "@angular/core";
import { validatedSource, type DashboardSource } from "@identgineer/components";
import { createCmsDashboardSource } from "@identgineer/tracking/dashboard";
import { identity } from "./identity"; // the app's createIdentityClient(...) from @identgineer/identity

// Every call is made as the signed-in user: the CMS answers only that user's properties.
const cms = createCmsDashboardSource({
  baseUrl: "https://cms.example.com",
  fetch: identity.authorizedFetch,
});

export const DASHBOARD_SOURCE = new InjectionToken<DashboardSource>("dashboard source", {
  providedIn: "root",
  factory: () => validatedSource(cms),
});
```

```ts
// main.ts
import { bootstrapApplication } from "@angular/platform-browser";
import { defineCustomElements } from "@identgineer/components/loader";
import { AppComponent } from "./app/app.component";

void defineCustomElements();
bootstrapApplication(AppComponent);
```

Load `/tokens/index.css`, and put the pre-hydration rule from
[plain-html.md](./plain-html.md#1-load-the-tokens-and-the-components) in a global stylesheet.

## 2. The dashboard

Allow the `idg-` elements with `CUSTOM_ELEMENTS_SCHEMA`. A property binding set before the element
is defined is kept as an own property, and the element takes it up when it upgrades. Each request
carries a counter, so an answer that arrives after the user moved on is dropped:

```ts
// dashboard.component.ts
import { CUSTOM_ELEMENTS_SCHEMA, Component, inject, type OnInit } from "@angular/core";
import type {
  EventSort,
  StatSummary,
  TrackedEvent,
  TrackedProperty,
} from "@identgineer/components";
import { DASHBOARD_SOURCE } from "./dashboard-source";

@Component({
  selector: "app-dashboard",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <idg-property-picker
      label="Property"
      [properties]="properties"
      [value]="propertyId"
      (idgChange)="chose($event)"
    ></idg-property-picker>
    <idg-stat label="Visitors" [value]="visitors">
      <idg-sparkline
        slot="chart"
        label="Visitors, last 7 days"
        area
        [values]="summary?.visitors?.series ?? []"
      ></idg-sparkline>
    </idg-stat>
    <idg-event-table
      caption="Tracked events"
      sortable
      [events]="events"
      [total]="total"
      [page]="page"
      [loading]="loading"
      [error]="error"
      (idgPageChange)="changed($event)"
      (idgSort)="sorted($event)"
    ></idg-event-table>
  `,
})
export class DashboardComponent implements OnInit {
  private readonly source = inject(DASHBOARD_SOURCE);
  private request = 0;
  private sort: EventSort | undefined;

  protected properties: readonly TrackedProperty[] = [];
  protected propertyId = "";
  protected events: readonly TrackedEvent[] = [];
  protected total = 0;
  protected page = 1;
  protected loading = true;
  protected error: string | undefined;
  protected summary: StatSummary | undefined;

  protected get visitors(): string {
    return String(this.summary?.visitors.value ?? "—");
  }

  async ngOnInit(): Promise<void> {
    this.properties = await this.source.listProperties();
    this.propertyId = this.properties[0]?.id ?? "";
    await this.load();
  }

  protected chose(event: Event): void {
    this.propertyId = (event as CustomEvent<{ value: string }>).detail.value;
    this.page = 1;
    this.sort = undefined;
    void this.load();
  }

  protected changed(event: Event): void {
    event.preventDefault();
    this.page = (event as CustomEvent<{ page: number }>).detail.page;
    void this.load();
  }

  protected sorted(event: Event): void {
    this.sort = (event as CustomEvent<EventSort>).detail;
    this.page = 1;
    void this.load();
  }

  private async load(): Promise<void> {
    if (this.propertyId === "") return;
    const mine = ++this.request;
    this.loading = true;
    this.error = undefined;
    try {
      const answer = await this.source.listEvents(this.propertyId, {
        page: this.page,
        pageSize: 10,
        ...(this.sort ? { sort: this.sort } : {}),
      });
      if (mine !== this.request) return;
      this.events = answer.events;
      this.total = answer.total;
      this.summary = await this.source.summary(this.propertyId, "7d");
    } catch {
      if (mine === this.request) this.error = "Events could not be loaded. Try again.";
    } finally {
      if (mine === this.request) this.loading = false;
    }
  }
}
```

Preventing `idgPageChange` leaves the page to your state: the table moves when `page` changes.
Keep the arrays and objects you bind in fields, so the same one is passed on every change detection.

## 3. Text

`labels` is a property too. Pass a partial object of strings, which is merged over the English
defaults:

```ts
protected readonly labels = { empty: "Keine Ereignisse", loading: "Ereignisse werden geladen" };
```

```html
<idg-event-table caption="Ereignisse" [labels]="labels"></idg-event-table>
```

## 4. Server rendering

The elements draw nothing on the server. Call `defineCustomElements()` in the browser only (behind
`isPlatformBrowser`), and ask the source from the browser. The server's HTML then has the bare
tags, which the pre-hydration rule keeps out of sight until they hydrate.
