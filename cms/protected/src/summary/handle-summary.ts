import type { SummaryFigures } from "./summary-figures";
import {
  isSummaryRange,
  summaryWindow,
  type SummaryRange,
  type SummaryWindow,
} from "./summary-window";

/** The parts of a request the handler reads. */
export interface SummaryRequest {
  /** The path's `:id`: the property's document id. */
  readonly propertyId: unknown;
  /** The query's `range`, as the query parser left it (a list when it was sent twice). */
  readonly range: unknown;
  /** The signed-in user's id; absent for an API token, which has no user to own anything. */
  readonly userId: unknown;
}

export interface OwnedProperty {
  /** The row the events' property relation points at. */
  readonly id: number;
}

export interface SummaryPorts {
  /**
   * The property with this document id when the user owns it, in one query that asks for both, so
   * a property of someone else costs what a missing one does.
   */
  readonly findOwnedProperty: (
    documentId: string,
    userId: number,
  ) => Promise<OwnedProperty | undefined>;
  readonly countEvents: (window: SummaryWindow, propertyRowId: number) => Promise<SummaryFigures>;
  /** Told that the database failed at a stage, with the error's class only. */
  readonly reportFailure: (stage: "lookup" | "count", errorName: string) => void;
  /** The server's clock, in epoch milliseconds. */
  readonly now: () => number;
}

export interface SummaryBody {
  readonly data: { readonly propertyId: string; readonly range: SummaryRange } & SummaryFigures;
}

export type SummaryAnswer =
  { readonly status: 200; readonly body: SummaryBody } | { readonly status: 400 | 403 | 404 | 503 };

// What a document id is made of on both targets (Strapi's are 24 lower-case letters and digits);
// anything else names no property, and is answered as one that does not exist.
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

const errorName = (error: unknown): string =>
  error instanceof Error ? error.constructor.name : typeof error;

/**
 * GET /api/properties/:id/summary for a signed-in user. The handler is the ownership check: a
 * property that does not exist and one that is not the caller's are both 404, after the same one
 * lookup. A range other than 24h, 7d or 30d is 400, before any lookup. A caller without a user (an
 * API token, which the route lets through) is 403. A database failure is 503, reported by the
 * error's class only.
 */
export async function handleSummary(
  request: SummaryRequest,
  ports: SummaryPorts,
): Promise<SummaryAnswer> {
  const { range, propertyId, userId } = request;
  if (!isSummaryRange(range)) return { status: 400 };
  if (typeof userId !== "number" || !Number.isSafeInteger(userId)) return { status: 403 };
  if (typeof propertyId !== "string" || !DOCUMENT_ID.test(propertyId)) return { status: 404 };
  let property: OwnedProperty | undefined;
  try {
    property = await ports.findOwnedProperty(propertyId, userId);
  } catch (error) {
    ports.reportFailure("lookup", errorName(error));
    return { status: 503 };
  }
  if (property === undefined) return { status: 404 };
  const window = summaryWindow(ports.now(), range);
  let figures: SummaryFigures;
  try {
    figures = await ports.countEvents(window, property.id);
  } catch (error) {
    ports.reportFailure("count", errorName(error));
    return { status: 503 };
  }
  return { status: 200, body: { data: { propertyId, range, ...figures } } };
}
