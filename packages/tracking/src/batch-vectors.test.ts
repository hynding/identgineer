import { describe, expect, it } from "vitest";
import { parseTrackingBatchText } from "./parse-tracking-batch.ts";
import { loadBatchVectors } from "./testing/batch-vectors.ts";
import { utf8Length } from "./utf8-length.ts";
import { MAX_TRACKING_BATCH_BYTES } from "./wire-format.ts";

const vectors = loadBatchVectors();

describe("the shared batch vectors", () => {
  it("have unique names and fit the body cap", () => {
    expect(new Set(vectors.map((vector) => vector.name)).size).toBe(vectors.length);
    for (const vector of vectors) {
      expect(utf8Length(vector.body), vector.name).toBeLessThanOrEqual(MAX_TRACKING_BATCH_BYTES);
    }
  });

  it.each(vectors.map((vector) => [vector.name, vector] as const))(
    "%s: parseTrackingBatchText agrees",
    (_name, vector) => {
      expect(parseTrackingBatchText(vector.body).ok).toBe(vector.valid);
    },
  );
});
