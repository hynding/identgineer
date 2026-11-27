// Ring 2 middleware — hand-written, from the seed camis wrote. Strapi runs it around Property's
// create and update routes (global::drop-client-ingest-key), after their policies and before the
// controller reads the body. A property's ingest key is the server's: the IssueIngestKey hook issues
// it on create, and nothing a client sends may set or change it, so a key in the body is dropped
// before validation (a unique check on a client's value would tell whether that key exists).

/** The part of Koa's context the middleware reads and writes. */
export interface WriteContext {
  readonly request: { body?: unknown };
}

const FIELD = "ingestKey";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const owns = (source: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(source, key);

/** The data without the key: a copy of own properties, so an own `__proto__` stays a plain key. */
const withoutKey = (data: Record<string, unknown>): Record<string, unknown> => {
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (key !== FIELD)
      Object.defineProperty(copy, key, {
        value: data[key],
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  return copy;
};

/** The body with the key taken out of its data, or the body itself when its data has none. */
export const bodyWithoutIngestKey = (body: unknown): unknown => {
  if (!isRecord(body)) return body;
  const { data } = body;
  // Any other data (a multipart body's JSON text among them) is refused with 400 by camis'
  // generated controller before Strapi reads it, so only an object can carry a key on.
  return isRecord(data) && owns(data, FIELD) ? { ...body, data: withoutKey(data) } : body;
};

export default () =>
  async (context: WriteContext, next: () => Promise<unknown>): Promise<void> => {
    context.request.body = bodyWithoutIngestKey(context.request.body);
    await next();
  };
