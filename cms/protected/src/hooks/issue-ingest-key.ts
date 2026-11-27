import { randomInt } from "crypto";

// Ring 2 hook — hand-written, from the seed camis wrote. Runs before a Property is created; what
// it returns is written with it.

/**
 * The generated contract (src/hooks/contracts/issue-ingest-key.contract.ts), restated so this file
 * type-checks without the generated project.
 */
interface IssueIngestKeyHook {
  run(input: { ingestKey: string }): { ingestKey: string };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Random characters after `pk_`: 40 of 62 (238 bits), within Property.ingestKey's 19 to 61. */
export const INGEST_KEY_RANDOM_LENGTH = 40;

/** `pk_` and 40 characters from Node's cryptographically secure generator. */
export const newIngestKey = (): string => {
  let key = "pk_";
  for (let index = 0; index < INGEST_KEY_RANDOM_LENGTH; index += 1) {
    key += ALPHABET.charAt(randomInt(ALPHABET.length));
  }
  return key;
};

export const issueIngestKey: IssueIngestKeyHook = {
  /** Ignores the key the client sent: a client never chooses its key. */
  run() {
    return { ingestKey: newIngestKey() };
  },
};
