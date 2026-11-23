import {
  DashboardError,
  EVENT_SORT_KEYS,
  STAT_RANGES,
  type DashboardSource,
  type EventPage,
  type EventQuery,
  type StatRange,
  type StatSummary,
  type TrackedProperty,
} from "./dashboard-types";
import {
  DASHBOARD_LIMITS,
  parseEventPage,
  parseStatSummary,
  parseTrackedProperties,
} from "./parse-dashboard-data";

type Method = "listProperties" | "listEvents" | "summary";

// A failure the page can act on is passed on as it is. Anything else (a network error, a bug in a
// source) may carry a token or an address in its message, so only the fact survives.
async function guarded<T>(method: Method, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof DashboardError) throw error;
    throw new DashboardError("unavailable", `${method}: the source could not answer`);
  }
}

function invalidResponse(method: Method, what: string): DashboardError {
  return new DashboardError("invalid-response", `${method}: the response is not ${what}`);
}

function invalidRequest(method: Method, what: string): DashboardError {
  return new DashboardError("invalid-request", `${method}: ${what}`);
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim() !== "" && value.length <= DASHBOARD_LIMITS.idLength
  );
}

function wholeNumberBetween(value: unknown, least: number, most: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= least && value <= most;
}

function checkQuery(propertyId: unknown, query: EventQuery): DashboardError | undefined {
  if (!isIdentifier(propertyId)) return invalidRequest("listEvents", "the property id is empty");
  if (!wholeNumberBetween(query.page, 1, Number.MAX_SAFE_INTEGER)) {
    return invalidRequest("listEvents", "the page must be a whole number from 1");
  }
  if (!wholeNumberBetween(query.pageSize, 1, DASHBOARD_LIMITS.pageSize)) {
    return invalidRequest(
      "listEvents",
      `the page size must be a whole number from 1 to ${String(DASHBOARD_LIMITS.pageSize)}`,
    );
  }
  // Typed as unknown: the call may come from script, which checks nothing.
  const sort: { key?: unknown; direction?: unknown } | undefined = query.sort;
  if (
    sort !== undefined &&
    (!EVENT_SORT_KEYS.some((key) => key === sort.key) ||
      (sort.direction !== "ascending" && sort.direction !== "descending"))
  ) {
    return invalidRequest("listEvents", "the sort is not by time or name, ascending or descending");
  }
  return undefined;
}

/**
 * A source whose every answer has been checked by the validators, so the page and the components
 * only ever see records that are well formed. What cannot be used rejects with a `DashboardError`
 * that names the call: `invalid-response` for an answer that is the wrong shape (or for the wrong
 * property or range), `invalid-request` for a call that makes no sense, which is never sent, and
 * `unavailable` for any other failure, without its message. A `DashboardError` from the source
 * passes through as it was.
 */
export function validatedSource(source: DashboardSource): DashboardSource {
  return {
    listProperties: () =>
      guarded("listProperties", async (): Promise<readonly TrackedProperty[]> => {
        const answer: unknown = await source.listProperties();
        if (!Array.isArray(answer)) throw invalidResponse("listProperties", "a list of properties");
        return parseTrackedProperties(answer);
      }),

    listEvents: (propertyId: string, query: EventQuery) => {
      const refusal = checkQuery(propertyId, query);
      if (refusal) return Promise.reject(refusal);
      return guarded("listEvents", async (): Promise<EventPage> => {
        const page = parseEventPage(await source.listEvents(propertyId, query));
        if (!page) throw invalidResponse("listEvents", "a page of events");
        return page;
      });
    },

    summary: (propertyId: string, range: StatRange) => {
      if (!isIdentifier(propertyId) || !STAT_RANGES.includes(range)) {
        return Promise.reject(
          invalidRequest("summary", "the property id or the range is not valid"),
        );
      }
      return guarded("summary", async (): Promise<StatSummary> => {
        const summary = parseStatSummary(await source.summary(propertyId, range));
        if (!summary) throw invalidResponse("summary", "a summary");
        if (summary.propertyId !== propertyId || summary.range !== range) {
          throw invalidResponse("summary", "the summary that was asked for");
        }
        return summary;
      });
    },
  };
}
