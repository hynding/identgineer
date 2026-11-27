import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SummaryFigures } from "../protected/src/summary/summary-figures.ts";
import type { SummaryRange } from "../protected/src/summary/summary-window.ts";

// The property summary's shared vectors (fixtures/property-summary-vectors.json), read by the
// TypeScript tests; the PHP tests read the same file.

export interface VectorEvent {
  readonly name: string;
  readonly occurredAt: string;
  readonly sessionId: string | null;
  /** Stored for another property, so it must never count. */
  readonly other?: boolean;
}

export interface SummaryVector {
  readonly name: string;
  readonly now: string;
  readonly range: SummaryRange;
  readonly events: readonly VectorEvent[];
  readonly expected: SummaryFigures;
}

export const SUMMARY_VECTORS_PATH = fileURLToPath(
  new URL("./fixtures/property-summary-vectors.json", import.meta.url),
);

export const loadSummaryVectors = (): SummaryVector[] =>
  (JSON.parse(readFileSync(SUMMARY_VECTORS_PATH, "utf8")) as { vectors: SummaryVector[] }).vectors;
