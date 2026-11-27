import { performance } from "perf_hooks";
import { handleIngest, type IngestAnswer } from "../../../ingest/handle-ingest";
import { createKeyLimiter } from "../../../ingest/key-limiter";
import { readIngestSettings } from "../../../ingest/settings";
import { findActivePropertyIn, storeEventIn, type StrapiLike } from "../../../ingest/strapi-ports";

// Ring 2 endpoint — hand-written, from the seed camis wrote. Strapi answers POST /api/ingest/events
// with it (api::event.ingest-event.handle). auth: false: no caller is authenticated and no role is
// asked, so this handler is the only authorization (cms/protected/README.md lists what it checks).
// camis' generated middlewares run its declared guards first: the per-address throttle, the media
// types, the body size and the cross-origin answers.

/** The parts of Koa's context the handler reads and writes; never the address or the user agent. */
export interface IngestContext {
  readonly request: {
    readonly headers: Readonly<Record<string, string | string[] | undefined>>;
    readonly body?: unknown;
  };
  status: number;
  body: unknown;
  set(field: string, value: string): void;
}

/** Keys counted apart in one minute; past it they share one count (cms/README.md). */
const MAX_TRACKED_KEYS = 10_000;

/** A header sent once; undefined when absent or sent more than once, so neither is trusted. */
const header = (context: IngestContext, name: string): string | undefined => {
  const value = context.request.headers[name];
  return Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value;
};

/** Every value of a header, joined as one list, for a header any value of which counts. */
const headerList = (context: IngestContext, name: string): string | undefined => {
  const value = context.request.headers[name];
  return Array.isArray(value) ? value.join(",") : value;
};

const ERRORS = {
  400: ["ValidationError", "Invalid batch"],
  403: ["ForbiddenError", "Forbidden"],
  404: ["NotFoundError", "Not Found"],
  413: ["PayloadTooLargeError", "Entity too large"],
  415: ["UnsupportedMediaTypeError", "The request body must be application/json or text/plain"],
  429: ["RateLimitError", "Too many requests, please try again later."],
  503: ["ServiceUnavailableError", "Service Unavailable"],
} as const;

/** 202 with an empty body; a refusal in Strapi's error body, which names no field. */
const respond = (context: IngestContext, answer: IngestAnswer): void => {
  if (answer.status === 202) {
    context.status = 202;
    // Koa turns a null body into 204; an empty one keeps the status and sends nothing.
    context.body = "";
    return;
  }
  if (answer.status === 429) context.set("Retry-After", String(answer.retryAfterSeconds));
  const [name, message] = ERRORS[answer.status];
  context.status = answer.status;
  context.body = {
    data: null,
    error: { status: answer.status, name, message, details: {} },
  };
};

export default ({ strapi }: { strapi: StrapiLike }) => {
  const settings = readIngestSettings(process.env);
  const ports = {
    findActiveProperty: findActivePropertyIn(strapi),
    storeEvent: storeEventIn(strapi),
    limiter: createKeyLimiter({
      perMinute: settings.keyRatePerMinute,
      maxTracked: MAX_TRACKED_KEYS,
      now: () => performance.now(),
    }),
    settings,
    // The error's class only: its message may hold the query, the key and the body's values.
    reportFailure: (stage: "lookup" | "store", errorName: string) => {
      strapi.log.error(
        `IngestEvent: the database failed at the ${stage} (${errorName}); answered 503`,
      );
    },
    now: () => Date.now(),
  };
  return {
    async handle(context: IngestContext): Promise<void> {
      const answer = await handleIngest(
        {
          contentType: header(context, "content-type"),
          contentEncoding: headerList(context, "content-encoding"),
          contentLength: header(context, "content-length"),
          origin: header(context, "origin"),
          writeKeyHeader: header(context, "x-idg-write-key"),
          body: context.request.body,
        },
        ports,
      );
      respond(context, answer);
    },
  };
};
