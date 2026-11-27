// The dashboard seam (`DashboardSource` of @identgineer/components) as the CMS source answers it,
// restated because this package may not import the components package. A type test in the
// components package holds `createCmsDashboardSource`'s result assignable to `DashboardSource`.

export interface CmsTrackedProperty {
  /** The property's document id in the CMS: the id `listEvents` and `summary` take. */
  readonly id: string;
  readonly name: string;
  /** `https://` and the property's domain. */
  readonly origin?: string;
}

export type CmsEventPropertyValue = string | number | boolean | null;

export interface CmsTrackedEvent {
  readonly id: string;
  readonly name: string;
  /** ISO 8601 in UTC. */
  readonly occurredAt: string;
  readonly path?: string;
  readonly properties?: Readonly<Record<string, CmsEventPropertyValue>>;
}

export interface CmsEventQuery {
  /** From 1. */
  readonly page: number;
  /** From 1 to `MAX_DASHBOARD_PAGE_SIZE` (25, the CMS's page cap). */
  readonly pageSize: number;
  /** Newest first when left out. */
  readonly sort?: {
    readonly key: "time" | "name";
    readonly direction: "ascending" | "descending";
  };
}

export interface CmsEventPage {
  readonly events: readonly CmsTrackedEvent[];
  readonly total: number;
}

export type CmsStatRange = "24h" | "7d" | "30d";

export interface CmsStatMetric {
  readonly value: number;
  readonly previous?: number;
  readonly series: readonly number[];
}

export interface CmsStatSummary {
  readonly propertyId: string;
  readonly range: CmsStatRange;
  readonly visitors: CmsStatMetric;
  readonly pageViews: CmsStatMetric;
  readonly events: CmsStatMetric;
}

export interface CmsDashboardSource {
  readonly listProperties: () => Promise<readonly CmsTrackedProperty[]>;
  readonly listEvents: (propertyId: string, query: CmsEventQuery) => Promise<CmsEventPage>;
  readonly summary: (propertyId: string, range: CmsStatRange) => Promise<CmsStatSummary>;
}

/** The `fetch` the source sends with; the identity SDK's `authorizedFetch` is one. */
export type CmsDashboardFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface CmsDashboardSourceOptions {
  /** The CMS's address: `https:`, or `http:` on localhost. */
  readonly baseUrl: string;
  /** Sends the signed-in user's requests with their credentials: `authorizedFetch` in production. */
  readonly fetch: CmsDashboardFetch;
}
