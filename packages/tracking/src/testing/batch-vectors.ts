import { readFileSync } from "node:fs";

/** A request body of the ingestion endpoint and whether `parseTrackingBatchText` accepts it. */
export interface BatchVector {
  readonly name: string;
  readonly valid: boolean;
  readonly body: string;
}

/**
 * The path of `batch-vectors.json`, which every validator of the wire format is held to: this
 * package's, and the CMS handlers' on both targets (the PHP tests read the same file).
 */
export const BATCH_VECTORS_PATH = new URL("./batch-vectors.json", import.meta.url);

export const loadBatchVectors = (): readonly BatchVector[] =>
  (JSON.parse(readFileSync(BATCH_VECTORS_PATH, "utf8")) as { vectors: BatchVector[] }).vectors;
