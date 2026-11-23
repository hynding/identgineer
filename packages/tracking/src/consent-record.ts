import { MAX_TIMESTAMP } from "./wire-format.ts";

export type ConsentChoice = "granted" | "denied";

export interface ConsentRecord {
  readonly state: ConsentChoice;
  readonly version: number;
  readonly decidedAt: number;
}

const MAX_RECORD_LENGTH = 200;

export const serialiseConsentRecord = (record: ConsentRecord): string =>
  JSON.stringify({ state: record.state, version: record.version, decidedAt: record.decidedAt });

const isChoice = (value: unknown): value is ConsentChoice =>
  value === "granted" || value === "denied";

/**
 * The stored choice, or `undefined` for anything this SDK would not have written: other text, other
 * keys, an unknown state, or a record of another version, which counts as no decision at all.
 */
export const parseConsentRecord = (text: string, version: number): ConsentRecord | undefined => {
  if (text.length > MAX_RECORD_LENGTH) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
  const keys = Object.keys(parsed).sort().join(",");
  if (keys !== "decidedAt,state,version") return undefined;
  const { state, version: stored, decidedAt } = parsed as Record<string, unknown>;
  if (!isChoice(state) || stored !== version) return undefined;
  if (typeof decidedAt !== "number" || !Number.isInteger(decidedAt)) return undefined;
  if (decidedAt < 0 || decidedAt > MAX_TIMESTAMP) return undefined;
  return { state, version, decidedAt };
};
