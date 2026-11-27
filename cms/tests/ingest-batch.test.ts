import { describe, expect, it } from "vitest";
import { parseTrackingBatchText } from "../../packages/tracking/src/parse-tracking-batch.ts";
import { loadBatchVectors } from "../../packages/tracking/src/testing/batch-vectors.ts";
import { parseBatch, parseBatchText } from "../protected/src/ingest/batch.ts";

// The Strapi handler's own copy of the wire format's validator: Strapi builds the protected files
// as a project of its own, which cannot import @identgineer/tracking. The shared vectors hold it
// to parseTrackingBatch, as they hold the strapi-php handler (PHPUnit) and the SDK.

const vectors = loadBatchVectors().map((vector) => [vector.name, vector] as const);

describe("the Strapi handler's batch validator", () => {
  it.each(vectors)("%s: agrees with the shared vector, as text (a beacon)", (_name, vector) => {
    expect(parseBatchText(vector.body).ok).toBe(vector.valid);
  });

  // koa-body hands a JSON body over parsed (JSON.parse, objects and lists only at the top).
  it.each(vectors)("%s: agrees as a parsed JSON body (fetch)", (_name, vector) => {
    let decoded: unknown;
    try {
      decoded = JSON.parse(vector.body);
    } catch {
      return;
    }
    expect(parseBatch(decoded).ok).toBe(vector.valid);
  });

  it.each(vectors.filter(([, vector]) => vector.valid))(
    "%s: returns what parseTrackingBatch returns",
    (_name, vector) => {
      const ours = parseBatchText(vector.body);
      const sdk = parseTrackingBatchText(vector.body);
      expect(ours.ok && sdk.ok ? ours.value : undefined).toEqual(sdk.ok ? sdk.value : "no value");
    },
  );

  it("names the field and the rule it refuses", () => {
    const result = parseBatchText(
      '{"v":1,"sentAt":1,"transport":"fetch","events":[{"id":"AAAAAAAAAAAAAAAAAAAAAA","name":"a","at":1,"ip":"1.2.3.4"}]}',
    );
    expect(result).toEqual({ ok: false, error: "events[0].ip: is not allowed" });
  });

  it("refuses a value that is not a plain object at the top, such as a class instance", () => {
    expect(parseBatch(new Map()).ok).toBe(false);
    expect(parseBatch(Object.create({ v: 1 }) as unknown).ok).toBe(false);
  });
});
